import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

const sendSchema = z.object({
  body: z.string().min(1).max(5000),
  attachmentUrl: z.string().url().max(1000).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const messages = await PlatformChatDB.getMessagesForTenant(auth.tenantId, id);
    if (messages === null) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    await PlatformChatDB.markRead(id, "tenant");
    return NextResponse.json({ messages });
  } catch (e) {
    logger.error("[admin/platform-chat] messages get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    // Aislamiento multi-tenant: la conversación debe pertenecer a este tenant.
    const conv = await PlatformChatDB.getConversation(id);
    if (!conv || conv.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    const message = await PlatformChatDB.sendMessage({
      conversationId: id,
      senderType: "tenant",
      senderName: auth.username,
      senderId: auth.username,
      body: parsed.data.body,
      attachmentUrl: parsed.data.attachmentUrl,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    logger.error("[admin/platform-chat] send error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
