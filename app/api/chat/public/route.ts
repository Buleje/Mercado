import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { ChatPublicDB } from "@/lib/db/chat-public.db";
import { ChatThreadsDB, ChatMessagesDB } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { markPresence, markTyping, readPresence } from "@/lib/chat/presence";

/** Normaliza phone PE: "51XXXXXXXXX" o "9XXXXXXXX" → "9XXXXXXXX". */
function normalizePhone(phone: string): string {
  const cleaned = String(phone ?? "").replace(/\D/g, "");
  if (cleaned.startsWith("51") && cleaned.length === 11) return cleaned.slice(2);
  return cleaned;
}

/**
 * Guarda anti-suplantación (Brandon 2026-06-06): si el request trae una
 * customer-session válida, el customerPhone del body DEBE coincidir con el
 * de la sesión firmada (JWT). Sin sesión → se permite (flujo legacy del
 * storefront sin login, detrás del feature flag). Cierra el vector P2 de
 * abrir/escribir hilos a nombre de cualquier teléfono cuando hay login.
 * Devuelve null si OK, o un NextResponse 403 si hay mismatch.
 */
async function enforceSessionPhone(
  req: NextRequest,
  bodyPhone: string,
): Promise<NextResponse | null> {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return null; // sin sesión → flujo legacy permitido
  const session = await getCustomerPayload(token);
  if (!session?.customerId) return null;
  if (normalizePhone(session.customerId) !== normalizePhone(bodyPhone)) {
    return NextResponse.json(
      { error: "El teléfono no coincide con tu sesión" },
      { status: 403 },
    );
  }
  return null;
}

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
 *
 * Audit project-wide 2026-05-19: migrado de prisma.* directo a ChatPublicDB.
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

/** Cita (reply) — snapshot del mensaje citado para render sin join. Tanda 1. */
const ReplyToSchema = z.object({
  id:         z.string().min(1).max(100),
  body:       z.string().max(200),
  senderType: z.enum(["buyer", "seller", "system"]),
  senderName: z.string().max(150),
});

const SendMessageBody = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  customerName:  z.string().min(1).max(150),
  body:          z.string().min(1).max(4000),
  replyTo:       ReplyToSchema.optional(),
  // Tanda 4: comprobante/foto en el hilo. La imagen ya se subió vía
  // /api/chat/public/upload; sólo aceptamos URLs de nuestro storage público.
  attachmentUrl: z.string().url().max(600).optional(),
  messageType:   z.enum(["text", "image"]).optional(),
  // Tanda 4: ubicación compartida (GPS). El server arma el metadataJson — NO
  // aceptamos metadataJson crudo del buyer (evita inyectar reactions/autoReply).
  location: z.object({
    lat:   z.number().min(-90).max(90),
    lng:   z.number().min(-180).max(180),
    label: z.string().max(120).optional(),
  }).optional(),
});

/** Reacción emoji a un mensaje (toggle). Tanda 1. */
const ReactBody = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  messageId:     z.string().min(1).max(100),
  emoji:         z.string().min(1).max(16),
});

