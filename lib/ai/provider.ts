import { z } from "zod";
import { GEMINI_TEXT_MODELS } from "@/lib/ai/models";

export const parsedNoteSchema = z.object({
  title: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  value: z.number().nullable().default(null),
  number: z.number().nullable().default(null),
  status: z.enum(["pending", "in_progress", "completed"]).nullable().default(null),
});

export type ParsedNote = z.infer<typeof parsedNoteSchema>;
export type AIUsage = { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
export type AIParseResult = { notes: ParsedNote[]; usage: AIUsage | null };
export type AIQuestionResult = { answer: string; usage: AIUsage | null };

export interface AIProvider {
  parseNote(input: { modelName: string; context: string; fields: string[]; content: string; aiModel?: string }): Promise<AIParseResult>;
  answerQuestion(input: { question: string; context: string; aiModel?: string }): Promise<AIQuestionResult>;
}

function getTextFromOpenRouter(body: { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }) {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("");
  return null;
}

function getOpenRouterUsage(body: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }): AIUsage | null {
  if (!body.usage) return null;
  return { promptTokenCount: body.usage.prompt_tokens, candidatesTokenCount: body.usage.completion_tokens, totalTokenCount: body.usage.total_tokens };
}

async function requestOpenRouter(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://dabliunotes.space",
      "X-Title": "Dabliu.notes",
    },
    body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "openrouter/free", ...body }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const providerBody = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(providerBody) as { error?: { message?: string } };
      providerMessage = parsed.error?.message ?? "";
    } catch {
      providerMessage = "";
    }
    throw new Error(`OpenRouter request failed: ${response.status}${providerMessage ? ` — ${providerMessage}` : ""}`);
  }
  return response.json();
}

async function requestGemini(apiKey: string, requestedModel: string | undefined, body: Record<string, unknown>) {
  const preferredModel = requestedModel && GEMINI_TEXT_MODELS.includes(requestedModel as (typeof GEMINI_TEXT_MODELS)[number]) ? requestedModel : process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const preferredIndex = GEMINI_TEXT_MODELS.indexOf(preferredModel as (typeof GEMINI_TEXT_MODELS)[number]);
  const fallbackModels = preferredIndex >= 0
    ? [...GEMINI_TEXT_MODELS.slice(preferredIndex), ...GEMINI_TEXT_MODELS.slice(0, preferredIndex)]
    : [preferredModel, ...GEMINI_TEXT_MODELS];
  let lastError = "";
  for (const candidate of [...new Set(fallbackModels)]) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        if (candidate !== preferredModel) console.warn(`[ai] fallback model used: ${candidate}`);
        return response.json();
      }
      const providerBody = await response.text();
      let providerMessage = "";
      try {
        const parsed = JSON.parse(providerBody) as { error?: { message?: string } };
        providerMessage = parsed.error?.message ?? "";
      } catch {
        providerMessage = "";
      }
      lastError = `Gemini request failed: ${response.status}${providerMessage ? ` — ${providerMessage}` : ""}`;
      if (response.status === 401 || response.status === 403) throw new Error(lastError);
    } catch (error) {
      if (error instanceof Error && /Gemini request failed: (401|403)/.test(error.message)) throw error;
      lastError = error instanceof Error && error.name === "TimeoutError" ? "Gemini request failed: timeout" : error instanceof Error ? error.message : "Gemini request failed";
    }
  }
  throw new Error(lastError || "Gemini request failed");
}

export class GeminiProvider implements AIProvider {
  async parseNote(input: Parameters<AIProvider["parseNote"]>[0]) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const prompt = `You extract structured notes and tasks. Return JSON only, never markdown.
Model: ${input.modelName}
Context: ${input.context || "none"}
Enabled fields: ${input.fields.join(", ")}
User note: ${input.content}
If the user's text contains multiple tasks, reminders, requests, or distinct actions, split them into separate notes. Return at most 20 notes in this exact shape: {"notes":[{"title":"...","description":"...","date":null,"tags":[],"value":null,"number":null,"status":"pending"}]}. Preserve the meaning of each task. Use null for unavailable values and [] for no tags. Date must be YYYY-MM-DD only; use null when an exact date cannot be inferred (never return words such as tomorrow or next week).`;
    const body = await requestGemini(apiKey, input.aiModel, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } });
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("Gemini returned no text");
    const raw = JSON.parse(text);
    const rawNotes = Array.isArray(raw) ? raw : Array.isArray(raw.notes) ? raw.notes : [raw];
    const notes = rawNotes.slice(0, 20).map((item: Record<string, unknown>) => parsedNoteSchema.parse({
      ...item,
      tags: item.tags ?? (Array.isArray(item.tag) ? item.tag : item.tag ? [item.tag] : []),
    }));
    return { notes, usage: body?.usageMetadata ?? null };
  }

  async answerQuestion(input: Parameters<AIProvider["answerQuestion"]>[0]) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    const prompt = `Você é o modo de perguntas do Dabliu.notes. Responda em português do Brasil, de forma direta e útil, usando somente as tarefas fornecidas abaixo. Não invente tarefas, datas, pessoas ou conclusões. Se não houver informação suficiente, diga isso claramente. Para perguntas sobre "hoje", use a data local informada. Cite o título ou o texto original das tarefas relevantes quando ajudar. Não use markdown pesado; prefira uma resposta curta em parágrafos ou bullets simples.

Data local: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}
Contexto e tarefas disponíveis:
${input.context || "nenhum"}

Pergunta: ${input.question}`;
    const body = await requestGemini(apiKey, input.aiModel, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    });
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("Gemini returned no answer");
    return { answer: text.trim(), usage: body?.usageMetadata ?? null };
  }
}

