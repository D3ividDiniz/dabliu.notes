import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/provider";

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  aiModel: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ error: "Unable to answer question" }, { status: 500 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase não está configurado." }, { status: 503 });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) return NextResponse.json({ error: "Faça login para perguntar à IA." }, { status: 401 });

  const parsedInput = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsedInput.success) return NextResponse.json({ error: "Escreva uma pergunta válida." }, { status: 400 });

  const provider = getAIProvider();
  if (!provider) return NextResponse.json({ error: "A IA não está configurada no servidor." }, { status: 503 });

  const [modelsResult, notesResult] = await Promise.all([
    supabase.from("models").select("id, name, description, enabled_fields"),
    supabase.from("notes").select("model_id, original_content, title, description, note_date, tags, status, created_at, archived_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
  ]);
  if (modelsResult.error || notesResult.error) {
    console.error("[ai] ask data failed", modelsResult.error?.message ?? notesResult.error?.message);
    return NextResponse.json({ error: "Não foi possível ler suas tarefas agora." }, { status: 500 });
  }

  const models = modelsResult.data ?? [];
  const modelNames = new Map(models.map((model) => [model.id, model.name]));
  const context = [
    "MÓDULOS:",
    ...models.map((model) => `- ${model.name}: ${model.description || "sem descrição"}`),
    "",
    "TAREFAS:",
    ...(notesResult.data ?? []).map((note, index) => [
      `[${index + 1}] módulo=${modelNames.get(note.model_id ?? "") ?? "sem módulo"}`,
      `título=${note.title || "(sem título)"}`,
      `descrição=${note.description || "(sem descrição)"}`,
      `original=${note.original_content}`,
      `data=${note.note_date || "(sem data)"}`,
      `tags=${note.tags?.join(", ") || "(sem tags)"}`,
      `status=${note.status || "(sem status)"}`,
      `arquivada=${note.archived_at ? "sim" : "não"}`,
    ].join(" | ")),
  ].join("\n");

  try {
    console.info(`[ai] ask start chars=${parsedInput.data.question.length} notes=${notesResult.data?.length ?? 0}`);
    const result = await provider.answerQuestion({ question: parsedInput.data.question, context, aiModel: parsedInput.data.aiModel });
    console.info(`[ai] ask success tokens=${result.usage?.totalTokenCount ?? "unknown"}`);
    return NextResponse.json(result, { status: 200, headers: response.headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("[ai] ask failed", detail);
    const userMessage = detail.includes("401")
      ? "A chave da API Gemini está inválida ou expirada."
      : detail.includes("429") || detail.includes("503")
        ? "A IA está temporariamente ocupada. Tente novamente em alguns instantes."
        : "Não foi possível responder agora. Suas tarefas continuam seguras.";
    return NextResponse.json({ error: userMessage }, { status: 422 });
  }
}
