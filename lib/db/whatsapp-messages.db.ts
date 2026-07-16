import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * lib/db/whatsapp-messages.db.ts — WhatsApp Inbox (Meta Cloud API)
 *
 * Log de mensajes in/out por tenant+cliente para el inbox del admin
 * (MensajesHub → sub-tab WhatsApp). Migración manual 310.
 *
 * Patrón de la casa:
 *   - tenantId como primer parámetro en TODAS las funciones
 *   - Cache getOrSet TTL corto (el inbox pollea cada 5-8s) + invalidateByPrefix tras writes
 *   - Dedupe por waMessageId (Meta re-entrega webhooks; el unique index lo bloquea)
 */

const CACHE_PREFIX = "whatsapp-inbox";

export type WaDirection = "in" | "out";
export type WaSentBy = "customer" | "ai" | "admin";
export type WaStatus = "received" | "sent" | "failed";

export type DbWhatsAppMessage = {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  customerPhone: string;
  customerName: string;
  direction: WaDirection;
  sentBy: WaSentBy;
  body: string;
  waMessageId: string | null;
  status: WaStatus;
  read: boolean;
  createdAt: string;
};

export type DbWhatsAppConversationSummary = {
  customerPhone: string;
  customerName: string;
  /** Número del negocio por el que habla este cliente (multi-número). */
  phoneNumberId: string;
  lastMessage: string;
  lastDirection: WaDirection;
  lastSentBy: WaSentBy;
  lastAt: string;
  unread: number;
};

type PWhatsAppMessage = {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  customerPhone: string;
  customerName: string;
  direction: string;
  sentBy: string;
  body: string;
  waMessageId: string | null;
  status: string;
  read: boolean;
  createdAt: Date;
};

function mapMessage(m: PWhatsAppMessage): DbWhatsAppMessage {
  return {
    id: m.id,
    tenantId: m.tenantId,
    phoneNumberId: m.phoneNumberId,
    customerPhone: m.customerPhone,
    customerName: m.customerName,
    direction: m.direction as WaDirection,
    sentBy: m.sentBy as WaSentBy,
    body: m.body,
    waMessageId: m.waMessageId,
    status: m.status as WaStatus,
    read: m.read,
    createdAt: m.createdAt.toISOString(),
  };
}

export type DbWhatsAppConfig = {
  id: string;
  tenantId: string;
  label: string | null;
  phoneNumberId: string;
  whatsappToken: string;
  webhookVerifyToken: string;
  wabaId: string | null;
  businessName: string | null;
  yapeNumber: string | null;
  isActive: boolean;
};

/**
 * Números WhatsApp del tenant (TenantWhatsAppConfig, multi-número desde 311).
 * Cache corto: los usan el inbox (envíos), el selector y el test de conexión.
 * Los writes (whatsapp-config route) invalidan `whatsapp-inbox:{tenantId}`.
 */
export async function listWhatsAppConfigs(tenantId: string): Promise<DbWhatsAppConfig[]> {
  return getOrSet(`${CACHE_PREFIX}:${tenantId}:config`, 30, async () => {
    const rows = await prisma.tenantWhatsAppConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      label: row.label,
      phoneNumberId: row.phoneNumberId,
      whatsappToken: row.whatsappToken,
      webhookVerifyToken: row.webhookVerifyToken,
      wabaId: row.wabaId,
      businessName: row.businessName,
      yapeNumber: row.yapeNumber,
      isActive: row.isActive,
    }));
  });
}

/** Config del número por el que habla una conversación; null si no existe. */
export async function getConfigForPhoneNumberId(
  tenantId: string,
  phoneNumberId: string,
): Promise<DbWhatsAppConfig | null> {
  const configs = await listWhatsAppConfigs(tenantId);
  return configs.find((c) => c.phoneNumberId === phoneNumberId) ?? null;
}

/** Primer número activo del tenant (fallback de envío / compat single-número). */
export async function getWhatsAppConfig(tenantId: string): Promise<DbWhatsAppConfig | null> {
  const configs = await listWhatsAppConfigs(tenantId);
  return configs.find((c) => c.isActive) ?? configs[0] ?? null;
}

