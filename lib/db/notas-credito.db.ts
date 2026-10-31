import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { NotaCredito as PNotaCredito, Prisma } from "@/lib/generated/prisma/client";
import { candadoDelNegocio } from "@/lib/db/candado";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbNotaCredito = {
  id: string;
  tenantId: string;
  numero: string;
  orderId?: string;
  saleId?: string;
  motivoCodigo: string;
  motivoDesc: string;
  monto: number;
  igv: number;
  total: number;
  status: string;
  notas?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Lo que se guarda de una nota nueva; el número lo pone `crearEnFila` bajo su candado. */
export type DatosNotaCredito = {
  orderId?: string;
  saleId?: string;
  motivoCodigo: string;
  motivoDesc: string;
  monto: number;
  igv: number;
  total: number;
  notas?: string;
  createdBy: string;
};

/** Suma de `total` (CON IGV) de las notas activas de cada documento, leída DENTRO del candado. */
export type YaAcreditado = { venta: number; pedido: number };

/** Lo que decide el llamador con lo ya acreditado: guardar estos datos o cortar con su error. */
export type DecisionNotaCredito<E> = { ok: true; datos: DatosNotaCredito } | { ok: false; error: E };

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function dec(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapNotaCredito(n: PNotaCredito): DbNotaCredito {
  return {
    id: n.id,
    tenantId: n.tenantId,
    numero: n.numero,
    ...(n.orderId != null && { orderId: n.orderId }),
    ...(n.saleId != null && { saleId: n.saleId }),
    motivoCodigo: n.motivoCodigo,
    motivoDesc: n.motivoDesc,
    monto: dec(n.monto),
    igv: dec(n.igv),
    total: dec(n.total),
    status: n.status,
    ...(n.notas != null && { notas: n.notas }),
    createdBy: n.createdBy,
    createdAt: toISO(n.createdAt),
    updatedAt: toISO(n.updatedAt),
  };
}

// ── Notas de Crédito DB ───────────────────────────────────────────────────────

// ── Mejora 18: Prefijo configurable ─────────────────────────────────────────

async function getDocPrefix(tenantId: string): Promise<string> {
  try {
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { businessName: true },
    });
    if (settings?.businessName) {
      const prefix = settings.businessName
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "")
        .trim()
        .slice(0, 3)
        .toUpperCase();
      if (prefix.length >= 2) return prefix;
    }
  } catch (e) {
    logger.error("getDocPrefix failed — using default prefix", { err: e instanceof Error ? e.message : String(e), op: "NotasCreditoDB.getDocPrefix", tenantId });
  }
  return "Buleje";
}

/**
 * Suma de `total` de las notas activas de UN documento con el cliente que toque (la transacción
 * del alta, o `prisma` para las lecturas sueltas de antes).
 */
async function sumaActiva(
  db: Pick<Prisma.TransactionClient, "notaCredito">,
  tenantId: string,
  doc: { saleId: string } | { orderId: string },
): Promise<number> {
  const acum = await db.notaCredito.aggregate({
    _sum: { total: true },
    where: { tenantId, ...doc, status: { not: "ANULADA" as never } },
  });
  return Number(acum._sum.total ?? 0);
}

/**
 * Siguiente número del negocio: el MAYOR correlativo ya usado + 1, leído con la transacción que
 * tiene el candado `nc-numero`. Antes salía de la nota con `createdAt` más reciente sin candado: dos
 * altas a la vez leían la misma «última» y repetían número (`numero` no es único en el schema).
 * El mayor y no «la última»: `createdAt` no sigue el orden de la fila (si sale de `now()` en
 * Postgres es la hora de INICIO de la transacción, y una que esperó el candado queda con hora
 * anterior a la que se guardó antes que ella).
 */
async function numeroSiguiente(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
  prefijo: string,
): Promise<string> {
  const filas = await db.$queryRaw<Array<{ ultimo: number | null }>>`
    SELECT MAX(substring(numero from '([0-9]{1,9})$')::int) AS ultimo
    FROM "NotaCredito" WHERE "tenantId" = ${tenantId}`;
  const seq = Number(filas[0]?.ultimo ?? 0) + 1;
  return `${prefijo}-NC-${String(seq).padStart(4, "0")}`;
}

