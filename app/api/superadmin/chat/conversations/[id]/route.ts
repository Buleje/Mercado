import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  status: z.enum(["open", "closed", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  labels: z.array(z.string().max(60)).max(20).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const conversation = await PlatformChatDB.getConversation(id);
    if (!conversation) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const messages = await PlatformChatDB.getMessages(id, { includeNotes: true });
    await PlatformChatDB.markRead(id, "platform");
    return NextResponse.json({ conversation, messages });
  } catch (e) {
    logger.error("[superadmin/chat] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const { status, priority, labels, assignedTo } = parsed.data;
    if (status) await PlatformChatDB.setStatus(id, status);
    if (priority) await PlatformChatDB.setPriority(id, priority);
    if (labels) await PlatformChatDB.setLabels(id, labels);
    if (assignedTo !== undefined) await PlatformChatDB.assign(id, assignedTo);
    const conversation = await PlatformChatDB.getConversation(id);
    return NextResponse.json({ conversation });
  } catch (e) {
    logger.error("[superadmin/chat] patch error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
