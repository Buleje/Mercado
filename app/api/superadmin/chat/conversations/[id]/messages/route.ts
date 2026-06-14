import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

const sendSchema = z.object({
  body: z.string().min(1).max(5000),
  messageType: z.enum(["text", "image", "note"]).optional(),
  attachmentUrl: z.string().url().max(1000).optional(),
  isInternalNote: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const messages = await PlatformChatDB.getMessages(id, { includeNotes: true });
    return NextResponse.json({ messages });
  } catch (e) {
    logger.error("[superadmin/chat] messages get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const message = await PlatformChatDB.sendMessage({
      conversationId: id,
      senderType: "platform",
      senderName: auth.username,
      senderId: auth.username,
      body: parsed.data.body,
      messageType: parsed.data.messageType,
      attachmentUrl: parsed.data.attachmentUrl,
      isInternalNote: parsed.data.isInternalNote,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    logger.error("[superadmin/chat] send error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
