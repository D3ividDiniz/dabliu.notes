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
    console.info(`[ai] parse success tasks=${parsed.notes.length} tokens=${parsed.usage?.totalTokenCount ?? "unknown"}`);
    return NextResponse.json(parsed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("[ai] parse failed", detail);
    const userMessage = detail.includes("401")
      ? "A chave da API Gemini está inválida ou expirada. Atualize GEMINI_API_KEY no Render."
      : detail.includes("404")
        ? "O modelo Gemini selecionado não está disponível. Escolha outro modelo em Configurações."
        : detail.includes("429")
          ? "O limite da API Gemini foi atingido. Tente novamente em alguns instantes."
          : "Não foi possível interpretar a captura agora. A nota original foi salva e pode ser processada novamente.";
    return NextResponse.json({ error: userMessage }, { status: 422 });
  }
}
