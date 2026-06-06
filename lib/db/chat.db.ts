import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { enqueueChatNotification } from "@/lib/queue/queues";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * lib/db/chat.db.ts — Bloque D2 del Marketplace (Chat buyer ↔ seller)
 *
 * Dos DB classes:
 *   - ChatThreadsDB   → CRUD de hilos de conversación
 *   - ChatMessagesDB  → insert/list de mensajes + marcar como leídos
 *
 * Sigue el mismo patrón de raw SQL del bloque D1 (ver ADR 011):
 *   - $executeRawUnsafe / $queryRawUnsafe con parámetros posicionales ($1 $2 $3)
 *   - Nunca string interpolation
 *   - tenantId como primer parámetro en TODAS las funciones
 *   - Cache getOrSet + invalidateByPrefix después de writes
 *   - Logger estructurado en los flujos críticos
 *
 * Convención de unicidad:
 *   Un buyer puede tener UN thread abierto por (storeId, customerPhone, orderId|'')
 *   — enforced por el unique index parcial del SQL. Si el buyer intenta reabrir
 *   un thread cerrado, se crea uno nuevo.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThreadStatus = "open" | "closed" | "archived" | "blocked";
export type SenderType = "buyer" | "seller" | "system";
export type MessageType = "text" | "image" | "system_event" | "quote" | "order_link";

