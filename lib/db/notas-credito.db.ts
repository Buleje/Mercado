import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { NotaCredito as PNotaCredito } from "@/lib/generated/prisma/client";

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

export const NotasCreditoDB = {
  async siguienteNumero(tenantId: string): Promise<string> {
    const prefix = await getDocPrefix(tenantId);
    const last = await prisma.notaCredito.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { numero: true },
    });
    const numMatch = last?.numero?.match(/(\d+)$/);
    const seq = numMatch ? parseInt(numMatch[1], 10) + 1 : 1;
    return `${prefix}-NC-${String(seq).padStart(4, "0")}`;
  },

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

  async create(
    tenantId: string,
    data: {
      numero: string;
      orderId?: string;
      saleId?: string;
      motivoCodigo: string;
      motivoDesc: string;
      monto: number;
      igv: number;
      total: number;
      notas?: string;
      createdBy: string;
    }
  ): Promise<DbNotaCredito> {
    const row = await prisma.notaCredito.create({
      data: {
        tenantId,
        numero: data.numero,
        orderId: data.orderId,
        saleId: data.saleId,
        motivoCodigo: data.motivoCodigo,
        motivoDesc: data.motivoDesc,
        monto: data.monto,
        igv: data.igv,
        total: data.total,
        notas: data.notas,
        createdBy: data.createdBy,
      },
    });
    return mapNotaCredito(row);
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
