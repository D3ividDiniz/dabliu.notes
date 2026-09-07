import { z } from "zod";

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

const allowedModels = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];

async function requestGemini(apiKey: string, requestedModel: string | undefined, body: Record<string, unknown>) {
  const model = requestedModel && allowedModels.includes(requestedModel) ? requestedModel : process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const fallbackModels = [model, "gemini-3.7-flash", "gemini-3.5-flash"];
  let lastError = "";
  for (const candidate of [...new Set(fallbackModels)]) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    const providerBody = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(providerBody) as { error?: { message?: string } };
      providerMessage = parsed.error?.message ?? "";
    } catch {
      providerMessage = "";
    }
    lastError = `Gemini request failed: ${response.status}${providerMessage ? ` — ${providerMessage}` : ""}`;
    if (response.status !== 429 && response.status !== 503) throw new Error(lastError);
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

export function getAIProvider(): AIProvider | null {
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) return new GeminiProvider();
  return null;
}
