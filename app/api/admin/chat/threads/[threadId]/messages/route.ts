import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ChatMessagesDB, type MessageType } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { markPresence, readPresence } from "@/lib/chat/presence";

const MessageTypeSchema = z.enum([
  "text",
  "image",
  "system_event",
  "quote",
  "order_link",
]);

const SendBody = z.object({
  body:          z.string().min(1).max(4000),
  messageType:   MessageTypeSchema.optional(),
  attachmentUrl: z.string().url().max(500).optional(),
  metadataJson:  z.string().max(4000).optional(),
});

/**
 * POST /api/admin/chat/threads/[threadId]/messages
 * El vendedor envía un mensaje en un hilo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-chat-threads-X-messages"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { threadId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SendBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const message = await ChatMessagesDB.send({
      tenantId:      auth.tenantId,
      threadId,
      senderType:    "seller",
      senderId:      auth.username,
      senderName:    auth.username, // en v1 usamos username; v2 podría cargar displayName
      body:          parsed.data.body,
      messageType:   parsed.data.messageType as MessageType | undefined,
      attachmentUrl: parsed.data.attachmentUrl,
      metadataJson:  parsed.data.metadataJson,
    });

    // Brandon 2026-05-16 (realtime):
    //  - SSE al admin: para que otros admins conectados vean el mensaje
    //    inmediato en su ChatTab (multi-cajero).
    //  - chatBus: emite a streams SSE públicos suscritos al thread → el
    //    cliente en el storefront recibe el mensaje sin esperar polling.
    try {
      const { emitAdminSSE } = await import("@/lib/sse-emitter");
      emitAdminSSE(auth.tenantId, "chat_message_new", {
        threadId,
        senderType: "seller",
        senderName: auth.username,
        body: parsed.data.body,
        messageId: message.id,
        createdAt: message.createdAt,
      });
      const { emitChatPublic } = await import("@/lib/chat-public-bus");
      emitChatPublic(auth.tenantId, threadId, {
        id: message.id,
        senderType: "seller",
        senderName: auth.username,
        body: parsed.data.body,
        createdAt: message.createdAt,
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (err) {
    logger.error("[chat/messages] send failed", { err: String(err), threadId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/chat/messages",
      tenantId: auth.tenantId,
      extra: { verb: "POST", threadId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/admin/chat/threads/[threadId]/messages
 * Lista los mensajes del hilo + marca automáticamente como leídos por el seller.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { threadId } = await params;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);

  try {
    const messages = await ChatMessagesDB.listByThread(auth.tenantId, threadId, limit);

    // Solo admin/cajero marcan automáticamente como leído (almacenero es solo lectura)
    if (auth.role === "admin" || auth.role === "cajero") {
      ChatMessagesDB.markAsRead(auth.tenantId, threadId, "seller").catch((err) => {
        logger.warn("[chat/messages] markAsRead failed", { err: String(err), threadId });
      });
    }

    // Presencia (Increment 2): la tienda está mirando este hilo → refrescar su
    // flag (el cliente verá "En línea"); leer la del buyer para el header del
    // panel (lo consume la UI del vendedor en el siguiente increment).
    markPresence(threadId, "seller");
    const presence = readPresence(threadId, "buyer");

    return NextResponse.json(
      { data: messages, presence },
      {
        headers: { "X-Total-Count": String(messages.length) },
      },
    );
  } catch (err) {
    logger.error("[chat/messages] list failed", { err: String(err), threadId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/chat/messages",
      tenantId: auth.tenantId,
      extra: { verb: "GET", threadId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
