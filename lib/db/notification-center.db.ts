import "server-only";
import { prisma } from "@/lib/prisma";
import { TIPOS_AVISO_PLAN } from "@/lib/planificacion/avisos";

/**
 * NotificationCenterDB
 *
 * Notificaciones in-app del admin (Notification Center) — modelo
 * `Notification` (diferente de `NotificationLog` que es para WhatsApp
 * delivery tracking).
 *
 * Audit project-wide 2026-05-19 — migracion de /api/notification-center.
 */

interface ListOpts {
  unread?: boolean;
  severity?: string | null;
  canSeeHigh: boolean;
  limit?: number;
}

interface CreateData {
  tenantId: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId?: string;
}

interface CreateOrReuseData extends CreateData {
  dedupWindowHours?: number;
}

/** Un aviso con clave propia (`type` + `entityId`) para `sincronizarAvisos`. */
export interface AvisoConClave {
  type: string;
  severity: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId: string;
}

export interface ResultadoSincronizar {
  /** Avisos nuevos en la campana. */
  creados: number;
  /** Sin leer de antes (fuera de la ventana): se puso al día el texto y sube arriba. */
  actualizados: number;
  /** Sin leer dentro de la ventana: misma corrida o repetida, nada que hacer. */
  sinCambios: number;
  /** Ya avisados y leídos en esta misma etapa: no se repiten. */
  yaLeidos: number;
  /** Sin leer cuyo problema ya no está (se arregló o pasó a otra etapa): quedan leídos. */
  resueltos: number;
}

/**
 * Tipos que sólo ve la gestión (admin/owner/manager, los mismos que ven HIGH):
 * el plan de la empresa los arregla quien puede editarlo, y a la campana del
 * cajero no le sirven. `Notification` no tiene destinatario por rol (ver el
 * TODO de `/api/notification-center`), así que el filtro va por `type`.
 */
const TIPOS_SOLO_GESTION: readonly string[] = TIPOS_AVISO_PLAN;

