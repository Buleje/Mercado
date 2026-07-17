import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

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
  /** Media entrante (foto/audio/video/doc): asset en el CDN de Meta. */
  mediaId: string | null;
  mediaMime: string | null;
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
  mediaId: string | null;
  mediaMime: string | null;
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
    mediaId: m.mediaId,
    mediaMime: m.mediaMime,
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

// ── Pausa del bot por conversación ────────────────────────────────────────────
// Cuando el dueño atiende un hilo a mano, el bot IA se calla en ESE hilo.
// Persistido en PlatformSetting `wa-bot-paused:{tenantId}` (lista de teléfonos)
// — cero migración, sobrevive a la expiración de WhatsAppConversation (TTL 30min).

function botPausedKey(tenantId: string): string {
  return `wa-bot-paused:${tenantId}`;
}

/** Teléfonos con el bot pausado en este tenant. */
export async function getBotPausedPhones(tenantId: string): Promise<string[]> {
  const list = await PlatformSettingsDB.get<string[]>(botPausedKey(tenantId));
  return Array.isArray(list) ? list : [];
}

/** Pausa/reanuda el bot para un cliente. Devuelve la lista resultante. */
export async function setBotPaused(
  tenantId: string,
  customerPhone: string,
  paused: boolean,
): Promise<string[]> {
  const current = await getBotPausedPhones(tenantId);
  const next = paused
    ? Array.from(new Set([...current, customerPhone]))
    : current.filter((p) => p !== customerPhone);
  await PlatformSettingsDB.set(botPausedKey(tenantId), next, `wa-inbox:${tenantId}`);
  return next;
}

// ── Conversaciones archivadas ─────────────────────────────────────────────────
// Ordena el inbox: lo archivado no aparece en la lista principal (pero sigue
// recibiendo mensajes; si el cliente escribe, el operador puede desarchivar).

function archivedKey(tenantId: string): string {
  return `wa-archived:${tenantId}`;
}

export async function getArchivedPhones(tenantId: string): Promise<string[]> {
  const list = await PlatformSettingsDB.get<string[]>(archivedKey(tenantId));
  return Array.isArray(list) ? list : [];
}

export async function setArchived(
  tenantId: string,
  customerPhone: string,
  archived: boolean,
): Promise<string[]> {
  const current = await getArchivedPhones(tenantId);
  const next = archived
    ? Array.from(new Set([...current, customerPhone]))
    : current.filter((p) => p !== customerPhone);
  await PlatformSettingsDB.set(archivedKey(tenantId), next, `wa-inbox:${tenantId}`);
  return next;
}

// ── Notas internas por conversación ───────────────────────────────────────────
// Memoria del equipo ("quedó en pasar el viernes") — el cliente NUNCA las ve.
// PlatformSetting `wa-notes:{tenantId}` = { [customerPhone]: string }.

function notesKey(tenantId: string): string {
  return `wa-notes:${tenantId}`;
}

export async function getNotesMap(tenantId: string): Promise<Record<string, string>> {
  const map = await PlatformSettingsDB.get<Record<string, string>>(notesKey(tenantId));
  return map && typeof map === "object" ? map : {};
}

export async function setConversationNote(
  tenantId: string,
  customerPhone: string,
  note: string,
): Promise<Record<string, string>> {
  const map = await getNotesMap(tenantId);
  const next = { ...map };
  const trimmed = note.trim();
  if (!trimmed) delete next[customerPhone];
  else next[customerPhone] = trimmed.slice(0, 500);
  await PlatformSettingsDB.set(notesKey(tenantId), next, `wa-inbox:${tenantId}`);
  return next;
}

// ── Etiquetas de triage por conversación ──────────────────────────────────────
// Nuevo/Pedido/Pagado/Pendiente/Reclamo/VIP — compartidas entre cajeros.
// PlatformSetting `wa-labels:{tenantId}` = { [customerPhone]: string[] }.

function labelsKey(tenantId: string): string {
  return `wa-labels:${tenantId}`;
}

export async function getLabelsMap(tenantId: string): Promise<Record<string, string[]>> {
  const map = await PlatformSettingsDB.get<Record<string, string[]>>(labelsKey(tenantId));
  return map && typeof map === "object" ? map : {};
}

