import "server-only";

/**
 * lib/db/telegram.db.ts
 *
 * Qué chat de Telegram pertenece a qué negocio.
 *
 * El webhook de Telegram llega SIN tenant: trae un `chat.id` y nada más. Por eso
 * hace falta el camino inverso —de chat a negocio— y por eso vive en una DB
 * class: es la única forma legítima de consultar la base cruzando tenants.
 *
 * Los vínculos viven en `Settings.featureFlagsJson` bajo `telegramChats`, igual
 * que los flujos de n8n: es configuración del negocio, no schema.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface ChatVinculado {
  /** `chat.id` de Telegram. Puede ser negativo (grupos). */
  chatId: number;
  /** Cómo se llama quien vinculó — para poder desvincular sabiendo quién es. */
  nombre: string;
  vinculadoEn: string;
  /** Última vez que ese chat anotó algo. */
  ultimoUso?: string | null;
}

const CLAVE = "telegramChats";

/**
 * Caché de chat → tenant.
 *
 * Cada mensaje de Telegram dispara esta búsqueda, y sin caché sería un LIKE
 * sobre `Settings` por cada «ok» que alguien toca. Se invalida al vincular y al
 * desvincular; el TTL es la red por si dos instancias no se enteran.
 */
const cache = new Map<number, { tenantId: string; expira: number }>();
const TTL_MS = 5 * 60 * 1000;

function leerFlags(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function leerChats(json: string | null | undefined): ChatVinculado[] {
  const v = leerFlags(json)[CLAVE];
  return Array.isArray(v) ? (v as ChatVinculado[]) : [];
}

export const TelegramDB = {
  /** Los chats vinculados de un negocio. */
  async listar(tenantId: string): Promise<ChatVinculado[]> {
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;
    return leerChats(row?.featureFlagsJson);
  },

  /**
   * De qué negocio es este chat. `null` si no está vinculado.
   *
   * El `contains` busca `"chatId":123` dentro del JSON. No es elegante, pero
   * `Settings` tiene una fila por negocio: el escaneo es de decenas de filas, no
   * de millones, y evita una tabla nueva para un puente de dos columnas.
   */
  async tenantDeChat(chatId: number): Promise<string | null> {
    const enCache = cache.get(chatId);
    if (enCache && enCache.expira > Date.now()) return enCache.tenantId;

    const filas = (await prisma.settings.findMany({
      where: { featureFlagsJson: { contains: `"chatId":${chatId}` } },
      select: { tenantId: true, featureFlagsJson: true },
    })) as Array<{ tenantId: string; featureFlagsJson: string | null }>;

    for (const fila of filas) {
      // El `contains` puede pegarle a `"chatId":1234` buscando `"chatId":123`,
      // así que la pertenencia se confirma parseando de verdad.
      if (leerChats(fila.featureFlagsJson).some((c) => c.chatId === chatId)) {
        cache.set(chatId, { tenantId: fila.tenantId, expira: Date.now() + TTL_MS });
        return fila.tenantId;
      }
    }
    return null;
  },

  /** Vincula un chat a un negocio. Idempotente: revincular sólo actualiza. */
  async vincular(tenantId: string, chat: Omit<ChatVinculado, "vinculadoEn">): Promise<ChatVinculado[]> {
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;

    const flags = leerFlags(row?.featureFlagsJson);
    const chats = leerChats(row?.featureFlagsJson).filter((c) => c.chatId !== chat.chatId);
    const nuevos = [...chats, { ...chat, vinculadoEn: new Date().toISOString() }];

    await prisma.settings.upsert({
      where: { tenantId },
      update: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: nuevos }) },
      create: { tenantId, featureFlagsJson: JSON.stringify({ [CLAVE]: nuevos }) },
    });
    cache.set(chat.chatId, { tenantId, expira: Date.now() + TTL_MS });
    logger.info("[telegram] chat vinculado", { tenantId, chatId: chat.chatId });
    return nuevos;
  },

  /** Corta el vínculo. El chat deja de poder anotar al instante. */
  async desvincular(tenantId: string, chatId: number): Promise<ChatVinculado[]> {
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;

    const flags = leerFlags(row?.featureFlagsJson);
    const quedan = leerChats(row?.featureFlagsJson).filter((c) => c.chatId !== chatId);
    await prisma.settings.upsert({
      where: { tenantId },
      update: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: quedan }) },
      create: { tenantId, featureFlagsJson: JSON.stringify({ [CLAVE]: quedan }) },
    });
    cache.delete(chatId);
    logger.info("[telegram] chat desvinculado", { tenantId, chatId });
    return quedan;
  },

  /** Marca que ese chat anotó algo. Fire-and-forget: no puede tumbar el mensaje. */
  async marcarUso(tenantId: string, chatId: number): Promise<void> {
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;
    const flags = leerFlags(row?.featureFlagsJson);
    const chats = leerChats(row?.featureFlagsJson).map((c) =>
      c.chatId === chatId ? { ...c, ultimoUso: new Date().toISOString() } : c,
    );
    await prisma.settings.update({
      where: { tenantId },
      data: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: chats }) },
    });
  },
};