export const NotificationCenterDB = {
  /**
   * Lista notificaciones admin filtradas por severity + unread + role.
   * El gate de HIGH severity esta dentro del helper: si !canSeeHigh,
   * excluye HIGH del listado (lectura del role decision del caller).
   *
   * Devuelve { items, unreadCount } en single round-trip Promise.all.
   */
  async listForAdmin(
    tenantId: string,
    opts: ListOpts,
  ): Promise<{ items: unknown[]; unreadCount: number }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    // Lo que este rol puede ver: sin HIGH ni los tipos de gestión si no es gestión.
    // El contador usa el mismo filtro: antes contaba los HIGH que el cajero no ve.
    const visibles: Record<string, unknown> = opts.canSeeHigh
      ? { tenantId }
      : { tenantId, severity: { not: "HIGH" }, type: { notIn: [...TIPOS_SOLO_GESTION] } };
    const where: Record<string, unknown> = { ...visibles };
    if (opts.unread) where.readAt = null;

    if (opts.severity && ["HIGH", "MEDIUM", "LOW"].includes(opts.severity)) {
      where.severity = opts.severity;
    }

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { ...visibles, readAt: null },
      }),
    ]);
    return { items, unreadCount };
  },

  /**
   * Crea una notification con campos requeridos + opcionales (actionUrl,
   * actionLabel, entityId). Devuelve { id, created: true }.
   *
   * Audit project-wide 2026-05-19 — unblock cron/vendor-identity-recheck.
   */
  async create(data: CreateData): Promise<{ id: string; created: true }> {
    const payload: Record<string, unknown> = {
      tenantId: data.tenantId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      body: data.body,
    };
    if (data.actionUrl !== undefined) payload.actionUrl = data.actionUrl;
    if (data.actionLabel !== undefined) payload.actionLabel = data.actionLabel;
    if (data.entityId !== undefined) payload.entityId = data.entityId;

    const row = await prisma.notification.create({
      data: payload as never,
      select: { id: true },
    });
    return { id: row.id, created: true };
  },

  /**
   * Un aviso por problema, no uno por día (OPER-1, 09-10).
   *
   * La clave es estable: negocio + tipo + entidad (sin entidad = el aviso
   * general de ese tipo, p. ej. «Adelantos vencidos por cobrar»). Con un aviso
   * igual SIN LEER:
   *   · dentro de la ventana (`dedupWindowHours`, 24 h por defecto) se reusa tal
   *     cual: es la misma corrida o una repetida;
   *   · fuera de la ventana se ACTUALIZA (texto, gravedad, enlace y hora, así
   *     sube arriba de la campana) y las copias viejas de la misma clave quedan
   *     leídas. Antes se creaba otro: Blas juntó 14 «Adelantos vencidos» en dos
   *     semanas, 134 de 134 sin leer.
   * Si el anterior ya se leyó, el problema que vuelve es un aviso nuevo.
   *
   * `created` conserva lo que los crons ya usaban para decidir si avisar por
   * otro canal (Telegram, WhatsApp): `true` = no había uno igual sin leer en la
   * ventana. `refreshed` = no se insertó fila: se puso al día la que había.
   */
  async createOrReuse(
    data: CreateOrReuseData,
  ): Promise<{ id: string; created: boolean; refreshed: boolean }> {
    const dedupWindowHours = data.dedupWindowHours ?? 24;
    const since = new Date(Date.now() - dedupWindowHours * 60 * 60 * 1000);

    const clave = {
      tenantId: data.tenantId,
      type: data.type,
      entityId: data.entityId ?? null,
      readAt: null,
    };

    const existing = await prisma.notification.findFirst({
      where: clave,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    if (existing && existing.createdAt >= since) {
      return { id: existing.id, created: false, refreshed: false };
    }

    if (existing) {
      const ahora = new Date();
      // La condición va en el WHERE: si alguien lo leyó entre la búsqueda y
      // esto, no se «des-lee»; se crea uno nuevo abajo.
      const { count } = await prisma.notification.updateMany({
        where: { id: existing.id, tenantId: data.tenantId, readAt: null },
        data: {
          severity: data.severity,
          title: data.title,
          body: data.body,
          actionUrl: data.actionUrl ?? null,
          actionLabel: data.actionLabel ?? null,
          createdAt: ahora,
        },
      });
      if (count > 0) {
        await prisma.notification.updateMany({
          where: { ...clave, tenantId: data.tenantId, id: { not: existing.id } },
          data: { readAt: ahora },
        });
        return { id: existing.id, created: true, refreshed: true };
      }
    }

    const { id } = await this.create(data);
    return { id, created: true, refreshed: false };
  },

  /**
   * La lista COMPLETA de hoy de un cron que avisa por etapas (plan de la
   * empresa, 16-10). La clave es `type` + `entityId`, y el `entityId` ya trae
   * la etapa (p. ej. `licencia-x@2026-10-26:7`):
   *   · clave nueva → aviso nuevo;
   *   · sin leer → dentro de la ventana no se toca (correr dos veces el mismo
   *     día no duplica); fuera, se pone al día el texto («vence en 9 días» →
   *     «en 8») y sube arriba, como `createOrReuse`;
   *   · ya leído → no vuelve: lo que lo trae de nuevo es la etapa siguiente;
   *   · sin leer de estos `tipos` que ya no está en la lista (se arregló o pasó
   *     de etapa) → queda leído, para que la campana no mande a un problema
   *     que ya no existe. Nada se borra.
   *
   * En lote, no por fila (119 ms por ida a Supabase): 1 lectura + 1 inserción
   * + las puestas al día en paralelo + 1 marcado. Sin transacción: el cron
   * corre una vez al día y cada paso es idempotente.
   */
  async sincronizarAvisos(
    tenantId: string,
    tipos: readonly string[],
    avisos: readonly AvisoConClave[],
    opts: { dedupWindowHours?: number } = {},
  ): Promise<ResultadoSincronizar> {
    if (!tenantId) throw new Error("tenantId is required");
    const r: ResultadoSincronizar = { creados: 0, actualizados: 0, sinCambios: 0, yaLeidos: 0, resueltos: 0 };
    const tiposPermitidos = new Set(tipos);
    const lista = avisos.filter((a) => tiposPermitidos.has(a.type) && a.entityId);
    const claveDe = (type: string, entityId: string | null) => `${type}|${entityId ?? ""}`;
    const claves = new Set(lista.map((a) => claveDe(a.type, a.entityId)));
    const entityIds = [...new Set(lista.map((a) => a.entityId))];

    // Lo de las claves de hoy (leído o no) + todo lo sin leer de estos tipos.
    const filas = await prisma.notification.findMany({
      where: {
        tenantId,
        type: { in: [...tipos] },
        OR: [{ entityId: { in: entityIds } }, { readAt: null }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, entityId: true, readAt: true, createdAt: true },
    });

    const since = new Date(Date.now() - (opts.dedupWindowHours ?? 20) * 60 * 60 * 1000);
    const ahora = new Date();
    const crear: AvisoConClave[] = [];
    const poneAlDia: { id: string; aviso: AvisoConClave }[] = [];
    const marcarLeidas: string[] = [];

    const porClave = new Map<string, typeof filas>();
    for (const f of filas) {
      const k = claveDe(f.type, f.entityId);
      porClave.set(k, [...(porClave.get(k) ?? []), f]);
      if (!claves.has(k) && f.readAt === null) marcarLeidas.push(f.id);
    }

    for (const a of lista) {
      const deLaClave = porClave.get(claveDe(a.type, a.entityId)) ?? [];
      const sinLeer = deLaClave.filter((f) => f.readAt === null);
      if (sinLeer.length === 0) {
        if (deLaClave.length > 0) r.yaLeidos += 1;
        else crear.push(a);
        continue;
      }
      // La más nueva manda; copias sin leer de la misma clave (no debería haber) quedan leídas.
      const [masNueva, ...copias] = sinLeer;
      marcarLeidas.push(...copias.map((f) => f.id));
      if (masNueva.createdAt >= since) r.sinCambios += 1;
      else poneAlDia.push({ id: masNueva.id, aviso: a });
    }

    if (crear.length > 0) {
      const { count } = await prisma.notification.createMany({
        data: crear.map((a) => ({
          tenantId,
          type: a.type,
          severity: a.severity,
          title: a.title,
          body: a.body,
          actionUrl: a.actionUrl ?? null,
          actionLabel: a.actionLabel ?? null,
          entityId: a.entityId,
          createdAt: ahora,
        })),
      });
      r.creados = count;
    }

    if (poneAlDia.length > 0) {
      const hechos = await Promise.all(
        poneAlDia.map(({ id, aviso }) =>
          // La condición va en el WHERE: si alguien lo leyó entre la lectura y esto, no se «des-lee».
          prisma.notification.updateMany({
            where: { id, tenantId, readAt: null },
            data: {
              severity: aviso.severity,
              title: aviso.title,
              body: aviso.body,
              actionUrl: aviso.actionUrl ?? null,
              actionLabel: aviso.actionLabel ?? null,
              createdAt: ahora,
            },
          }),
        ),
      );
      r.actualizados = hechos.reduce((n, h) => n + h.count, 0);
    }

    if (marcarLeidas.length > 0) {
      const { count } = await prisma.notification.updateMany({
        where: { id: { in: marcarLeidas }, tenantId, readAt: null },
        data: { readAt: ahora },
      });
      r.resueltos = count;
    }
    return r;
  },
};
