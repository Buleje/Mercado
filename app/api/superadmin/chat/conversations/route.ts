import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

const listSchema = z.object({
  status: z.enum(["open", "closed", "archived"]).optional(),
  assignedTo: z.string().max(120).optional(),
  label: z.string().max(60).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  tenantId: z.string().min(1).max(120),
  tenantName: z.string().max(200).optional(),
  subject: z.string().max(300).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  firstMessage: z.string().max(5000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const conversations = await PlatformChatDB.listConversations(parsed.data);
    const unread = await PlatformChatDB.unreadTotalForPlatform();
    return NextResponse.json({ conversations, unread });
  } catch (e) {
    logger.error("[superadmin/chat] list error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const conv = await PlatformChatDB.createConversation({
      tenantId: parsed.data.tenantId,
      tenantName: parsed.data.tenantName,
      subject: parsed.data.subject,
      priority: parsed.data.priority,
      createdBy: auth.username,
    });
    if (parsed.data.firstMessage?.trim()) {
      await PlatformChatDB.sendMessage({
        conversationId: conv.id,
        senderType: "platform",
        senderName: auth.username,
        senderId: auth.username,
        body: parsed.data.firstMessage.trim(),
      });
    }
    const fresh = await PlatformChatDB.getConversation(conv.id);
    return NextResponse.json({ conversation: fresh ?? conv }, { status: 201 });
  } catch (e) {
    logger.error("[superadmin/chat] create error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
