import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { readData, writeData } from "@/lib/file-store";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limit";

const KEY = "tasks";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assignedTo?: string;
  dueDate?: string;
  module?: string;
  createdAt: string;
  completedAt?: string;
}

async function getTasks(): Promise<Task[]> {
  const data = await readData<{ tasks?: Task[] }>(KEY).catch(() => null);
  return data?.tasks ?? [];
}
async function saveTasks(tasks: Task[]): Promise<void> {
  await writeData(KEY, { tasks });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const tasks = await getTasks();
  return NextResponse.json(tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "tasks"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const tasks = await getTasks();
  const task: Task = {
    id: randomUUID(),
    title: body.title,
    description: body.description,
    priority: body.priority ?? "media",
    status: "pendiente",
    assignedTo: body.assignedTo,
    dueDate: body.dueDate,
    module: body.module,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  await saveTasks(tasks);
  return NextResponse.json(task, { status: 201 });
}
