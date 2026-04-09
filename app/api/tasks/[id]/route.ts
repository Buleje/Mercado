import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { readData, writeData } from "@/lib/file-store";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json();
  const tasks = await getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  tasks[idx] = { ...tasks[idx], ...body, id };
  await saveTasks(tasks);
  return NextResponse.json(tasks[idx]);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const tasks = await getTasks();
  await saveTasks(tasks.filter(t => t.id !== id));
  return NextResponse.json({ ok: true });
}
