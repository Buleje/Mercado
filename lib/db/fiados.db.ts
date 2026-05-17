import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";

// ── Error classes ─────────────────────────────────────────────────────────────

/**
 * Race-condition o write-conflict detectado dentro de una transacción.
 * Los handlers HTTP deben mapearlo a 409 Conflict (no 503), porque el
 * caller puede reintentar de inmediato — la DB está sana, solo había
 * contención.
 *
 * Prisma lo lanza con código P2034 (TransactionConflict). Algunas versiones
 * de Postgres usan SQLSTATE 40001 (serialization_failure) o 40P01 (deadlock).
 */
export class FiadoConflictError extends Error {
  readonly code = "FIADO_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "FiadoConflictError";
  }
}

/**
 * Detecta si un error es race-condition de Prisma/Postgres. Centraliza el
 * pattern para que los handlers HTTP no tengan que conocer códigos internos.
 */
export function isPrismaConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Prisma client: PrismaClientKnownRequestError with code P2034
  // (también P2002 unique-violation puede surgir en algunas races pero rara
  // vez se mapea a conflict aquí).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any).code;
  if (code === "P2034") return true;
  // Postgres SQLSTATE 40001 (serialization) o 40P01 (deadlock)
  if (/40001|40P01/.test(msg)) return true;
  if (/transaction conflict|could not serialize|deadlock detected/i.test(msg)) return true;
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbFiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  total: number;
  saldo: number;
  descripcion?: string;
  status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  fechaVence?: string;
  cuotas: DbFiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