export class OpenRouterProvider implements AIProvider {
  private getApiKey() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
    return apiKey;
  }

  async parseNote(input: Parameters<AIProvider["parseNote"]>[0]) {
    const prompt = `You extract structured notes and tasks. Return JSON only, never markdown.
Model: ${input.modelName}
Context: ${input.context || "none"}
Enabled fields: ${input.fields.join(", ")}
User note: ${input.content}
If the user's text contains multiple tasks, reminders, requests, or distinct actions, split them into separate notes. Return at most 20 notes in this exact shape: {"notes":[{"title":"...","description":"...","date":null,"tags":[],"value":null,"number":null,"status":"pending"}]}. Preserve the meaning of each task. Use null for unavailable values and [] for no tags. Date must be YYYY-MM-DD only; use null when an exact date cannot be inferred.`;
    const body = await requestOpenRouter(this.getApiKey(), { messages: [{ role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } });
    const text = getTextFromOpenRouter(body);
    if (!text) throw new Error("OpenRouter returned no text");
    const raw = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
    const rawNotes = Array.isArray(raw) ? raw : Array.isArray(raw.notes) ? raw.notes : [raw];
    const notes = rawNotes.slice(0, 20).map((item: Record<string, unknown>) => parsedNoteSchema.parse({
      ...item,
      tags: item.tags ?? (Array.isArray(item.tag) ? item.tag : item.tag ? [item.tag] : []),
    }));
    return { notes, usage: getOpenRouterUsage(body) };
  }

  async answerQuestion(input: Parameters<AIProvider["answerQuestion"]>[0]) {
    const prompt = `Você é o modo de perguntas do Dabliu.notes. Responda em português do Brasil, de forma direta e útil, usando somente as tarefas fornecidas abaixo. Não invente tarefas, datas, pessoas ou conclusões. Se não houver informação suficiente, diga isso claramente. Para perguntas sobre "hoje", use a data local informada. Cite o título ou o texto original das tarefas relevantes quando ajudar. Não use markdown pesado; prefira uma resposta curta em parágrafos ou bullets simples.

Data local: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}
Contexto e tarefas disponíveis:
${input.context || "nenhum"}

Pergunta: ${input.question}`;
    const body = await requestOpenRouter(this.getApiKey(), { messages: [{ role: "user", content: prompt }], temperature: 0.2 });
    const text = getTextFromOpenRouter(body);
    if (!text?.trim()) throw new Error("OpenRouter returned no answer");
    return { answer: text.trim(), usage: getOpenRouterUsage(body) };
  }
}

class FallbackAIProvider implements AIProvider {
  constructor(private readonly providers: AIProvider[]) {}

  async parseNote(input: Parameters<AIProvider["parseNote"]>[0]) {
    let lastError: unknown;
    for (const provider of this.providers) {
      try { return await provider.parseNote(input); } catch (error) { lastError = error; console.warn("[ai] provider failed, trying next", error instanceof Error ? error.message : "unknown error"); }
    }
    throw lastError instanceof Error ? lastError : new Error("No AI provider available");
  }

  async answerQuestion(input: Parameters<AIProvider["answerQuestion"]>[0]) {
    let lastError: unknown;
    for (const provider of this.providers) {
      try { return await provider.answerQuestion(input); } catch (error) { lastError = error; console.warn("[ai] provider failed, trying next", error instanceof Error ? error.message : "unknown error"); }
    }
    throw lastError instanceof Error ? lastError : new Error("No AI provider available");
  }
}

export function getAIProvider(): AIProvider | null {
  const gemini = process.env.GEMINI_API_KEY ? new GeminiProvider() : null;
  const openRouter = process.env.OPENROUTER_API_KEY ? new OpenRouterProvider() : null;
  const providers = process.env.AI_PROVIDER === "openrouter" ? [openRouter, gemini] : [gemini, openRouter];
  const available = providers.filter((provider): provider is AIProvider => provider !== null);
  return available.length ? new FallbackAIProvider(available) : null;
}
