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
    const fiado = await prisma.fiado.findFirst({ where: { id: fiadoId, tenantId } });
    if (!fiado) return null;

    const nuevoSaldo = Math.max(Number(fiado.saldo) - monto, 0);

    const [, updated] = await prisma.$transaction([
      prisma.fiadoCuota.create({
        data: {
          fiadoId,
          monto,
          pagadoEn: new Date(),
          notas,
        },
      }),
      prisma.fiado.update({
        where: { id: fiadoId },
        data: {
          saldo: nuevoSaldo,
          status: nuevoSaldo <= 0 ? "PAGADO" : "ACTIVO",
        },
        include: { cuotas: { orderBy: { createdAt: "asc" } } },
      }),
    ]);
    return mapFiado(updated);
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
    const fiados = await prisma.fiado.findMany({
      where: { tenantId, customerId, status: "ACTIVO" },
      orderBy: { createdAt: "asc" },
    });

    if (fiados.length === 0) {
      return { totalCobrado: 0, payments: [], remaining: monto };
    }

    let remaining = monto;
    const payments: Array<{ id: string; fiadoId: string; monto: number }> = [];

    await prisma.$transaction(async (tx) => {
      for (const fiado of fiados) {
        if (remaining <= 0) break;
        const saldo = Number(fiado.saldo);
        const payment = Math.min(remaining, saldo);
        const newSaldo = saldo - payment;

        await tx.fiado.update({
          where: { id: fiado.id },
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
