import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ENCHUFE_PAGINA } from "@/extensiones/_contrato";
import { logger } from "@/lib/logger";

/**
 * TenantPiezaDB — qué piezas (código a medida, `extensiones/<id>/`) tiene
 * prendidas cada negocio y con qué opciones (ADR-457).
 *
 * · Lee el negocio: `listarPrendidas` (cacheada, la usan la portada y el panel).
 * · Escribe SÓLO el superadmin: `guardar` (la ruta valida pieza, enchufe y
 *   opciones contra el manifiesto ANTES de llegar acá).
 * · Una página propia (`tienda.pagina`, ADR-458) es de UN negocio: `guardar`
 *   lo hace cumplir en una transacción y tira {@link PaginaDeOtroNegocioError}.
 *   `liberar` borra una fila APAGADA (con el mismo candado) para soltarla.
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

/**
 * ADR-458 · la página propia ya está asignada (prendida o apagada) a OTRO
 * negocio. La ruta del superadmin lo traduce a 409 `pagina_de_otro_negocio`.
 */
export class PaginaDeOtroNegocioError extends Error {
  readonly dueno: { readonly tenantId: string; readonly nombre: string };

  constructor(piezaId: string, dueno: { tenantId: string; nombre: string }) {
    super(`La página propia «${piezaId}» ya es de «${dueno.nombre}»`);
    this.name = "PaginaDeOtroNegocioError";
    this.dueno = dueno;
  }
}

/** Los argumentos del upsert de una asignación: una fila por (negocio, pieza, enchufe). */
function datosDeGuardado(tenantId: string, input: GuardarPiezaInput, actor: string) {
  const opciones = (input.opciones ?? {}) as Prisma.InputJsonValue;
  return {
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
  } satisfies Prisma.TenantPiezaUpsertArgs;
}

/**
 * El candado por (enchufe, pieza) que comparten asignar una página propia y
 * liberar una fila: dos escrituras de la misma pieza nunca se cruzan. Es de
 * TRANSACCIÓN (se suelta al cerrar), nunca `SET SESSION`.
 */
async function candadoDePieza(tx: Prisma.TransactionClient, enchufe: string, piezaId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tenant-pieza:${enchufe}:${piezaId}`}))`;
}

/** Lo que pasó al liberar: `prendida` = no se borró (hay que apagarla antes). */
export type ResultadoLiberar = { ok: true } | { ok: false; motivo: "no_existe" | "prendida" };

/**
 * Guardar una página propia: en UNA transacción, con candado por pieza, se
 * mira si otro negocio ya la tiene (prendida o apagada) y recién entonces se
 * escribe. El candado (`pg_advisory_xact_lock`, se suelta solo al cerrar la
 * transacción) hace que dos guardados a la vez para negocios distintos se
 * pongan en fila: el segundo ya ve la fila del primero. Sin `SET SESSION`.
 */
async function guardarPaginaPropia(tenantId: string, input: GuardarPiezaInput, actor: string): Promise<FilaPieza> {
  return prisma.$transaction(async (tx) => {
    await candadoDePieza(tx, input.enchufe, input.piezaId);
    const deOtro = await tx.tenantPieza.findFirst({
      where: { piezaId: input.piezaId, enchufe: input.enchufe, tenantId: { not: tenantId } },
      select: { tenantId: true, tenant: { select: { name: true, slug: true } } },
    });
    if (deOtro) {
      throw new PaginaDeOtroNegocioError(input.piezaId, {
        tenantId: deOtro.tenantId,
        nombre: deOtro.tenant.name || deOtro.tenant.slug,
      });
    }
    return tx.tenantPieza.upsert(datosDeGuardado(tenantId, input, actor));
  });
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
    const fila =
      input.enchufe === ENCHUFE_PAGINA
        ? await guardarPaginaPropia(tenantId, input, actor)
        : await prisma.tenantPieza.upsert(datosDeGuardado(tenantId, input, actor));
    revalidateTag(tagPiezas(tenantId), { expire: 0 });
    return fila;
  },

  /**
   * Borra la asignación de un negocio SÓLO si está apagada (ADR-458): libera
   * una página propia para otro negocio y limpia filas apagadas de cualquier
   * pieza (antes sólo se podía por SQL). Prendida → no borra (`prendida`):
   * primero se apaga, que es lo que el negocio deja de ver. Con el mismo
   * candado que la asignación, en una transacción.
   */
  async liberar(tenantId: string, piezaId: string, enchufe: string, actor: string): Promise<ResultadoLiberar> {
    const r = await prisma.$transaction(async (tx): Promise<ResultadoLiberar> => {
      await candadoDePieza(tx, enchufe, piezaId);
      const fila = await tx.tenantPieza.findUnique({
        where: { tenantId_piezaId_enchufe: { tenantId, piezaId, enchufe } },
        select: { prendida: true },
      });
      if (!fila) return { ok: false, motivo: "no_existe" };
      if (fila.prendida) return { ok: false, motivo: "prendida" };
      // `prendida: false` también en el borrado: nada se cuela entre leer y borrar.
      const { count } = await tx.tenantPieza.deleteMany({ where: { tenantId, piezaId, enchufe, prendida: false } });
      return count === 1 ? { ok: true } : { ok: false, motivo: "prendida" };
    });
    if (r.ok) {
      revalidateTag(tagPiezas(tenantId), { expire: 0 });
      logger.info("[TenantPiezaDB.liberar] fila borrada", { tenantId, piezaId, enchufe, actor });
    }
    return r;
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
