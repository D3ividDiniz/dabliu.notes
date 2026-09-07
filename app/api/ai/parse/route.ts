import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/provider";

export async function POST(request: Request) {
  const provider = getAIProvider();
  if (!provider) return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  try {
    const input = await request.json();
    const parsed = await provider.parseNote(input);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Unable to interpret note" }, { status: 422 });
  }
}