export const NotasCreditoDB = {
  async getAll(
    tenantId: string,
    opts?: {
      status?: string;
      orderId?: string;
      from?: string;
      to?: string;
    }
  ): Promise<DbNotaCredito[]> {
    const where: Record<string, unknown> = { tenantId };
    if (opts?.status) where.status = opts.status;
    if (opts?.orderId) where.orderId = opts.orderId;
    if (opts?.from || opts?.to) {
      const createdAt: Record<string, Date> = {};
      if (opts.from) createdAt.gte = new Date(opts.from);
      if (opts.to) createdAt.lte = new Date(opts.to);
      where.createdAt = createdAt;
    }
    return (
      await prisma.notaCredito.findMany({
        where,
        orderBy: { createdAt: "desc" },
      })
    ).map(mapNotaCredito);
  },

  async getById(
    id: string,
    tenantId: string
  ): Promise<DbNotaCredito | null> {
    const row = await prisma.notaCredito.findFirst({
      where: { id, tenantId },
    });
    return row ? mapNotaCredito(row) : null;
  },

  /**
   * Alta EN FILA (revisión de Comprobantes 17-10, hallazgo medio). Leer lo ya acreditado, decidir el
   * tope y crear eran pasos sueltos: dos envíos a la vez (dos pestañas, o el POS y el módulo) de una
   * 01/06 leían el mismo «queda» y creaban dos notas por todo → se acreditaba el doble, y con el
   * mismo número.
   *
   * Ahora, en una transacción corta (≈6 idas):
   *   1. candado por documento (`nc-venta:<id>` / `nc-pedido:<id>`) y lo acreditado leído con `tx`;
   *   2. `armar` decide con eso (el tope de la ruta) — el segundo envío ve la nota del primero;
   *   3. candado del correlativo del negocio (`nc-numero`), número y alta.
   * Siempre en ese orden (documento → número): nadie toma el de número y después uno de documento,
   * así que no hay abrazo mortal. El prefijo se lee antes, fuera de la transacción.
   */
  async crearEnFila<E>(
    tenantId: string,
    documento: { saleId?: string; orderId?: string },
    armar: (ya: YaAcreditado) => DecisionNotaCredito<E>,
  ): Promise<{ ok: true; nota: DbNotaCredito } | { ok: false; error: E }> {
    const prefijo = await getDocPrefix(tenantId);
    return prisma.$transaction(
      async (tx): Promise<{ ok: true; nota: DbNotaCredito } | { ok: false; error: E }> => {
        if (documento.saleId) await candadoDelNegocio(tx, tenantId, `nc-venta:${documento.saleId}`);
        if (documento.orderId) await candadoDelNegocio(tx, tenantId, `nc-pedido:${documento.orderId}`);
        const ya: YaAcreditado = {
          venta: documento.saleId ? await sumaActiva(tx, tenantId, { saleId: documento.saleId }) : 0,
          pedido: documento.orderId ? await sumaActiva(tx, tenantId, { orderId: documento.orderId }) : 0,
        };
        const decision = armar(ya);
        if (!decision.ok) return decision;
        const d = decision.datos;

        await candadoDelNegocio(tx, tenantId, "nc-numero");
        const numero = await numeroSiguiente(tx, tenantId, prefijo);
        const row = await tx.notaCredito.create({
          data: {
            tenantId,
            numero,
            orderId: d.orderId,
            saleId: d.saleId,
            motivoCodigo: d.motivoCodigo,
            motivoDesc: d.motivoDesc,
            monto: d.monto,
            igv: d.igv,
            total: d.total,
            notas: d.notas,
            createdBy: d.createdBy,
          },
        });
        return { ok: true, nota: mapNotaCredito(row) };
      },
      // maxWait 10 s como la devolución del POS: con el servidor cargado, 5 s no alcanzaba para abrirla.
      { timeout: 20_000, maxWait: 10_000 },
    );
  },

  /**
   * Suma de montos de notas de credito ACTIVAS (no anuladas) emitidas
   * contra una venta. Util para validar que la suma + el monto pedido
   * no exceda el total de la venta (anti-fraude SUNAT).
   *
   * Audit project-wide 2026-05-19 — migracion de /api/notas-credito.
   */
  async sumActiveForSale(tenantId: string, saleId: string): Promise<number> {
    const acum = await prisma.notaCredito.aggregate({
      _sum: { monto: true },
      where: {
        saleId,
        tenantId,
        status: { not: "ANULADA" as never },
      },
    });
    return Number(acum._sum.monto ?? 0);
  },

  /**
   * Suma de `total` (CON IGV) de las notas ACTIVAS de una venta: el tope exacto de
   * POST /api/notas-credito compara total contra `Sale.total`, sin tolerancia (09-10).
   */
  async sumActiveTotalForSale(tenantId: string, saleId: string): Promise<number> {
    return sumaActiva(prisma, tenantId, { saleId });
  },

  /** Lo mismo para un pedido de la tienda: antes las notas por `orderId` no tenían tope. */
  async sumActiveTotalForOrder(tenantId: string, orderId: string): Promise<number> {
    return sumaActiva(prisma, tenantId, { orderId });
  },

  /**
   * Todas las notas de un documento (también las anuladas, para el historial), de la más vieja a la
   * más nueva. Alimenta `GET /api/notas-credito/remanente` (F12/F16, 17-10).
   */
  async porDocumento(
    tenantId: string,
    doc: { saleId: string } | { orderId: string },
  ): Promise<DbNotaCredito[]> {
    const rows = await prisma.notaCredito.findMany({
      where: { tenantId, ...doc },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map(mapNotaCredito);
  },

  /**
   * Devoluciones de Caja (POS) de una venta: lo que volvió físicamente y la plata que salió. Sólo
   * lectura, para el historial del ajuste: la nota y la devolución son dos eventos distintos (F16).
   */
  async devolucionesDeVenta(
    tenantId: string,
    saleId: string,
  ): Promise<Array<{ id: string; total: number; reason: string; creditApplied: boolean; createdAt: string; items: Array<{ productId: number; name: string; quantity: number }> }>> {
    const rows = await prisma.return.findMany({
      where: { tenantId, saleId },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true, total: true, reason: true, creditApplied: true, createdAt: true,
        items: { select: { productId: true, name: true, quantity: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      total: dec(r.total),
      reason: r.reason,
      creditApplied: r.creditApplied,
      createdAt: toISO(r.createdAt),
      items: r.items,
    }));
  },

  async updateStatus(
    id: string,
    tenantId: string,
    status: string
  ): Promise<DbNotaCredito | null> {
    // SECURITY 2026-05-05 (audit SUNAT #2): doble-anulación. Antes
    // findFirst + update separado permitía a dos requests concurrentes
    // pasar el check y anular dos veces (doble baja en SUNAT y doble audit).
    // Ahora updateMany con `status: { not: "ANULADA" }` es atómico:
    // count=0 si ya estaba anulada.
    const updated = await prisma.notaCredito.updateMany({
      where: { id, tenantId, status: { not: "ANULADA" } as never },
      data: { status: status as never },
    });
    if (updated.count === 0) return null;
    const row = await prisma.notaCredito.findFirst({ where: { id, tenantId } });
    return row ? mapNotaCredito(row) : null;
  },
};
