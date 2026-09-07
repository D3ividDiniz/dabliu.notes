import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/provider";

export async function POST(request: Request) {
  const provider = getAIProvider();
  if (!provider) {
    console.warn("[ai] provider unavailable: check AI_PROVIDER and GEMINI_API_KEY");
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  }
  try {
    const input = await request.json();
    console.info(`[ai] parse start model=${input.aiModel ?? "env-default"} chars=${String(input.content ?? "").length}`);
    const parsed = await provider.parseNote(input);
    console.info(`[ai] parse success tasks=${parsed.length}`);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[ai] parse failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to interpret note" }, { status: 422 });
  }
}
