import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ChatThreadsDB, ChatMessagesDB } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Endpoints PÚBLICOS para que el comprador (buyer) envíe/reciba mensajes
 * desde el storefront sin necesidad de login admin.
 *
 * Autenticación:
 *   El buyer se identifica por (storeSlug + customerPhone). No hay sesión
 *   persistente — cada request envía los identificadores. Esto es suficiente
 *   porque el customerPhone es validado via OTP en otra etapa (fuera del
 *   scope de este endpoint v1).
 *
 * Seguridad:
 *   - Feature flag marketplace-chat-public arranca OFF
 *   - Rate limit por IP ya lo maneja el middleware proxy.ts (60/min)
 *   - Los body son validados con Zod safeParse
 *   - El endpoint nunca expone unreadForSeller o datos internos del vendor
 */

const OpenThreadBody = z.object({
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  customerName:  z.string().min(1).max(150),
  orderId:       z.string().max(100).optional(),
  subject:       z.string().max(200).optional(),
  firstMessage:  z.string().min(1).max(4000).optional(),
});

const ListMessagesQuery = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
});

const SendMessageBody = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  customerName:  z.string().min(1).max(150),
  body:          z.string().min(1).max(4000),
});

/**
 * POST /api/chat/public?action=open
 * Abre o recupera un hilo existente entre el buyer y la tienda.
 *
 * POST /api/chat/public?action=send
 * Envía un mensaje del buyer en un hilo existente.
 *
 * GET /api/chat/public?threadId=...&storeSlug=...&customerPhone=...
 * Lista los mensajes de un hilo (con validación de ownership del buyer).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "chat-public"); if (_rl) return _rl;
  if (!isFeatureEnabled("marketplace-chat-public")) {
    return NextResponse.json(
      { error: "Chat temporalmente no disponible" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const action = req.nextUrl.searchParams.get("action") ?? "open";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (action === "open") {
    return handleOpen(body);
  }
  if (action === "send") {
    return handleSend(body);
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

async function handleOpen(body: unknown) {
  const parsed = OpenThreadBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Cargar tienda por slug + verificar publicación
    const store = await prisma.store.findUnique({
      where: { slug: parsed.data.storeSlug },
      select: { id: true, tenantId: true, isPublished: true, name: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    const thread = await ChatThreadsDB.openOrGet({
      tenantId:      store.tenantId,
      storeId:       store.id,
      customerPhone: parsed.data.customerPhone,
      customerName:  parsed.data.customerName,
      orderId:       parsed.data.orderId,
      subject:       parsed.data.subject,
    });

    // Si hay firstMessage, enviarlo también
    if (parsed.data.firstMessage) {
      await ChatMessagesDB.send({
        tenantId:   store.tenantId,
        threadId:   thread.id,
        senderType: "buyer",
        senderName: parsed.data.customerName,
        body:       parsed.data.firstMessage,
      });
    }

    // Solo exponer campos seguros al buyer (NO tenantId, NO unreadForSeller)
    return NextResponse.json({
      data: {
        threadId:      thread.id,
        storeName:     store.name,
        status:        thread.status,
        unreadForBuyer: thread.unreadForBuyer,
        createdAt:     thread.createdAt,
      },
    });
  } catch (err) {
    logger.error("[chat/public] open failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/chat/public",
      extra: { action: "open" },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

async function handleSend(body: unknown) {
  const parsed = SendMessageBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Validar ownership: el buyer sólo puede enviar a hilos donde
    // su customerPhone coincida con el del thread
    const store = await prisma.store.findUnique({
      where: { slug: parsed.data.storeSlug },
      select: { id: true, tenantId: true, isPublished: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // Verificar que el thread pertenece al buyer
    const threadCheck = await prisma.$queryRawUnsafe<
      Array<{ customerPhone: string; storeId: string; status: string }>
    >(
      `SELECT "customerPhone","storeId","status"
         FROM "ConversationThread"
        WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck[0] ||
      threadCheck[0].customerPhone !== parsed.data.customerPhone ||
      threadCheck[0].storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }
    if (threadCheck[0].status !== "open") {
      return NextResponse.json({ error: "Conversación cerrada" }, { status: 409 });
    }

    const message = await ChatMessagesDB.send({
      tenantId:   store.tenantId,
      threadId:   parsed.data.threadId,
      senderType: "buyer",
      senderName: parsed.data.customerName,
      body:       parsed.data.body,
    });

    return NextResponse.json(
      {
        data: {
          id:         message.id,
          body:       message.body,
          senderType: message.senderType,
          createdAt:  message.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[chat/public] send failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/chat/public",
      extra: { action: "send" },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("marketplace-chat-public")) {
    return NextResponse.json(
      { error: "Chat temporalmente no disponible" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const threadId = req.nextUrl.searchParams.get("threadId") ?? "";
  const storeSlug = req.nextUrl.searchParams.get("storeSlug") ?? "";
  const customerPhone = req.nextUrl.searchParams.get("customerPhone") ?? "";

  const parsed = ListMessagesQuery.safeParse({ threadId, storeSlug, customerPhone });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const store = await prisma.store.findUnique({
      where: { slug: parsed.data.storeSlug },
      select: { id: true, tenantId: true, isPublished: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // Validar ownership del thread
    const threadCheck = await prisma.$queryRawUnsafe<
      Array<{ customerPhone: string; storeId: string }>
    >(
      `SELECT "customerPhone","storeId"
         FROM "ConversationThread"
        WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck[0] ||
      threadCheck[0].customerPhone !== parsed.data.customerPhone ||
      threadCheck[0].storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }

    const messages = await ChatMessagesDB.listByThread(
      store.tenantId,
      parsed.data.threadId,
      100,
    );

    // Solo exponer campos seguros al buyer
    const safeMessages = messages.map((m) => ({
      id:            m.id,
      senderType:    m.senderType,
      senderName:    m.senderName,
      body:          m.body,
      messageType:   m.messageType,
      attachmentUrl: m.attachmentUrl,
      createdAt:     m.createdAt,
    }));

    // Marcar como leídos por el buyer (fire-and-forget)
    ChatMessagesDB.markAsRead(store.tenantId, parsed.data.threadId, "buyer").catch((err) => {
      logger.warn("[chat/public] markAsRead failed", { err: String(err) });
    });

    return NextResponse.json(
      { data: safeMessages },
      {
        headers: {
          "X-Total-Count": String(safeMessages.length),
          "Cache-Control": "no-store",
          "X-Robots-Tag":  "noindex, nofollow",
        },
      },
    );
  } catch (err) {
    logger.error("[chat/public] list failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/chat/public",
      extra: { verb: "GET" },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
