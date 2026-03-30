import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { readData, writeData } from "@/lib/file-store";
import { toErrorPayload } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const GOALS_KEY = "goals";

interface Goal {
  id: string;
  name: string;
  category: string;
  period: string;
  target: number;
  current: number;
  unit: string;
  createdAt: string;
  dueDate?: string;
}

async function getGoals(): Promise<Goal[]> {
  const data = await readData<{ goals?: Goal[] }>(GOALS_KEY).catch(() => null);
  return data?.goals ?? [];
}

async function saveGoals(goals: Goal[]): Promise<void> {
  await writeData(GOALS_KEY, { goals });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const goals = await getGoals();
    const idx = goals.findIndex(g => g.id === id);
    if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
    goals[idx] = { ...goals[idx], ...body, id };
    await saveGoals(goals);
    return NextResponse.json(goals[idx]);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const goals = await getGoals();
    const filtered = goals.filter(g => g.id !== id);
    await saveGoals(filtered);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
