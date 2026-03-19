import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { readData, writeData } from "@/lib/file-store";
import { randomUUID } from "crypto";

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

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const goals = await getGoals();
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  if (!body.name || !body.target) {
    return NextResponse.json({ error: "name and target required" }, { status: 400 });
  }
  const goals = await getGoals();
  const goal: Goal = {
    id: randomUUID(),
    name: body.name,
    category: body.category ?? "ventas",
    period: body.period ?? "mensual",
    target: Number(body.target),
    current: Number(body.current ?? 0),
    unit: body.unit ?? "S/",
    createdAt: new Date().toISOString(),
    dueDate: body.dueDate,
  };
  goals.push(goal);
  await saveGoals(goals);
  return NextResponse.json(goal, { status: 201 });
}
