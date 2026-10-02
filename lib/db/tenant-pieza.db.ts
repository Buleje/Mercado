import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * TenantPiezaDB — qué piezas (código a medida, `extensiones/<id>/`) tiene
 * prendidas cada negocio y con qué opciones (ADR-457).
 *
 * · Lee el negocio: `listarPrendidas` (cacheada, la usan la portada y el panel).
 * · Escribe SÓLO el superadmin: `guardar` (la ruta valida pieza, enchufe y
 *   opciones contra el manifiesto ANTES de llegar acá).
 * · `matriz()` cruza negocios a propósito (pantalla del superadmin, ADR-101).
 *
 * La caché se invalida con `{ expire: 0 }` y no con `"max"`: con `"max"` la
 * primera lectura después de prender una pieza todavía sirve la versión vieja
 * (stale-while-revalidate), y «cambiar qué pieza tiene un negocio es
 * instantáneo» es justo lo que promete el ADR.
 */

export const tagPiezas = (tenantId: string): string => `tenant:${tenantId}:piezas`;

const SELECT_FILA = {
  id: true,
  tenantId: true,
  piezaId: true,
  enchufe: true,
  prendida: true,
  opciones: true,
  version: true,
  orden: true,
  actualizadoPor: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface FilaPieza {
  id: string;
  tenantId: string;
  piezaId: string;
  enchufe: string;
  prendida: boolean;
  /** Sin validar: quien la lee la pasa por el `safeParse` del manifiesto. */
  opciones: unknown;
  version: string;
  orden: number;
  actualizadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilaMatriz extends FilaPieza {
  tenantSlug: string;
  tenantNombre: string;
}

export interface GuardarPiezaInput {
  piezaId: string;
  enchufe: string;
  prendida: boolean;
  /**
   * Ya validadas con el Zod `.strict()` del manifiesto. `null` = no tocar las
   * guardadas: es APAGAR una pieza cuyas opciones viejas ya no validan (una
   * pieza apagada no las usa, y exigirlas dejaba la fila sin poder apagarse).
   */
  opciones: Record<string, unknown> | null;
  /** La `version` del manifiesto al momento de guardar. */
  version: string;
  orden?: number;
}

export const TenantPiezaDB = {
  /** Las prendidas de un negocio (opcionalmente de un enchufe), en orden. Cacheada 5 min por negocio. */
  async listarPrendidas(tenantId: string, enchufe?: string): Promise<FilaPieza[]> {
    "use cache";
    cacheLife({ revalidate: 300 });
    cacheTag(tagPiezas(tenantId));
    return prisma.tenantPieza.findMany({
      where: { tenantId, prendida: true, ...(enchufe ? { enchufe } : {}) },
      orderBy: [{ orden: "asc" }, { piezaId: "asc" }],
      select: SELECT_FILA,
    });
  },

  /** Todas las asignaciones de un negocio, prendidas o no (sin caché: pantalla del superadmin). */
  async listarPorNegocio(tenantId: string): Promise<FilaPieza[]> {
    return prisma.tenantPieza.findMany({
      where: { tenantId },
      orderBy: [{ enchufe: "asc" }, { orden: "asc" }, { piezaId: "asc" }],
      select: SELECT_FILA,
    });
  },

  /**
   * Prende, apaga o reconfigura una pieza para un negocio. Una fila por
   * (negocio, pieza, enchufe): apagar deja la fila con `prendida = false` y
   * queda quién y cuándo. El `tenantId` va en la clave del upsert, nunca en
   * un `if` después.
   */
  async guardar(tenantId: string, input: GuardarPiezaInput, actor: string): Promise<FilaPieza> {
    const opciones = (input.opciones ?? {}) as Prisma.InputJsonValue;
    const fila = await prisma.tenantPieza.upsert({
      where: { tenantId_piezaId_enchufe: { tenantId, piezaId: input.piezaId, enchufe: input.enchufe } },
      create: {
        tenantId,
        piezaId: input.piezaId,
        enchufe: input.enchufe,
        prendida: input.prendida,
        opciones,
        version: input.version,
        orden: input.orden ?? 0,
        actualizadoPor: actor,
      },
      update: {
        prendida: input.prendida,
        ...(input.opciones !== null ? { opciones } : {}),
        version: input.version,
        ...(input.orden !== undefined ? { orden: input.orden } : {}),
        actualizadoPor: actor,
      },
      select: SELECT_FILA,
    });
    revalidateTag(tagPiezas(tenantId), { expire: 0 });
    return fila;
  },

  /**
   * CROSS-TENANT A PROPÓSITO (ADR-101): la matriz negocios × piezas del
   * superadmin. Sólo la llama `GET /api/superadmin/piezas`, detrás de
   * `requirePlatformAPI`. Ningún endpoint de negocio debe usarla.
   */
  async matriz(): Promise<FilaMatriz[]> {
    const filas = await prisma.tenantPieza.findMany({
      orderBy: [{ tenantId: "asc" }, { enchufe: "asc" }, { orden: "asc" }],
      // Tope de cordura: 14 negocios × un puñado de piezas son decenas de filas.
      take: 5000,
      select: { ...SELECT_FILA, tenant: { select: { slug: true, name: true } } },
    });
    return filas.map(({ tenant, ...f }) => ({ ...f, tenantSlug: tenant.slug, tenantNombre: tenant.name }));
  },
};
