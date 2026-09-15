import "server-only";

/**
 * lib/db/whatsapp-duenos.db.ts
 *
 * Qué teléfonos pueden ANOTAR en los libros por WhatsApp.
 *
 * ── Por qué existe esta lista ────────────────────────────────────────────────
 * El número de WhatsApp del negocio ya atiende clientes (el Concierge, ADR-058).
 * El dueño escribe al MISMO número, así que el webhook necesita saber, antes de
 * hacer nada, de qué lado está quien escribió. La regla es una lista blanca y no
 * una heurística a propósito: confundirse hacia el lado equivocado significa
 * darle a un cliente una herramienta que escribe plata.
 *
 * Por eso el default es SIEMPRE cliente. Un teléfono anota únicamente si está
 * en esta lista, y entra a la lista únicamente canjeando un código que el dueño
 * pidió desde el panel (`lib/asistente/vinculacion.ts`).
 *
 * ── Por qué vive en Settings y no en una tabla ───────────────────────────────
 * Mismo criterio que `TelegramDB` (ADR-388): es un puente de dos columnas y una
 * tabla nueva necesitaría `DIRECT_URL` para migrar. `Settings` tiene una fila
 * por negocio.
 *
 * `tenantId` 1er parámetro en toda operación.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface DuenoVinculado {
  /** Sólo dígitos, como llega de Meta (`wa_id`). Ver `normalizarTelefono`. */
  telefono: string;
  /** Cómo se llama quien vinculó — para poder desvincular sabiendo quién es. */
  nombre: string;
  vinculadoEn: string;
  /** Última vez que ese teléfono anotó algo. */
  ultimoUso?: string | null;
}

const CLAVE = "whatsappDuenos";

/**
 * Meta manda el `wa_id` sin `+` ni separadores, pero el dueño tipea su número
 * como se le ocurre. Todo se guarda y se compara en dígitos pelados: un `+51`
 * de un lado y un `51` del otro es el vínculo que "no funciona sin razón".
 */
export function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Caché de «¿este teléfono puede anotar en ESTE negocio?».
 *
 * CADA mensaje que entra al número del negocio —los de clientes también— pasa
 * por esta consulta para decidir de qué lado cae. Sin caché sería un LIKE sobre
 * `Settings` por cada "hola" de un cliente. Se invalida al vincular y al
 * desvincular; el TTL es la red por si dos instancias no se enteran.
 *
 * ⚠️ La llave incluye el TENANT, no sólo el teléfono. Cachear por teléfono solo
 * parece equivalente —un número pertenece a un negocio— pero nada impide que el
 * mismo teléfono esté habilitado en dos: ahí la respuesta pasaría a depender de
 * cuál se consultó primero, y el segundo negocio vería a su propio dueño como
 * cliente. La llave compuesta lo vuelve imposible y además se invalida sola:
 * habilitar un teléfono en A no puede ensuciar lo que B tenga cacheado.
 */
const cache = new Map<string, { puede: boolean; expira: number }>();
const TTL_MS = 5 * 60 * 1000;

const llaveCache = (tenantId: string, telefono: string) => `${tenantId}::${telefono}`;