export async function setConversationLabels(
  tenantId: string,
  customerPhone: string,
  labels: string[],
): Promise<Record<string, string[]>> {
  const map = await getLabelsMap(tenantId);
  const next = { ...map };
  if (labels.length === 0) delete next[customerPhone];
  else next[customerPhone] = labels;
  await PlatformSettingsDB.set(labelsKey(tenantId), next, `wa-inbox:${tenantId}`);
  return next;
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
      mediaId?: string | null;
      mediaMime?: string | null;
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
          mediaId: data.mediaId ?? null,
          mediaMime: data.mediaMime ?? null,
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

  /**
   * Búsqueda global en el CONTENIDO de los mensajes (todas las conversaciones).
   * Devuelve los últimos matches con su hilo para saltar directo.
   */
  async searchMessages(
    tenantId: string,
    q: string,
  ): Promise<
    Array<{
      customerPhone: string;
      customerName: string;
      body: string;
      direction: WaDirection;
      createdAt: string;
    }>
  > {
    const rows = await prisma.whatsAppMessage.findMany({
      where: { tenantId, body: { contains: q, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        customerPhone: true,
        customerName: true,
        body: true,
        direction: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      customerPhone: r.customerPhone,
      customerName: r.customerName,
      body: r.body.slice(0, 120),
      direction: r.direction as WaDirection,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  /** Mensaje del tenant que referencia un mediaId (tenancy del proxy de media). */
  async findByMediaId(
    tenantId: string,
    mediaId: string,
  ): Promise<{ phoneNumberId: string; mediaMime: string | null } | null> {
    const row = await prisma.whatsAppMessage.findFirst({
      where: { tenantId, mediaId },
      select: { phoneNumberId: true, mediaMime: true },
    });
    return row ?? null;
  },

  /**
   * Estadísticas del día (zona Lima, UTC-5 fijo): volumen, quién respondió
   * (bot vs humano) y tiempo de primera respuesta promedio.
   */
  async statsToday(tenantId: string): Promise<{
    recibidos: number;
    respondidos: number;
    porBot: number;
    porHumano: number;
    chatsActivos: number;
    respPromedioMin: number | null;
  }> {
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:stats-hoy`, 60, async () => {
      const LIMA_OFFSET_MS = 5 * 3_600_000; // Perú no tiene DST
      const lima = new Date(Date.now() - LIMA_OFFSET_MS);
      const start = new Date(
        Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()) + LIMA_OFFSET_MS,
      );
      const msgs = await prisma.whatsAppMessage.findMany({
        where: { tenantId, createdAt: { gte: start } },
        orderBy: { createdAt: "asc" },
        select: { direction: true, sentBy: true, customerPhone: true, createdAt: true },
        take: 2000,
      });

      const recibidos = msgs.filter((m) => m.direction === "in").length;
      const salientes = msgs.filter((m) => m.direction === "out");
      const porBot = salientes.filter((m) => m.sentBy === "ai").length;
      const porHumano = salientes.filter((m) => m.sentBy === "admin").length;
      const chatsActivos = new Set(msgs.map((m) => m.customerPhone)).size;

      // Tiempo de respuesta: para cada entrante, el próximo saliente del mismo hilo
      const diffs: number[] = [];
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.direction !== "in") continue;
        for (let j = i + 1; j < msgs.length; j++) {
          const r = msgs[j];
          if (r.customerPhone === m.customerPhone) {
            if (r.direction === "out") {
              diffs.push(r.createdAt.getTime() - m.createdAt.getTime());
            }
            break; // el siguiente mensaje del hilo (in u out) corta la ventana
          }
        }
      }
      const respPromedioMin = diffs.length
        ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length / 60000) * 10) / 10
        : null;

      return { recibidos, respondidos: diffs.length, porBot, porHumano, chatsActivos, respPromedioMin };
    });
  },

  /**
   * "Dejar como no leída": marca el ÚLTIMO entrante como no leído para que la
   * conversación vuelva a resaltar en la bandeja (recordatorio de volver).
   */
  async markUnread(tenantId: string, customerPhone: string): Promise<number> {
    const last = await prisma.whatsAppMessage.findFirst({
      where: { tenantId, customerPhone, direction: "in" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!last) return 0;
    await prisma.whatsAppMessage.update({ where: { id: last.id }, data: { read: false } });
    invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    invalidate(`admin:stats:${tenantId}`);
    return 1;
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