export type DbFiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFiado(f: any): DbFiado {
  return {
    id: f.id,
    tenantId: f.tenantId,
    customerId: f.customerId,
    ...(f.customer?.name && { customerName: f.customer.name }),
    total: toNum(f.total),
    saldo: toNum(f.saldo),
    ...(f.descripcion != null && { descripcion: f.descripcion }),
    status: f.status,
    ...(f.fechaVence != null && { fechaVence: toISO(f.fechaVence) }),
    cuotas: (f.cuotas ?? []).map(mapCuota),
    createdAt: toISO(f.createdAt),
    updatedAt: toISO(f.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCuota(c: any): DbFiadoCuota {
  return {
    id: c.id,
    fiadoId: c.fiadoId,
    monto: toNum(c.monto),
    ...(c.pagadoEn != null && { pagadoEn: toISO(c.pagadoEn) }),
    ...(c.notas != null && { notas: c.notas }),
    createdAt: toISO(c.createdAt),
  };
}

// ── Fiados DB ─────────────────────────────────────────────────────────────────

export const FiadosDB = {
  async list(
    tenantId: string,
    filters?: { status?: string; customerId?: string }
  ): Promise<DbFiado[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;

    const rows = await prisma.fiado.findMany({
      where,
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    // Fetch customer names separately to avoid relation errors
    const customerPhones = [...new Set(rows.map(r => r.customerId))];
    const customers = customerPhones.length > 0
      ? await prisma.customer.findMany({ where: { phone: { in: customerPhones } }, select: { phone: true, name: true } })
      : [];
    const customerMap = new Map(customers.map(c => [c.phone, c.name]));
    return rows.map(r => mapFiado({ ...r, customer: { name: customerMap.get(r.customerId) || null } }));
  },

  async getById(tenantId: string, id: string): Promise<DbFiado | null> {
    const row = await prisma.fiado.findFirst({
      where: { id, tenantId },
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;
    // Fetch customer name separately
    const customer = await prisma.customer.findFirst({ where: { phone: row.customerId, tenantId }, select: { name: true } }).catch((err) => {
      logger.warn("FiadosDB.getById: customer lookup failed (non-critical)", { fiadoId: id, err: String(err) });
      return null;
    });
    return mapFiado({ ...row, customer: { name: customer?.name || null } });
  },

  /**
   * Validaciones de scoring crediticio antes de crear un fiado nuevo.
   * Devuelve `null` si todo OK, o `{error, details}` con razon humana.
   *
   * Reglas:
   *  1. Bloqueo si tiene >= 3 fiados con status VENCIDO.
   *  2. Bloqueo si tiene >= 1 fiado ACTIVO con fechaVence > 60 dias.
   *  3. Bloqueo si suma de saldos ACTIVOs + monto solicitado > creditLimit.
   *
   * Centraliza el patron que estaba inlined en /api/fiados POST,
   * cumpliendo regla critica #1 (no prisma directo en routes).
   */
  async validateForNewFiado(
    tenantId: string,
    customerId: string,
    requestedAmount: number,
    creditLimit: number,
  ): Promise<{ error: string; status: number } | null> {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [vencidos, muyVencidos, activoAgg] = await Promise.all([
      prisma.fiado.count({
        where: { tenantId, customerId, status: "VENCIDO" },
      }),
      prisma.fiado.count({
        where: {
          tenantId,
          customerId,
          status: "ACTIVO",
          fechaVence: { lt: sixtyDaysAgo },
        },
      }),
      creditLimit > 0
        ? prisma.fiado.aggregate({
            where: { tenantId, customerId, status: "ACTIVO" },
            _sum: { saldo: true },
          })
        : Promise.resolve({ _sum: { saldo: null } }),
    ]);

    if (vencidos >= 3) {
      return {
        error: `Cliente bloqueado: tiene ${vencidos} fiados vencidos sin pagar`,
        status: 400,
      };
    }
    if (muyVencidos > 0) {
      return {
        error: `Cliente bloqueado: tiene ${muyVencidos} fiado(s) vencido(s) hace mas de 60 dias. Debe regularizar antes de crear nuevos.`,
        status: 400,
      };
    }
    if (creditLimit > 0) {
      const totalActivo = activoAgg._sum?.saldo ? Number(activoAgg._sum.saldo) : 0;
      if (totalActivo + requestedAmount > creditLimit) {
        return {
          error: `Cliente supera limite de credito. Limite: S/${creditLimit.toFixed(2)}, Deuda actual: S/${totalActivo.toFixed(2)}, Disponible: S/${(creditLimit - totalActivo).toFixed(2)}`,
          status: 400,
        };
      }
    }

    return null;
  },

  async create(data: {
    tenantId: string;
    customerId: string;
    total: number;
    descripcion?: string;
    fechaVence?: Date;
  }): Promise<DbFiado> {
    const row = await prisma.fiado.create({
      data: {
        tenantId: data.tenantId,
        customerId: data.customerId,
        total: data.total,
        saldo: data.total, // saldo starts equal to total
        descripcion: data.descripcion,
        fechaVence: data.fechaVence,
      },
      include: { cuotas: true },
    });
    return mapFiado(row);
  },

  async registerPago(
    tenantId: string,
    fiadoId: string,
    monto: number,
    notas?: string
  ): Promise<DbFiado | null> {
    // Y1 FIX 2026-05-07: findFirst DENTRO de la tx para evitar race entre 2
    // cobros simultáneos que leían el saldo fuera de tx y calculaban en JS.
    // Ahora usamos `decrement` atómico + re-lectura post-decrement para
    // determinar el estado. Si el saldo baja de 0 (overpayment) se lanza error.
    //
    // Audit 2026-05-17 P1-3: conflictos de Prisma (P2034) ahora propagan como
    // FiadoConflictError para que el handler responda 409 en vez de 503.
    let updated: Awaited<ReturnType<typeof prisma.fiado.findUnique>> | null = null;
    try {
      updated = await prisma.$transaction(async (tx) => {
      const fiado = await tx.fiado.findFirst({ where: { id: fiadoId, tenantId } });
      if (!fiado) return null;

      if (fiado.status === "CANCELADO") {
        throw new Error("Fiado cancelado, no se puede cobrar");
      }

      // Cuota primero — si falla, la tx se revierte completa
      await tx.fiadoCuota.create({
        data: { fiadoId, monto, pagadoEn: new Date(), notas },
      });

      // Decrement atómico: DB hace la resta, no JS
      await tx.fiado.update({
        where: { id: fiadoId, tenantId },
        data: { saldo: { decrement: monto } },
      });

      // Re-leer post-decrement para determinar status y detectar overpayment.
      // Audit 2026-05-17 P2-3: findFirst con tenantId (no findUnique sin
      // tenantId) — defense-in-depth si el guard externo se rompe en refactor.
      const afterDecrement = await tx.fiado.findFirst({
        where: { id: fiadoId, tenantId },
        include: { cuotas: { orderBy: { createdAt: "asc" } } },
      });
      if (!afterDecrement) return null;

      const saldoFinal = Number(afterDecrement.saldo);
      if (saldoFinal < -0.01) {
        throw new Error(`Overpayment: el pago excede el saldo en ${Math.abs(saldoFinal).toFixed(2)}`);
      }

      if (saldoFinal <= 0.01) {
        return tx.fiado.update({
          where: { id: fiadoId, tenantId },
          data: { status: "PAGADO" },
          include: { cuotas: { orderBy: { createdAt: "asc" } } },
        });
      }

      return afterDecrement;
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el pago");
      }
      throw err;
    }

    return updated ? mapFiado(updated) : null;
  },

  async updateStatus(
    tenantId: string,
    id: string,
    status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO"
  ): Promise<DbFiado | null> {
    const result = await prisma.fiado.updateMany({
      where: { id, tenantId },
      data: { status },
    });
    if (result.count === 0) return null;
    const row = await prisma.fiado.findFirst({
      where: { id, tenantId },
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
    }).catch((err) => {
      logger.warn("FiadosDB.updateStatus: update failed", { fiadoId: id, status, err: String(err) });
      return null;
    });
    return row ? mapFiado(row) : null;
  },

  /**
   * Resumen de fiados activos de un cliente. Centraliza la lógica que
   * antes vivía inline en /api/customers/[phone]/fiado-resumen (regla #1
   * CLAUDE.md). 2 queries paralelas: aggregate + oldest.
   *
   * Audit 2026-05-17 P1-4.
   */
  async resumenByCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<{
    montoPendiente: number;
    cantidadFiados: number;
    diasVencido: number;
    hasFiadosVencidos: boolean;
  }> {
    const baseWhere = { tenantId, customerId, status: "ACTIVO" as const };

    const [agg, oldest] = await Promise.all([
      prisma.fiado.aggregate({
        where: baseWhere,
        _sum: { saldo: true },
        _count: true,
      }),
      prisma.fiado.findFirst({
        where: baseWhere,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, fechaVence: true },
      }),
    ]);

    const montoPendiente = Number(agg._sum.saldo ?? 0);
    const cantidadFiados = agg._count ?? 0;

    let diasVencido = 0;
    let hasFiadosVencidos = false;

    if (oldest) {
      const now = new Date();
      diasVencido = Math.floor(
        (now.getTime() - oldest.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (oldest.fechaVence && oldest.fechaVence < now) {
        hasFiadosVencidos = true;
      }
    }

    return { montoPendiente, cantidadFiados, diasVencido, hasFiadosVencidos };
  },

  /**
   * Batch cobranza atómica sobre N fiados específicos. Centraliza la
   * transacción que antes vivía inline en /api/fiados/cobro-masivo (regla
   * #1 CLAUDE.md). tenantId siempre en el where de cada update —
   * defense-in-depth.
   *
   * Lanza FiadoConflictError si Prisma detecta race-condition (P2034 o
   * SQLSTATE 40001/40P01). Lanza Error genérico si algún fiadoId no existe
   * o está cancelado.
   *
   * Audit 2026-05-17 P1-3 + P1-5.
   */
  async cobroMasivo(
    tenantId: string,
    payments: Array<{ fiadoId: string; monto: number }>,
    notas?: string,
  ): Promise<
    Array<{
      fiadoId: string;
      montoPagado: number;
      nuevoSaldo: number;
      status: string;
      customerId: string;
    }>
  > {
    const results: Array<{
      fiadoId: string;
      montoPagado: number;
      nuevoSaldo: number;
      status: string;
      customerId: string;
    }> = [];

    try {
      await prisma.$transaction(async (tx) => {
        for (const payment of payments) {
          const fiado = await tx.fiado.findFirst({
            where: { id: payment.fiadoId, tenantId },
          });
          if (!fiado) {
            throw new Error(`Fiado ${payment.fiadoId.slice(-6)} no encontrado`);
          }
          if (fiado.status !== "ACTIVO" && fiado.status !== "VENCIDO") {
            throw new Error(`Fiado ${payment.fiadoId.slice(-6)} no esta activo`);
          }

          const currentSaldo = Number(fiado.saldo);
          const paymentAmount = Math.min(payment.monto, currentSaldo);

          // Decrement atómico: si dos requests pasan el findFirst con el mismo
          // currentSaldo, el segundo decrement actualiza el saldo ya reducido
          // por el primero — sin sobrescritura.
          await tx.fiado.update({
            where: { id: payment.fiadoId, tenantId },
            data: { saldo: { decrement: paymentAmount } },
          });

          const updated = await tx.fiado.findFirst({
            where: { id: payment.fiadoId, tenantId },
            select: { saldo: true, status: true },
          });
          const finalSaldo = updated ? Number(updated.saldo) : 0;
          const newStatus = finalSaldo <= 0.01 ? "PAGADO" : fiado.status;
          if (newStatus !== fiado.status) {
            await tx.fiado.update({
              where: { id: payment.fiadoId, tenantId },
              data: { status: newStatus },
            });
          }

          await tx.fiadoCuota.create({
            data: {
              fiadoId: payment.fiadoId,
              monto: paymentAmount,
              pagadoEn: new Date(),
              notas: notas || "Cobro masivo",
            },
          });

          results.push({
            fiadoId: payment.fiadoId,
            montoPagado: paymentAmount,
            nuevoSaldo: Math.max(0, finalSaldo),
            status: newStatus,
            customerId: fiado.customerId,
          });
        }
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el cobro");
      }
      throw err;
    }

    return results;
  },

  /**
   * Collect a payment from a customer applied across their active fiados,
   * oldest-first. Atomic via $transaction. Returns a breakdown of payments
   * applied and any remaining amount (if the collection exceeded the debt).
   */
  async cobrarPorCliente(
    tenantId: string,
    customerId: string,
    monto: number,
    notas?: string,
  ): Promise<{
    totalCobrado: number;
    payments: Array<{ id: string; fiadoId: string; monto: number }>;
    remaining: number;
  }> {
    // Y2 FIX 2026-05-07: findMany DENTRO de la tx interactiva para que la
    // lectura y escritura sean atómicas. Sin esto, entre el findMany externo
    // y los updates internos otro cobro concurrente podía modificar los mismos
    // fiados resultando en doble-cobro o saldo incorrecto.
    // tenantId en where de cada update: defense in depth multi-tenant.
    //
    // Audit 2026-05-17 P1-3: conflict de Prisma propaga como FiadoConflictError.
    let remaining = monto;
    const payments: Array<{ id: string; fiadoId: string; monto: number }> = [];

    try {
      await prisma.$transaction(async (tx) => {
        const fiados = await tx.fiado.findMany({
          where: { tenantId, customerId, status: "ACTIVO" },
          orderBy: { createdAt: "asc" },
        });

        if (fiados.length === 0) return;

        for (const fiado of fiados) {
          if (remaining <= 0) break;
          const saldo = Number(fiado.saldo);
          const payment = Math.min(remaining, saldo);
          const newSaldo = saldo - payment;

          await tx.fiado.update({
            where: { id: fiado.id, tenantId },
            data: {
              saldo: newSaldo,
              status: newSaldo <= 0.01 ? "PAGADO" : "ACTIVO",
            },
          });

          const cuota = await tx.fiadoCuota.create({
            data: {
              fiadoId: fiado.id,
              monto: payment,
              pagadoEn: new Date(),
              notas: notas || "Cobro desde POS",
            },
          });

          payments.push({ id: cuota.id, fiadoId: fiado.id, monto: payment });
          remaining -= payment;
        }
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el cobro");
      }
      throw err;
    }

    return {
      totalCobrado: monto - remaining,
      payments,
      remaining: Math.max(0, remaining),
    };
  },
};