/** Ping de "escribiendo…" del buyer (efímero). Tanda 1 · Increment 2. */
const TypingBody = z.object({
  threadId:      z.string().min(1).max(100),
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
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

  // Anti-suplantación: si hay sesión, el phone del body debe ser el suyo.
  const bodyPhone = (body as { customerPhone?: unknown })?.customerPhone;
  if (typeof bodyPhone === "string") {
    const denied = await enforceSessionPhone(req, bodyPhone);
    if (denied) return denied;
  }

  if (action === "open") {
    return handleOpen(body);
  }
  if (action === "send") {
    return handleSend(body);
  }
  if (action === "react") {
    return handleReact(body);
  }
  if (action === "typing") {
    return handleTyping(body);
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
    const store = await ChatPublicDB.findStoreBySlug(parsed.data.storeSlug);
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

    // Brandon 2026-05-16 (realtime): emitir SSE al admin del tenant para
    // que el ChatTab vea aparecer el thread sin esperar al polling de 8s.
    try {
      const { emitAdminSSE } = await import("@/lib/sse-emitter");
      emitAdminSSE(store.tenantId, "chat_thread_opened", {
        threadId: thread.id,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        firstMessage: parsed.data.firstMessage ?? null,
      });
      if (parsed.data.firstMessage) {
        emitAdminSSE(store.tenantId, "chat_message_new", {
          threadId: thread.id,
          senderType: "buyer",
          senderName: parsed.data.customerName,
          body: parsed.data.firstMessage,
        });
      }
    } catch { /* fire-and-forget */ }

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
    const store = await ChatPublicDB.findStoreBySlug(parsed.data.storeSlug);
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // Verificar que el thread pertenece al buyer
    const threadCheck = await ChatPublicDB.findThreadForOwnershipCheck(
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck ||
      threadCheck.customerPhone !== parsed.data.customerPhone ||
      threadCheck.storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }
    if (threadCheck.status !== "open") {
      return NextResponse.json({ error: "Conversación cerrada" }, { status: 409 });
    }

    // metadataJson lo arma el SERVER a partir de campos validados (replyTo,
    // location) — nunca aceptamos un blob crudo del buyer.
    const metaObj: Record<string, unknown> = {};
    if (parsed.data.replyTo) metaObj.replyTo = parsed.data.replyTo;        // Tanda 1
    if (parsed.data.location) metaObj.location = parsed.data.location;     // Tanda 4
    const metadataJson = Object.keys(metaObj).length ? JSON.stringify(metaObj) : undefined;

    // Tanda 4: sólo aceptamos imágenes servidas desde NUESTRO storage público
    // (anti-abuso: no permitimos incrustar URLs externas arbitrarias).
    const isOwnImage =
      parsed.data.messageType === "image" &&
      !!parsed.data.attachmentUrl &&
      /\/storage\/v1\/object\/public\/media\/chat\//.test(parsed.data.attachmentUrl);

    const message = await ChatMessagesDB.send({
      tenantId:    store.tenantId,
      threadId:    parsed.data.threadId,
      senderType:  "buyer",
      senderName:  parsed.data.customerName,
      body:        parsed.data.body,
      ...(isOwnImage && { messageType: "image" as const, attachmentUrl: parsed.data.attachmentUrl }),
      metadataJson,
    });

    // Brandon 2026-05-16 (realtime): emitir SSE al admin del tenant.
    try {
      const { emitAdminSSE } = await import("@/lib/sse-emitter");
      emitAdminSSE(store.tenantId, "chat_message_new", {
        threadId: parsed.data.threadId,
        senderType: "buyer",
        senderName: parsed.data.customerName,
        body: parsed.data.body,
        messageId: message.id,
        createdAt: message.createdAt,
      });
    } catch { /* fire-and-forget */ }

    // Tanda 3: Bot AI-first — si el vendedor está offline y el tenant lo activó,
    // el asistente responde primero. Corre POST-respuesta (after) para no
    // demorar el envío del cliente; es opt-in + best-effort.
    after(async () => {
      const { maybeAutoReply } = await import("@/lib/chat/auto-reply");
      await maybeAutoReply({
        tenantId:  store.tenantId,
        threadId:  parsed.data.threadId,
        storeName: store.name,
      });
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

/** POST ?action=react — toggle de reacción emoji del buyer sobre un mensaje. */
async function handleReact(body: unknown) {
  const parsed = ReactBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const store = await ChatPublicDB.findStoreBySlug(parsed.data.storeSlug);
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }
    // Mismo ownership check que send: el buyer solo reacciona en SU hilo.
    const threadCheck = await ChatPublicDB.findThreadForOwnershipCheck(
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck ||
      threadCheck.customerPhone !== parsed.data.customerPhone ||
      threadCheck.storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }

    const { reactions } = await ChatMessagesDB.reactToMessage({
      tenantId:  store.tenantId,
      threadId:  parsed.data.threadId,
      messageId: parsed.data.messageId,
      emoji:     parsed.data.emoji,
      by:        "buyer",
    });

    // Realtime: avisar al admin que cambió una reacción (fire-and-forget).
    try {
      const { emitAdminSSE } = await import("@/lib/sse-emitter");
      emitAdminSSE(store.tenantId, "chat_message_new", {
        threadId: parsed.data.threadId,
        senderType: "buyer",
        reaction: true,
        messageId: parsed.data.messageId,
      });
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ data: { messageId: parsed.data.messageId, reactions } });
  } catch (err) {
    logger.error("[chat/public] react failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/** POST ?action=typing — marca al buyer "escribiendo…" (efímero, sin persistir). */
async function handleTyping(body: unknown) {
  const parsed = TypingBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    const store = await ChatPublicDB.findStoreBySlug(parsed.data.storeSlug);
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }
    const threadCheck = await ChatPublicDB.findThreadForOwnershipCheck(
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck ||
      threadCheck.customerPhone !== parsed.data.customerPhone ||
      threadCheck.storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }
    markTyping(parsed.data.threadId, "buyer");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[chat/public] typing failed", { err: String(err) });
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
    const store = await ChatPublicDB.findStoreBySlug(parsed.data.storeSlug);
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // Validar ownership del thread
    const threadCheck = await ChatPublicDB.findThreadForOwnershipCheck(
      parsed.data.threadId,
      store.tenantId,
    );
    if (
      !threadCheck ||
      threadCheck.customerPhone !== parsed.data.customerPhone ||
      threadCheck.storeId !== store.id
    ) {
      return NextResponse.json({ error: "Thread no encontrado" }, { status: 404 });
    }

    const messages = await ChatMessagesDB.listByThread(
      store.tenantId,
      parsed.data.threadId,
      100,
    );

    // Solo exponer campos seguros al buyer.
    // readBySellerAt (Brandon 2026-06-06): habilita los ✓✓ estilo WhatsApp —
    // el buyer ve si la tienda ya leyó SU mensaje. No expone nada interno.
    const safeMessages = messages.map((m) => ({
      id:             m.id,
      senderType:     m.senderType,
      senderName:     m.senderName,
      body:           m.body,
      messageType:    m.messageType,
      attachmentUrl:  m.attachmentUrl,
      // metadataJson (Tanda 1, Brandon 2026-06-11): lleva reactions + replyTo
      // (cita). Es contenido del propio hilo, no expone nada interno del vendor.
      metadataJson:   m.metadataJson,
      readBySellerAt: m.readBySellerAt,
      createdAt:      m.createdAt,
    }));

    // Marcar como leídos por el buyer (fire-and-forget)
    ChatMessagesDB.markAsRead(store.tenantId, parsed.data.threadId, "buyer").catch((err) => {
      logger.warn("[chat/public] markAsRead failed", { err: String(err) });
    });

    // Presencia (Increment 2): el buyer está mirando → refrescar su flag; leer
    // la de la tienda para pintar "En línea · Escribiendo… · Visto hace X".
    markPresence(parsed.data.threadId, "buyer");
    const presence = readPresence(parsed.data.threadId, "seller");

    // Tanda 4: contexto del pedido fijado — si el hilo nació de un pedido, el
    // cliente ve su estado + items + total arriba (best-effort, no rompe el GET).
    let orderContext = null;
    if (threadCheck.orderId) {
      try {
        const { OrdersDB } = await import("@/lib/db/orders.db");
        const { buildOrderContext } = await import("@/lib/chat/order-context");
        const order = await OrdersDB.getById(store.tenantId, threadCheck.orderId);
        if (order) orderContext = buildOrderContext(order);
      } catch (err) {
        logger.warn("[chat/public] orderContext failed", { err: String(err) });
      }
    }

    return NextResponse.json(
      { data: safeMessages, presence, orderContext },
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
