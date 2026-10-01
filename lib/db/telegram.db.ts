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

/**
 * Saca este chat de todo negocio que NO sea el destino.
 *
 * Es lo que hace que «mudar el chat al forestal» sea de verdad una mudanza y no
 * una copia. Se recorre por `contains` igual que la lectura, y se confirma
 * parseando: el LIKE es un filtro barato, no la prueba.
 */
async function sacarDeOtrosNegocios(tenantIdDestino: string, chatId: number): Promise<void> {
  const filas = (await prisma.settings.findMany({
    where: { featureFlagsJson: { contains: `"chatId":${chatId}` } },
    select: { tenantId: true, featureFlagsJson: true },
  })) as Array<{ tenantId: string; featureFlagsJson: string | null }>;

  for (const fila of filas) {
    if (fila.tenantId === tenantIdDestino) continue;
    const chats = leerChats(fila.featureFlagsJson);
    if (!chats.some((c) => c.chatId === chatId)) continue;

    const flags = leerFlags(fila.featureFlagsJson);
    await prisma.settings.update({
      where: { tenantId: fila.tenantId },
      data: {
        featureFlagsJson: JSON.stringify({
          ...flags,
          [CLAVE]: chats.filter((c) => c.chatId !== chatId),
        }),
      },
    });
    logger.info("[telegram] chat mudado de negocio", {
      desde: fila.tenantId,
      hacia: tenantIdDestino,
      chatId,
    });
  }
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

    /**
     * Se juntan TODAS las coincidencias en vez de cortar en la primera.
     *
     * `vincular()` saca el chat de cualquier otro negocio, así que un chat en
     * dos lugares no debería existir. Pero si existiera —datos anteriores a ese
     * arreglo, dos instancias escribiendo a la vez— cortar en la primera hace
     * que a QUÉ negocio se anota dependa del orden en que la base devuelva las
     * filas: la misma frase podría caer en un libro distinto entre dos
     * mensajes, sin que nada lo diga. Eligiendo siempre el vínculo más reciente
     * la respuesta es estable, y el warning deja el rastro para arreglarlo.
     */
    const candidatos: Array<{ tenantId: string; vinculadoEn: string }> = [];
    for (const fila of filas) {
      // El `contains` puede pegarle a `"chatId":1234` buscando `"chatId":123`,
      // así que la pertenencia se confirma parseando de verdad.
      const chat = leerChats(fila.featureFlagsJson).find((c) => c.chatId === chatId);
      if (chat) candidatos.push({ tenantId: fila.tenantId, vinculadoEn: chat.vinculadoEn ?? "" });
    }
    if (candidatos.length === 0) return null;

    if (candidatos.length > 1) {
      logger.warn("[telegram] un chat vinculado a varios negocios — se usa el más reciente", {
        chatId,
        negocios: candidatos.map((c) => c.tenantId),
      });
      candidatos.sort((a, b) => b.vinculadoEn.localeCompare(a.vinculadoEn));
    }

    const elegido = candidatos[0].tenantId;
    cache.set(chatId, { tenantId: elegido, expira: Date.now() + TTL_MS });
    return elegido;
  },

  /**
   * Vincula un chat a un negocio. Idempotente: revincular sólo actualiza.
   *
   * ⭐ Un chat pertenece a UN negocio: vincularlo acá lo saca de cualquier otro.
   * Sin eso, «mudar» el chat de la bodega al forestal lo dejaba en los dos y a
   * cuál se anotaba pasaba a depender del orden en que la base devolviera las
   * filas. Es más barato hacer imposible el estado ambiguo que resolverlo bien
   * en cada lectura.
   */
  async vincular(tenantId: string, chat: Omit<ChatVinculado, "vinculadoEn">): Promise<ChatVinculado[]> {
    await sacarDeOtrosNegocios(tenantId, chat.chatId);

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
