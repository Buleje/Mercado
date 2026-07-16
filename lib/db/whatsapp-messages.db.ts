import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
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
  tenantId: string;
  phoneNumberId: string;
  whatsappToken: string;
  webhookVerifyToken: string;
  businessName: string | null;
  yapeNumber: string | null;
  isActive: boolean;
};

/**
 * Config del número WhatsApp del tenant (TenantWhatsAppConfig).
 * Cache corto: la usan el inbox (envíos) y el test de conexión.
 */
export async function getWhatsAppConfig(tenantId: string): Promise<DbWhatsAppConfig | null> {
  return getOrSet(`${CACHE_PREFIX}:${tenantId}:config`, 30, async () => {
    const row = await prisma.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
    if (!row) return null;
    return {
      tenantId: row.tenantId,
      phoneNumberId: row.phoneNumberId,
      whatsappToken: row.whatsappToken,
      webhookVerifyToken: row.webhookVerifyToken,
      businessName: row.businessName,
      yapeNumber: row.yapeNumber,
      isActive: row.isActive,
    };
  });
}

export const WhatsAppMessagesDB = {
  /**
   * Lista de conversaciones agrupadas por customerPhone, ordenadas por el
   * mensaje más reciente. Incluye contador de no leídos (inbound sin leer).
   */
  async listConversations(tenantId: string): Promise<DbWhatsAppConversationSummary[]> {
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:convs`, 5, async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          customerPhone: string;
          customerName: string;
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
           m."body"          AS "lastMessage",
           m."direction"     AS "lastDirection",
           m."sentBy"        AS "lastSentBy",
           m."createdAt"     AS "lastAt",
           (SELECT COUNT(*) FROM "WhatsAppMessage" u
             WHERE u."tenantId" = $1 AND u."customerPhone" = m."customerPhone"
               AND u."direction" = 'in' AND u."read" = false) AS "unread"
         FROM "WhatsAppMessage" m
         WHERE m."tenantId" = $1
         ORDER BY m."customerPhone", m."createdAt" DESC`,
        tenantId,
      );
      return rows
        .map((r) => ({
          customerPhone: r.customerPhone,
          customerName: r.customerName,
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
      await invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
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
    if (res.count > 0) await invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    return res.count;
  },
};