export const WhatsAppMessagesDB = {
  /**
   * Lista de conversaciones agrupadas por customerPhone, ordenadas por el
   * mensaje más reciente. Incluye contador de no leídos (inbound sin leer) y
   * el número del negocio del último mensaje. Filtro opcional por número.
   */
  async listConversations(
    tenantId: string,
    phoneNumberId?: string,
  ): Promise<DbWhatsAppConversationSummary[]> {
    const cacheKey = `${CACHE_PREFIX}:${tenantId}:convs:${phoneNumberId ?? "all"}`;
    return getOrSet(cacheKey, 5, async () => {
      const filterSql = phoneNumberId ? `AND m."phoneNumberId" = $2` : "";
      const params: string[] = phoneNumberId ? [tenantId, phoneNumberId] : [tenantId];
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          customerPhone: string;
          customerName: string;
          phoneNumberId: string;
          lastMessage: string;
          lastDirection: string;
          lastSentBy: string;
          lastAt: Date;
          unread: bigint;
        }>
      >(
        `SELECT DISTINCT ON (m."customerPhone")
           m."customerPhone" AS "customerPhone",
           m."customerName"  AS "customerName",
           m."phoneNumberId" AS "phoneNumberId",
           m."body"          AS "lastMessage",
           m."direction"     AS "lastDirection",
           m."sentBy"        AS "lastSentBy",
           m."createdAt"     AS "lastAt",
           (SELECT COUNT(*) FROM "WhatsAppMessage" u
             WHERE u."tenantId" = $1 AND u."customerPhone" = m."customerPhone"
               AND u."direction" = 'in' AND u."read" = false) AS "unread"
         FROM "WhatsAppMessage" m
         WHERE m."tenantId" = $1 ${filterSql}
         ORDER BY m."customerPhone", m."createdAt" DESC`,
        ...params,
      );
      return rows
        .map((r) => ({
          customerPhone: r.customerPhone,
          customerName: r.customerName,
          phoneNumberId: r.phoneNumberId,
          lastMessage: r.lastMessage,
          lastDirection: r.lastDirection as WaDirection,
          lastSentBy: r.lastSentBy as WaSentBy,
          lastAt: r.lastAt.toISOString(),
          unread: Number(r.unread),
        }))
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
    });
  },

  /** Hilo completo con un cliente (ascendente por fecha, últimos 200). */
  async listMessages(tenantId: string, customerPhone: string): Promise<DbWhatsAppMessage[]> {
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:msgs:${customerPhone}`, 4, async () => {
      const rows = await prisma.whatsAppMessage.findMany({
        where: { tenantId, customerPhone },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return rows.reverse().map(mapMessage);
    });
  },

  /** Total de mensajes entrantes sin leer del tenant (badge del sidebar). */
  async unreadCount(tenantId: string): Promise<number> {
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:unread`, 8, async () => {
      return prisma.whatsAppMessage.count({
        where: { tenantId, direction: "in", read: false },
      });
    });
  },

  /**
   * Inserta un mensaje del log. Dedupe por waMessageId: si Meta re-entrega el
   * webhook, el unique index lanza P2002 y devolvemos null (no es error).
   */
  async append(
    tenantId: string,
    data: {
      phoneNumberId: string;
      customerPhone: string;
      customerName?: string;
      direction: WaDirection;
      sentBy: WaSentBy;
      body: string;
      waMessageId?: string | null;
      status?: WaStatus;
    },
  ): Promise<DbWhatsAppMessage | null> {
    try {
      const row = await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          phoneNumberId: data.phoneNumberId,
          customerPhone: data.customerPhone,
          customerName: data.customerName ?? "Cliente",
          direction: data.direction,
          sentBy: data.sentBy,
          body: data.body,
          waMessageId: data.waMessageId ?? null,
          status: data.status ?? (data.direction === "in" ? "received" : "sent"),
          // Los salientes nacen "leídos" (los escribió el negocio o su IA)
          read: data.direction === "out",
        },
      });
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      // El badge del sidebar (waUnread) vive en el cache de /api/admin/stats
      invalidate(`admin:stats:${tenantId}`);
      return mapMessage(row);
    } catch (err) {
      // P2002 = waMessageId duplicado → webhook re-entregado, ignorar silencioso
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
        return null;
      }
      logger.error("[whatsapp-messages.db] append failed", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  /** Marca como leídos todos los mensajes entrantes de una conversación. */
  async markRead(tenantId: string, customerPhone: string): Promise<number> {
    const res = await prisma.whatsAppMessage.updateMany({
      where: { tenantId, customerPhone, direction: "in", read: false },
      data: { read: true },
    });
    if (res.count > 0) {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      invalidate(`admin:stats:${tenantId}`);
    }
    return res.count;
  },
};
