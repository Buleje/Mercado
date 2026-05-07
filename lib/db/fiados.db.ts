import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";

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
    const updated = await prisma.$transaction(async (tx) => {
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

      // Re-leer post-decrement para determinar status y detectar overpayment
      const afterDecrement = await tx.fiado.findUnique({
        where: { id: fiadoId },
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
    let remaining = monto;
    const payments: Array<{ id: string; fiadoId: string; monto: number }> = [];

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

    return {
      totalCobrado: monto - remaining,
      payments,
      remaining: Math.max(0, remaining),
    };
  },
};