function leerFlags(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function leerDuenos(json: string | null | undefined): DuenoVinculado[] {
  const v = leerFlags(json)[CLAVE];
  return Array.isArray(v) ? (v as DuenoVinculado[]) : [];
}

export const WhatsAppDuenosDB = {
  /**
   * ¿El negocio tiene un número de WhatsApp activo al que escribirle?
   *
   * `TenantWhatsAppConfig` guarda el `phoneNumberId` de Meta, no el número que
   * se marca — así que se devuelve el nombre configurado y no un número que no
   * tenemos. Prometer un número que no existe es peor que no mostrar ninguno.
   */
  async numeroDelNegocio(tenantId: string): Promise<{ activo: boolean; comoSeLlama: string | null }> {
    const cfg = (await prisma.tenantWhatsAppConfig.findFirst({
      where: { tenantId, isActive: true },
      select: { label: true, businessName: true },
    })) as { label: string | null; businessName: string | null } | null;
    return { activo: Boolean(cfg), comoSeLlama: cfg?.label ?? cfg?.businessName ?? null };
  },

  /** Los teléfonos que pueden anotar en este negocio. */
  async listar(tenantId: string): Promise<DuenoVinculado[]> {
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;
    return leerDuenos(row?.featureFlagsJson);
  },

  /**
   * ¿Este teléfono puede anotar EN ESTE NEGOCIO? `false` = es un cliente.
   *
   * El `tenantId` que se pasa es el del número que RECIBIÓ el mensaje. Un
   * teléfono habilitado en el negocio A que le escribe al WhatsApp del negocio
   * B tiene que caer como cliente de B: la pregunta nunca es «¿de quién es este
   * teléfono?» sino «¿está en la lista de este negocio?».
   */
  async puedeAnotar(tenantIdDelNumero: string, telefonoCrudo: string): Promise<boolean> {
    const telefono = normalizarTelefono(telefonoCrudo);
    if (!telefono) return false;

    const llave = llaveCache(tenantIdDelNumero, telefono);
    const enCache = cache.get(llave);
    if (enCache && enCache.expira > Date.now()) return enCache.puede;

    /**
     * Se consulta directo la fila de ESTE negocio en vez de buscar el teléfono
     * por todo `Settings`: la pregunta es «¿está en la lista de este negocio?»,
     * y preguntarlo así es una lectura por PK en lugar de un LIKE sobre todas
     * las filas.
     */
    const fila = (await prisma.settings.findUnique({
      where: { tenantId: tenantIdDelNumero },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;

    const puede = leerDuenos(fila?.featureFlagsJson).some((d) => d.telefono === telefono);
    // El "no está" también se cachea: es la respuesta para TODOS los clientes,
    // o sea la abrumadora mayoría de los mensajes que entran.
    cache.set(llave, { puede, expira: Date.now() + TTL_MS });
    return puede;
  },

  /** Vincula un teléfono a un negocio. Idempotente: revincular sólo actualiza. */
  async vincular(tenantId: string, dueno: Omit<DuenoVinculado, "vinculadoEn">): Promise<DuenoVinculado[]> {
    const telefono = normalizarTelefono(dueno.telefono);
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;

    const flags = leerFlags(row?.featureFlagsJson);
    const otros = leerDuenos(row?.featureFlagsJson).filter((d) => d.telefono !== telefono);
    const nuevos = [...otros, { ...dueno, telefono, vinculadoEn: new Date().toISOString() }];

    await prisma.settings.upsert({
      where: { tenantId },
      update: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: nuevos }) },
      create: { tenantId, featureFlagsJson: JSON.stringify({ [CLAVE]: nuevos }) },
    });
    cache.set(llaveCache(tenantId, telefono), { puede: true, expira: Date.now() + TTL_MS });
    logger.info("[whatsapp] teléfono vinculado para anotar", { tenantId });
    return nuevos;
  },

  /** Corta el vínculo. Ese teléfono vuelve a ser un cliente al instante. */
  async desvincular(tenantId: string, telefonoCrudo: string): Promise<DuenoVinculado[]> {
    const telefono = normalizarTelefono(telefonoCrudo);
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;

    const flags = leerFlags(row?.featureFlagsJson);
    const nuevos = leerDuenos(row?.featureFlagsJson).filter((d) => d.telefono !== telefono);

    await prisma.settings.upsert({
      where: { tenantId },
      update: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: nuevos }) },
      create: { tenantId, featureFlagsJson: JSON.stringify({ [CLAVE]: nuevos }) },
    });
    // Se marca como NO en vez de borrar: el próximo mensaje de ese teléfono
    // tiene que caer como cliente ya mismo, sin depender de releer.
    cache.set(llaveCache(tenantId, telefono), { puede: false, expira: Date.now() + TTL_MS });
    logger.info("[whatsapp] teléfono desvinculado", { tenantId });
    return nuevos;
  },

  /** Marca que este teléfono anotó algo (para la pantalla de vínculos). */
  async marcarUso(tenantId: string, telefonoCrudo: string): Promise<void> {
    const telefono = normalizarTelefono(telefonoCrudo);
    const row = (await prisma.settings.findUnique({
      where: { tenantId },
      select: { featureFlagsJson: true },
    })) as { featureFlagsJson: string | null } | null;
    const flags = leerFlags(row?.featureFlagsJson);
    const duenos = leerDuenos(row?.featureFlagsJson);
    if (!duenos.some((d) => d.telefono === telefono)) return;

    const nuevos = duenos.map((d) =>
      d.telefono === telefono ? { ...d, ultimoUso: new Date().toISOString() } : d,
    );
    await prisma.settings.update({
      where: { tenantId },
      data: { featureFlagsJson: JSON.stringify({ ...flags, [CLAVE]: nuevos }) },
    });
  },
};
