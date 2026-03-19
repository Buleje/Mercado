import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/file-store";
import { z } from "zod";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(300).optional(),
});

type FeedbackEntry = { rating: number; comment?: string; createdAt: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const { rating, comment } = parsed.data;

    let all: FeedbackEntry[] = [];
    try { all = await readData<FeedbackEntry[]>("beta-feedback"); } catch { /* first write */ }
    all.push({ rating, comment, createdAt: new Date().toISOString() });
    await writeData("beta-feedback", all);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
