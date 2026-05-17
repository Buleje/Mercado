import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subscribeChatPublic, totalChatPublicConnections } from "@/lib/chat-public-bus";
import { applyRateLimit } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * GET /api/chat/public/stream?threadId=&storeSlug=&customerPhone=
 *
 * Brandon 2026-05-16 (Chat realtime):
 *   Server-Sent Events stream para que el cliente del storefront reciba
 *   mensajes del dueño INMEDIATO (sin esperar polling 3s del ChatBubble).
 *
 * Eventos emitidos:
 *   - `chat_message` con `{ id, senderType, senderName, body, createdAt }`
 *     cada vez que el dueño responde desde /admin?tab=marketplace-chat.
 *
 * Seguridad:
 *   - Ownership check: el thread debe pertenecer al customerPhone+storeSlug
 *     que envía la request. Sin esto, cualquier visitante anónimo podría
 *     "escuchar" conversaciones ajenas conociendo el threadId.
 *   - Rate limit STRICT para evitar spam de conexiones.
 *   - Cap global de 2000 conexiones (storefront tiene más tráfico que admin).
 *   - Feature flag marketplace-chat-public protege el endpoint.
 *
 * Limitación: in-memory pub/sub (lib/chat-public-bus.ts) — los mensajes
 * emitidos en una instancia NO llegan a clients conectados a otra. Para
 * multi-instance (Vercel) escalar a Redis pub/sub o Supabase Realtime.
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "chat-public-stream");
  if (rl) return rl;

  if (!isFeatureEnabled("marketplace-chat-public")) {
    return NextResponse.json(
      { error: "Chat temporalmente no disponible" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const threadId = req.nextUrl.searchParams.get("threadId") ?? "";
  const storeSlug = req.nextUrl.searchParams.get("storeSlug") ?? "";
  const customerPhone = req.nextUrl.searchParams.get("customerPhone") ?? "";

  if (!threadId || !storeSlug || !customerPhone) {
    return NextResponse.json(
      { error: "threadId, storeSlug y customerPhone son requeridos" },
      { status: 400 },
    );
  }

  // Ownership check ANTES de subscribir el stream.
  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    select: { id: true, tenantId: true, isPublished: true },
  });
  if (!store || !store.isPublished) {
    return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
  }

  const threadCheck = await prisma.$queryRawUnsafe<
    Array<{ customerPhone: string; storeId: string }>
  >(
    `SELECT "customerPhone","storeId" FROM "ConversationThread"
       WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
    threadId,
    store.tenantId,
  );
  if (
    !threadCheck[0] ||
    threadCheck[0].customerPhone !== customerPhone ||
    threadCheck[0].storeId !== store.id
  ) {
    return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
  }

  if (totalChatPublicConnections() > 2000) {
    return NextResponse.json({ error: "Capacity exceeded" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let closed = false;

  const send = (data: string) => {
    if (closed) return;
    writer.write(encoder.encode(data)).catch(() => {
      closed = true;
    });
  };

  send(": connected\n\n");

  const unsubscribe = subscribeChatPublic(store.tenantId, threadId, send);

  // Keep-alive cada 20s — proxies matan conexiones idle a los 30s.
  const ping = setInterval(() => send(": ping\n\n"), 20_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe?.();
    writer.close().catch(() => { /* stream ya cerrado por el cliente */ });
  };

  req.signal.addEventListener("abort", cleanup);

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