export type DbConversationThread = {
  id: string;
  tenantId: string;
  storeId: string;
  orderId: string | null;
  customerPhone: string;
  customerName: string;
  subject: string | null;
  status: ThreadStatus;
  unreadForBuyer: number;
  unreadForSeller: number;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderType: SenderType | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbConversationMessage = {
  id: string;
  tenantId: string;
  threadId: string;
  senderType: SenderType;
  senderId: string | null;
  senderName: string;
  body: string;
  messageType: MessageType;
  attachmentUrl: string | null;
  metadataJson: string | null;
  readByBuyerAt: string | null;
  readBySellerAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

const toISO = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

// ─── ChatThreadsDB ────────────────────────────────────────────────────────────

export const ChatThreadsDB = {
  /**
   * Abre (o reutiliza) un hilo existente entre un buyer y una tienda.
   * Si ya existe un hilo abierto con la misma (storeId, customerPhone, orderId),
   * lo devuelve. Si no, crea uno nuevo.
   *
   * Idempotente: llamar varias veces con los mismos params devuelve el mismo thread.
   */
  async openOrGet(params: {
    tenantId: string;
    storeId: string;
    customerPhone: string;
    customerName: string;
    orderId?: string | null;
    subject?: string;
  }): Promise<DbConversationThread> {
    const orderId = params.orderId ?? null;

    // 1. Buscar si ya existe uno abierto
    const existing = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenantId: string;
        storeId: string;
        orderId: string | null;
        customerPhone: string;
        customerName: string;
        subject: string | null;
        status: string;
        unreadForBuyer: number;
        unreadForSeller: number;
        lastMessageAt: Date | null;
        lastMessageText: string | null;
        lastSenderType: string | null;
        closedAt: Date | null;
        closedReason: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(
      `SELECT "id","tenantId","storeId","orderId","customerPhone","customerName","subject",
              "status","unreadForBuyer","unreadForSeller","lastMessageAt","lastMessageText",
              "lastSenderType","closedAt","closedReason","createdAt","updatedAt"
         FROM "ConversationThread"
        WHERE "tenantId" = $1
          AND "storeId" = $2
          AND "customerPhone" = $3
          AND COALESCE("orderId", '') = COALESCE($4, '')
          AND "status" = 'open'
        LIMIT 1`,
      params.tenantId,
      params.storeId,
      params.customerPhone,
      orderId,
    );

    if (existing[0]) {
      const t = existing[0];
      return {
        id:              t.id,
        tenantId:        t.tenantId,
        storeId:         t.storeId,
        orderId:         t.orderId,
        customerPhone:   t.customerPhone,
        customerName:    t.customerName,
        subject:         t.subject,
        status:          t.status as ThreadStatus,
        unreadForBuyer:  t.unreadForBuyer,
        unreadForSeller: t.unreadForSeller,
        lastMessageAt:   toISO(t.lastMessageAt),
        lastMessageText: t.lastMessageText,
        lastSenderType:  t.lastSenderType as SenderType | null,
        closedAt:        toISO(t.closedAt),
        closedReason:    t.closedReason,
        createdAt:       t.createdAt.toISOString(),
        updatedAt:       t.updatedAt.toISOString(),
      };
    }

    // 2. Crear uno nuevo
    const id = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ConversationThread"
         ("id","tenantId","storeId","orderId","customerPhone","customerName","subject",
          "status","unreadForBuyer","unreadForSeller","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',0,0,$8,$8)`,
      id,
      params.tenantId,
      params.storeId,
      orderId,
      params.customerPhone,
      params.customerName,
      params.subject ?? null,
      now,
    );

    invalidateByPrefix(`chat:threads:${params.tenantId}`);

    logger.info("[ChatThreads] created", {
      tenantId: params.tenantId,
      threadId: id,
      storeId: params.storeId,
    });

    return {
      id,
      tenantId:        params.tenantId,
      storeId:         params.storeId,
      orderId,
      customerPhone:   params.customerPhone,
      customerName:    params.customerName,
      subject:         params.subject ?? null,
      status:          "open",
      unreadForBuyer:  0,
      unreadForSeller: 0,
      lastMessageAt:   null,
      lastMessageText: null,
      lastSenderType:  null,
      closedAt:        null,
      closedReason:    null,
      createdAt:       now.toISOString(),
      updatedAt:       now.toISOString(),
    };
  },

  /**
   * Bandeja del BUYER (Messenger del nav, Brandon 2026-06-06): todos los
   * hilos abiertos de un customer, cross-tenant a propósito — el comprador
   * habla con tiendas de distintos tenants y ve TODO en una sola bandeja.
   * Enriquecido con logo/slug/nombre de la tienda. Cache 10s (se pollea).
   *
   * @cross-tenant intentional (ADR-082): scope = customerPhone del JWT del
   * buyer (ownership lo valida el endpoint con requireCustomer).
   */
  async listByCustomerPhone(
    customerPhone: string,
    opts: { limit?: number } = {},
  ): Promise<
    Array<
      DbConversationThread & {
        storeName: string;
        storeSlug: string | null;
        storeLogo: string | null;
      }
    >
  > {
    const limit = Math.min(Math.max(1, opts.limit ?? 30), 100);
    const cacheKey = `chat:threads:buyer:${customerPhone}:${limit}`;

    return getOrSet(cacheKey, 10, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          storeId: string;
          orderId: string | null;
          customerPhone: string;
          customerName: string;
          subject: string | null;
          status: string;
          unreadForBuyer: number;
          unreadForSeller: number;
          lastMessageAt: Date | null;
          lastMessageText: string | null;
          lastSenderType: string | null;
          closedAt: Date | null;
          closedReason: string | null;
          createdAt: Date;
          updatedAt: Date;
          storeName: string;
          storeSlug: string | null;
          storeLogo: string | null;
        }>
      >(
        `SELECT t."id",t."tenantId",t."storeId",t."orderId",t."customerPhone",t."customerName",
                t."subject",t."status",t."unreadForBuyer",t."unreadForSeller",t."lastMessageAt",
                t."lastMessageText",t."lastSenderType",t."closedAt",t."closedReason",
                t."createdAt",t."updatedAt",
                s."name" AS "storeName", s."slug" AS "storeSlug", s."logo" AS "storeLogo"
           FROM "ConversationThread" t
           JOIN "Store" s ON s."id" = t."storeId"
          WHERE t."customerPhone" = $1
            AND t."status" = 'open'
          ORDER BY COALESCE(t."lastMessageAt", t."createdAt") DESC
          LIMIT $2`,
        customerPhone,
        limit,
      );

      return rows.map((t) => ({
        id:              t.id,
        tenantId:        t.tenantId,
        storeId:         t.storeId,
        orderId:         t.orderId,
        customerPhone:   t.customerPhone,
        customerName:    t.customerName,
        subject:         t.subject,
        status:          t.status as ThreadStatus,
        unreadForBuyer:  t.unreadForBuyer,
        unreadForSeller: t.unreadForSeller,
        lastMessageAt:   toISO(t.lastMessageAt),
        lastMessageText: t.lastMessageText,
        lastSenderType:  t.lastSenderType as SenderType | null,
        closedAt:        toISO(t.closedAt),
        closedReason:    t.closedReason,
        createdAt:       t.createdAt.toISOString(),
        updatedAt:       t.updatedAt.toISOString(),
        storeName:       t.storeName,
        storeSlug:       t.storeSlug,
        storeLogo:       t.storeLogo,
      }));
    });
  },

  /**
   * Lista los hilos de un tenant ordenados por actividad reciente.
   * Soporta filtros opcionales por status y storeId. Cache 20s.
   */
  async listByTenant(
    tenantId: string,
    opts: { status?: ThreadStatus; storeId?: string; limit?: number } = {},
  ): Promise<DbConversationThread[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
    const cacheKey = `chat:threads:${tenantId}:${opts.status ?? "all"}:${opts.storeId ?? "all"}:${limit}`;

    return getOrSet(cacheKey, 20, async () => {
      const args: unknown[] = [tenantId];
      let whereExtras = "";
      if (opts.status) {
        args.push(opts.status);
        whereExtras += ` AND "status" = $${args.length}`;
      }
      if (opts.storeId) {
        args.push(opts.storeId);
        whereExtras += ` AND "storeId" = $${args.length}`;
      }
      args.push(limit);
      const limitParam = `$${args.length}`;

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          storeId: string;
          orderId: string | null;
          customerPhone: string;
          customerName: string;
          subject: string | null;
          status: string;
          unreadForBuyer: number;
          unreadForSeller: number;
          lastMessageAt: Date | null;
          lastMessageText: string | null;
          lastSenderType: string | null;
          closedAt: Date | null;
          closedReason: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >(
        `SELECT "id","tenantId","storeId","orderId","customerPhone","customerName","subject",
                "status","unreadForBuyer","unreadForSeller","lastMessageAt","lastMessageText",
                "lastSenderType","closedAt","closedReason","createdAt","updatedAt"
           FROM "ConversationThread"
          WHERE "tenantId" = $1 ${whereExtras}
          ORDER BY COALESCE("lastMessageAt", "createdAt") DESC
          LIMIT ${limitParam}`,
        ...args,
      );

      return rows.map((r) => ({
        id:              r.id,
        tenantId:        r.tenantId,
        storeId:         r.storeId,
        orderId:         r.orderId,
        customerPhone:   r.customerPhone,
        customerName:    r.customerName,
        subject:         r.subject,
        status:          r.status as ThreadStatus,
        unreadForBuyer:  r.unreadForBuyer,
        unreadForSeller: r.unreadForSeller,
        lastMessageAt:   toISO(r.lastMessageAt),
        lastMessageText: r.lastMessageText,
        lastSenderType:  r.lastSenderType as SenderType | null,
        closedAt:        toISO(r.closedAt),
        closedReason:    r.closedReason,
        createdAt:       r.createdAt.toISOString(),
        updatedAt:       r.updatedAt.toISOString(),
      }));
    });
  },

  /**
   * Cerrar un hilo. Opcionalmente con razón.
   */
  async close(
    tenantId: string,
    threadId: string,
    reason?: string,
  ): Promise<void> {
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE "ConversationThread"
          SET "status" = 'closed',
              "closedAt" = $1,
              "closedReason" = $2,
              "updatedAt" = $1
        WHERE "id" = $3 AND "tenantId" = $4`,
      now,
      reason ?? null,
      threadId,
      tenantId,
    );
    invalidateByPrefix(`chat:threads:${tenantId}`);
    invalidateByPrefix(`chat:messages:${tenantId}:${threadId}`);
    logger.info("[ChatThreads] closed", { tenantId, threadId, reason });

    // Notificar al buyer que el hilo se cerró (fire-and-forget, feature-gated)
    if (isFeatureEnabled("marketplace-chat-whatsapp", tenantId)) {
      const minuteBucket = Math.floor(now.getTime() / 60_000);
      enqueueChatNotification({
        event: "thread_closed",
        tenantId,
        threadId,
        closeReason: reason,
        idempotencyKey: `${threadId}:thread_closed:${minuteBucket}`,
      }).catch((err) => {
        logger.error("[ChatThreads] enqueue close notification failed", {
          threadId,
          error: String(err),
        });
      });
    }
  },
};

// ─── ChatMessagesDB ───────────────────────────────────────────────────────────

export const ChatMessagesDB = {
  /**
   * Enviar un mensaje a un hilo. Transacción:
   *   1. INSERT del mensaje
   *   2. UPDATE del thread con lastMessage* + unread counter del otro lado
   *
   * Bloquea el send si el thread está cerrado/bloqueado.
   */
  async send(params: {
    tenantId: string;
    threadId: string;
    senderType: SenderType;
    senderId?: string;
    senderName: string;
    body: string;
    messageType?: MessageType;
    attachmentUrl?: string;
    metadataJson?: string;
  }): Promise<DbConversationMessage> {
    const id = crypto.randomUUID();
    const now = new Date();
    const messageType = params.messageType ?? "text";

    // Verificar status del hilo primero (fuera de la transacción para error temprano)
    const threadCheck = await prisma.$queryRawUnsafe<
      Array<{ status: string }>
    >(
      `SELECT "status" FROM "ConversationThread"
        WHERE "id" = $1 AND "tenantId" = $2
        LIMIT 1`,
      params.threadId,
      params.tenantId,
    );
    if (!threadCheck[0]) {
      throw new Error(`Thread ${params.threadId} no existe`);
    }
    if (threadCheck[0].status !== "open") {
      throw new Error(`Thread ${params.threadId} está ${threadCheck[0].status}`);
    }

    const preview = params.body.length > 120 ? params.body.slice(0, 117) + "…" : params.body;

    await prisma.$transaction(async (tx) => {
      // 1. INSERT del mensaje
      await tx.$executeRawUnsafe(
        `INSERT INTO "ConversationMessage"
           ("id","tenantId","threadId","senderType","senderId","senderName","body",
            "messageType","attachmentUrl","metadataJson","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        id,
        params.tenantId,
        params.threadId,
        params.senderType,
        params.senderId ?? null,
        params.senderName,
        params.body,
        messageType,
        params.attachmentUrl ?? null,
        params.metadataJson ?? null,
        now,
      );

      // 2. UPDATE del thread — incrementar unread del OTRO lado
      const unreadColumn =
        params.senderType === "buyer"
          ? "unreadForSeller" // el buyer envió → el seller aún no lo leyó
          : params.senderType === "seller"
            ? "unreadForBuyer"
            : null; // mensajes del sistema no cuentan como unread

      if (unreadColumn) {
        await tx.$executeRawUnsafe(
          `UPDATE "ConversationThread"
              SET "lastMessageAt" = $1,
                  "lastMessageText" = $2,
                  "lastSenderType" = $3,
                  "${unreadColumn}" = "${unreadColumn}" + 1,
                  "updatedAt" = $1
            WHERE "id" = $4 AND "tenantId" = $5`,
          now,
          preview,
          params.senderType,
          params.threadId,
          params.tenantId,
        );
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE "ConversationThread"
              SET "lastMessageAt" = $1,
                  "lastMessageText" = $2,
                  "lastSenderType" = $3,
                  "updatedAt" = $1
            WHERE "id" = $4 AND "tenantId" = $5`,
          now,
          preview,
          params.senderType,
          params.threadId,
          params.tenantId,
        );
      }
    });

    invalidateByPrefix(`chat:messages:${params.tenantId}:${params.threadId}`);
    invalidateByPrefix(`chat:threads:${params.tenantId}`);
    // Bandeja buyer (Messenger del nav) — prefijo por phone, no por tenant.
    invalidateByPrefix(`chat:threads:buyer:`);

    logger.info("[ChatMessages] sent", {
      tenantId: params.tenantId,
      threadId: params.threadId,
      messageId: id,
      senderType: params.senderType,
    });

    // Emitir notificación WhatsApp al otro lado (fire-and-forget, feature-gated)
    if (
      (params.senderType === "seller" || params.senderType === "buyer") &&
      isFeatureEnabled("marketplace-chat-whatsapp", params.tenantId)
    ) {
      const event =
        params.senderType === "seller" ? "seller_responded" : "buyer_new_message";
      // Idempotency por minuto para evitar floods si hay varios mensajes seguidos
      const minuteBucket = Math.floor(now.getTime() / 60_000);
      enqueueChatNotification({
        event,
        tenantId: params.tenantId,
        threadId: params.threadId,
        messagePreview: preview,
        idempotencyKey: `${params.threadId}:${event}:${minuteBucket}`,
      }).catch((err) => {
        logger.error("[ChatMessages] enqueue notification failed", {
          threadId: params.threadId,
          event,
          error: String(err),
        });
      });
    }

    return {
      id,
      tenantId:       params.tenantId,
      threadId:       params.threadId,
      senderType:     params.senderType,
      senderId:       params.senderId ?? null,
      senderName:     params.senderName,
      body:           params.body,
      messageType,
      attachmentUrl:  params.attachmentUrl ?? null,
      metadataJson:   params.metadataJson ?? null,
      readByBuyerAt:  null,
      readBySellerAt: null,
      deletedAt:      null,
      createdAt:      now.toISOString(),
    };
  },

  /**
   * Lista los mensajes de un hilo ordenados cronológicamente (más viejos primero).
   * Cache corto (10s) porque es la vista activa del chat.
   */
  async listByThread(
    tenantId: string,
    threadId: string,
    limit = 100,
  ): Promise<DbConversationMessage[]> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 500);
    const cacheKey = `chat:messages:${tenantId}:${threadId}:${safeLimit}`;

    return getOrSet(cacheKey, 10, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          tenantId: string;
          threadId: string;
          senderType: string;
          senderId: string | null;
          senderName: string;
          body: string;
          messageType: string;
          attachmentUrl: string | null;
          metadataJson: string | null;
          readByBuyerAt: Date | null;
          readBySellerAt: Date | null;
          deletedAt: Date | null;
          createdAt: Date;
        }>
      >(
        `SELECT "id","tenantId","threadId","senderType","senderId","senderName","body",
                "messageType","attachmentUrl","metadataJson","readByBuyerAt","readBySellerAt",
                "deletedAt","createdAt"
           FROM "ConversationMessage"
          WHERE "tenantId" = $1 AND "threadId" = $2 AND "deletedAt" IS NULL
          ORDER BY "createdAt" ASC
          LIMIT $3`,
        tenantId,
        threadId,
        safeLimit,
      );

      return rows.map((r) => ({
        id:             r.id,
        tenantId:       r.tenantId,
        threadId:       r.threadId,
        senderType:     r.senderType as SenderType,
        senderId:       r.senderId,
        senderName:     r.senderName,
        body:           r.body,
        messageType:    r.messageType as MessageType,
        attachmentUrl:  r.attachmentUrl,
        metadataJson:   r.metadataJson,
        readByBuyerAt:  toISO(r.readByBuyerAt),
        readBySellerAt: toISO(r.readBySellerAt),
        deletedAt:      toISO(r.deletedAt),
        createdAt:      r.createdAt.toISOString(),
      }));
    });
  },

  /**
   * Marcar los mensajes del thread como leídos por el lado indicado.
   * Resetea el contador unread correspondiente en el thread.
   */
  async markAsRead(
    tenantId: string,
    threadId: string,
    side: "buyer" | "seller",
  ): Promise<void> {
    const now = new Date();
    const readColumn = side === "buyer" ? "readByBuyerAt" : "readBySellerAt";
    const unreadColumn = side === "buyer" ? "unreadForBuyer" : "unreadForSeller";

    await prisma.$transaction(async (tx) => {
      // Marcar los mensajes del otro lado como leídos
      await tx.$executeRawUnsafe(
        `UPDATE "ConversationMessage"
            SET "${readColumn}" = $1
          WHERE "threadId" = $2
            AND "tenantId" = $3
            AND "${readColumn}" IS NULL
            AND "senderType" != $4`,
        now,
        threadId,
        tenantId,
        side, // no marcamos como leídos los mensajes propios
      );
      // Resetear contador unread del lado que leyó
      await tx.$executeRawUnsafe(
        `UPDATE "ConversationThread"
            SET "${unreadColumn}" = 0, "updatedAt" = $1
          WHERE "id" = $2 AND "tenantId" = $3`,
        now,
        threadId,
        tenantId,
      );
    });

    invalidateByPrefix(`chat:messages:${tenantId}:${threadId}`);
    invalidateByPrefix(`chat:threads:${tenantId}`);
    // Bandeja buyer (Messenger del nav) — prefijo por phone, no por tenant.
    invalidateByPrefix(`chat:threads:buyer:`);

    logger.info("[ChatMessages] marked as read", { tenantId, threadId, side });
  },
};
