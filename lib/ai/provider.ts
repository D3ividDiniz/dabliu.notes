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

export interface AIProvider {
  parseNote(input: { modelName: string; context: string; fields: string[]; content: string; aiModel?: string }): Promise<ParsedNote[]>;
}

export class GeminiProvider implements AIProvider {
  async parseNote(input: Parameters<AIProvider["parseNote"]>[0]) {
    const apiKey = process.env.GEMINI_API_KEY;
    const allowedModels = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
    const model = input.aiModel && allowedModels.includes(input.aiModel) ? input.aiModel : process.env.GEMINI_MODEL || "gemini-3.6-flash";
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const prompt = `You extract structured notes and tasks. Return JSON only, never markdown.
Model: ${input.modelName}
Context: ${input.context || "none"}
Enabled fields: ${input.fields.join(", ")}
User note: ${input.content}
If the user's text contains multiple tasks, reminders, requests, or distinct actions, split them into separate notes. Return at most 20 notes in this exact shape: {"notes":[{"title":"...","description":"...","date":null,"tags":[],"value":null,"number":null,"status":"pending"}]}. Preserve the meaning of each task. Use null for unavailable values and [] for no tags. Date must be YYYY-MM-DD only; use null when an exact date cannot be inferred (never return words such as tomorrow or next week).`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const body = await response.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("Gemini returned no text");
    const raw = JSON.parse(text);
    const rawNotes = Array.isArray(raw) ? raw : Array.isArray(raw.notes) ? raw.notes : [raw];
    return rawNotes.slice(0, 20).map((item: Record<string, unknown>) => parsedNoteSchema.parse({
      ...item,
      tags: item.tags ?? (Array.isArray(item.tag) ? item.tag : item.tag ? [item.tag] : []),
    }));
  }
}

export function getAIProvider(): AIProvider | null {
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) return new GeminiProvider();
  return null;
}
