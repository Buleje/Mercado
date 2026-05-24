import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CommissionType = "marketplace_fee" | "delivery_fee" | "platform_fee" | "refund_reversal";
export type CommissionStatus = "pending" | "settled" | "paid" | "refunded";

export type DbCommissionLedger = {
  id: string;
  tenantId: string;
  orderId: string;
  storeId: string | null;
  partnerId: string | null;
  type: string;
  amount: number;
  rate: number;
  status: CommissionStatus;
  settledAt: string | null;
  createdAt: string;
};

export type VendorTier = "bronze" | "silver" | "gold" | "platinum";

export type TierInfo = {
  tier: VendorTier;
  rate: number;            // % efectivo aplicado
  ventas30d: number;       // total ventas últimos 30 días
  threshold: number;       // umbral del siguiente tier (0 si platinum)
  nextTier: VendorTier | null;
};

/**
 * Tiers escalonados por volumen de ventas en últimos 30 días.
 * Audit 2026-05-17 (construcción gap 2). Vendor con override `Store.commission`
 * ≠ 5 gana sobre el tier calculado (compatibilidad con configuración existente).
 */
const VENDOR_TIERS: ReadonlyArray<{ tier: VendorTier; minVentas: number; rate: number }> = [
  { tier: "platinum", minVentas: 50000, rate: 2 },
  { tier: "gold",     minVentas: 15000, rate: 3 },
  { tier: "silver",   minVentas:  5000, rate: 4 },
  { tier: "bronze",   minVentas:     0, rate: 5 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLedger(row: any): DbCommissionLedger {
  // Defensive: si el row viene incompleto de un mock, devolvemos shape válido.
  const toIsoSafe = (v: unknown): string | null => {
    if (!v) return null;
    try {
      const d = new Date(v as string | number | Date);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };
  return {
    id: row.id ?? "",
    tenantId: row.tenantId ?? "",
    orderId: row.orderId ?? "",
    storeId: row.storeId ?? null,
    partnerId: row.partnerId ?? null,
    type: row.type ?? "",
    amount: toNumOrZero(row.amount),
    rate: toNumOrZero(row.rate),
    status: (row.status as CommissionStatus) ?? "pending",
    settledAt: toIsoSafe(row.settledAt),
    createdAt: toIsoSafe(row.createdAt) ?? new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── CommissionsDB ──────────────────────────────────────────────────────────

/**
 * Sales agregadas por cashier (para módulo "Comisiones del equipo").
 * Calcula revenue, cogs, profit netos descontando devoluciones (Return.saleId).
 *
 * Audit 2026-05-17 P1-1: migración de `app/api/commissions/route.ts` (regla #1).
 */
type CashierStats = {
  cashierId: string;
  cashierName: string;
  role: string;
  sales: number;
  revenue: number;
  cogs: number;
  profit: number;
};

export const CommissionsDB = {
  /**
   * Resuelve una tienda dentro del tenant (regla #1 wrapper sobre prisma.store).
   * Devuelve `null` si no existe o pertenece a otro tenant.
   */
  async getStore(
    tenantId: string,
    storeId: string,
  ): Promise<{ id: string; name: string; commission: number | null } | null> {
    if (!tenantId) throw new Error("[CommissionsDB.getStore] tenantId required");
    const store = await prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true, name: true, commission: true },
    });
    // P0 schema fix 2026-05-24: Store.commission ahora es Decimal — normalizamos a number.
    if (!store) return null;
    return {
      id: store.id,
      name: store.name,
      commission: store.commission ? store.commission.toNumber() : null,
    };
  },

  async cashierSummary(
    tenantId: string,
    filters: { from?: Date; to?: Date },
  ): Promise<CashierStats[]> {
    const where: Record<string, unknown> = {
      tenantId,
      cashierId: { not: null },
    };
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }

    const sales = await prisma.sale.findMany({
      where,
      select: { id: true, cashierId: true, total: true, totalCogs: true, payment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const saleIds = sales.map((s) => s.id);
    const returns = saleIds.length > 0
      ? await prisma.return.findMany({
          where: { tenantId, saleId: { in: saleIds } },
          select: { saleId: true, total: true },
        })
      : [];
    const refundedBySale = new Map<string, number>();
    for (const r of returns) {
      if (!r.saleId) continue;
      refundedBySale.set(r.saleId, (refundedBySale.get(r.saleId) ?? 0) + toNumOrZero(r.total));
    }

    const map = new Map<string, { sales: number; revenue: number; cogs: number; profit: number }>();
    for (const s of sales) {
      const cid = s.cashierId!;
      const entry = map.get(cid) ?? { sales: 0, revenue: 0, cogs: 0, profit: 0 };
      const totalNum = toNumOrZero(s.total);
      const refundedNum = refundedBySale.get(s.id) ?? 0;
      const netRevenue = Math.max(0, totalNum - refundedNum);
      const refundRatio = totalNum > 0 ? netRevenue / totalNum : 0;
      const cogsNum = s.totalCogs != null ? toNumOrZero(s.totalCogs) : totalNum * 0.7;
      const netCogs = cogsNum * refundRatio;
      entry.sales += 1;
      entry.revenue += netRevenue;
      entry.cogs += netCogs;
      entry.profit += netRevenue - netCogs;
      map.set(cid, entry);
    }

    const usernames = Array.from(map.keys());
    const users = usernames.length > 0
      ? await prisma.adminUser.findMany({
          where: { username: { in: usernames }, tenantId },
          select: { username: true, name: true, role: true },
        })
      : [];
    const nameMap = new Map(users.map(u => [u.username, { name: u.name || u.username, role: u.role }]));

    return Array.from(map.entries()).map(([cashierId, stats]) => ({
      cashierId,
      cashierName: nameMap.get(cashierId)?.name ?? cashierId,
      role: nameMap.get(cashierId)?.role ?? "cajero",
      sales: stats.sales,
      revenue: round2(stats.revenue),
      cogs: round2(stats.cogs),
      profit: round2(stats.profit),
    })).sort((a, b) => b.revenue - a.revenue);
  },
  /**
   * Tier escalonado dinámico — calcula tier según ventas últimos 30 días.
   * Audit 2026-05-17 (construcción gap 2).
   *
   * Cálculo de ventas: derivado del `CommissionLedger` del store
   * (marketplace_fee de los últimos 30 días, excluyendo refunded). Cada
   * row guarda `amount` + `rate`, así que `ventas_aproximadas = amount / (rate/100)`.
   * Usamos esto como aproximación de "volumen marketplace" del vendor sin
   * requerir relación directa Order ↔ Store (Order no tiene storeId hoy).
   *
   * Caller puede pasar `overrideRate` (típicamente `Store.commission`) que gana
   * sobre el tier calculado si es != 5 (default). Esto preserva configuraciones
   * manuales existentes.
   */
  async computeVendorTier(
    tenantId: string,
    storeId: string,
    overrideRate?: number | null,
  ): Promise<TierInfo> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fees = await prisma.commissionLedger.findMany({
      where: {
        tenantId,
        storeId,
        type: "marketplace_fee",
        createdAt: { gte: cutoff },
        status: { not: "refunded" },
      },
      select: { amount: true, rate: true },
    });

    // Reconstruir ventas aproximadas: amount / (rate/100). Si rate=0 (raro)
    // saltar la row para no dividir por cero.
    let ventas30d = 0;
    for (const f of fees) {
      const amount = toNumOrZero(f.amount);
      const rate = toNumOrZero(f.rate);
      if (rate > 0) ventas30d += amount / (rate / 100);
    }
    ventas30d = Math.round(ventas30d * 100) / 100;

    const matched = VENDOR_TIERS.find((t) => ventas30d >= t.minVentas)!;
    const nextIdx = VENDOR_TIERS.indexOf(matched) - 1;
    const next = nextIdx >= 0 ? VENDOR_TIERS[nextIdx] : null;

    // Si la tienda tiene un override explícito != default (5), gana sobre tier.
    const hasOverride = overrideRate != null && overrideRate !== 5;
    const effectiveRate = hasOverride ? overrideRate : matched.rate;

    return {
      tier: matched.tier,
      rate: effectiveRate,
      ventas30d,
      threshold: next ? next.minVentas : 0,
      nextTier: next ? next.tier : null,
    };
  },

  /**
   * Registra una comisión idempotente. Si ya existe (orderId, type) para el
   * tenant, hace skip + log.
   *
   * Audit 2026-05-17 P1-3: idempotencia (sin unique index todavía — diferido
   * a sprint propio con migration-planner).
   */
  async recordCommission(
    tenantId: string,
    params: {
      orderId: string;
      storeId?: string;
      partnerId?: string;
      type: CommissionType;
      amount: number;
      rate: number;
    },
  ): Promise<DbCommissionLedger | null> {
    if (!tenantId) {
      throw new Error("[CommissionsDB.recordCommission] tenantId is required");
    }

    // Idempotencia: skip si ya existe (orderId, type) en este tenant.
    const existing = await prisma.commissionLedger.findFirst({
      where: { tenantId, orderId: params.orderId, type: params.type },
      select: { id: true, status: true },
    });
    if (existing) {
      logger.info("[commissions] duplicate skipped (idempotent)", {
        tenantId,
        orderId: params.orderId,
        type: params.type,
        existingId: existing.id,
      });
      return null;
    }

    try {
      const row = await prisma.commissionLedger.create({
        data: {
          tenantId,
          orderId: params.orderId,
          storeId: params.storeId ?? null,
          partnerId: params.partnerId ?? null,
          type: params.type,
          amount: round2(params.amount),
          rate: params.rate,
          status: "pending",
        },
      });
      return mapLedger(row);
    } catch (err) {
      // Audit P1-2: en lugar de swallow silencioso, log error y propagar para
      // que el caller pueda reaccionar (fire-and-forget envuelve si quiere).
      logger.error("[commissions] failed to record commission", {
        tenantId,
        orderId: params.orderId,
        type: params.type,
        amount: params.amount,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  /**
   * Flow completo de comisiones para una orden marketplace entregada.
   * Calcula tier dinámico (gap 2), registra marketplace_fee, y delivery_fee
   * si aplica. Idempotente.
   */
  async recordMarketplaceCommissions(
    tenantId: string,
    params: {
      orderId: string;
      orderTotal: number;
      storeId: string;
      deliveryPartnerId?: string;
    },
  ): Promise<{ marketplaceFee: number; deliveryFee: number; tier: VendorTier }> {
    if (!tenantId) {
      throw new Error("[CommissionsDB.recordMarketplaceCommissions] tenantId required");
    }

    // 1. Buscar tienda — defense-in-depth: tenantId en where
    const store = await prisma.store.findFirst({
      where: { id: params.storeId, tenantId },
      select: { commission: true },
    });
    // P0 schema fix 2026-05-24: Store.commission ahora es Decimal — normalizamos.
    const overrideRate = store?.commission ? store.commission.toNumber() : null;

    // 2. Tier dinámico (con posible override de Store.commission)
    const tierInfo = await this.computeVendorTier(tenantId, params.storeId, overrideRate);
    const rate = tierInfo.rate;

    // 3. Comisión marketplace
    const marketplaceFee = round2((params.orderTotal * rate) / 100);
    await this.recordCommission(tenantId, {
      orderId: params.orderId,
      storeId: params.storeId,
      type: "marketplace_fee",
      amount: marketplaceFee,
      rate,
    });

    // 4. Delivery fee (si aplica)
    let deliveryFee = 0;
    if (params.deliveryPartnerId) {
      const assignment = await prisma.deliveryAssignment.findFirst({
        where: { orderId: params.orderId, tenantId },
        select: { fee: true },
      });
      if (assignment) {
        deliveryFee = toNumOrZero(assignment.fee);
        await this.recordCommission(tenantId, {
          orderId: params.orderId,
          partnerId: params.deliveryPartnerId,
          type: "delivery_fee",
          amount: deliveryFee,
          rate: 0,
        });
      }
    }

    return { marketplaceFee, deliveryFee, tier: tierInfo.tier };
  },

  /**
   * Lista del ledger filtrada. tenantId obligatorio.
   */
  async listLedger(
    tenantId: string,
    filters: { storeId?: string; status?: string; from?: Date; to?: Date },
  ): Promise<{ items: DbCommissionLedger[]; totals: { pending: number; settled: number; paid: number; refunded: number } }> {
    const where: Record<string, unknown> = { tenantId };
    if (filters.storeId) where.storeId = filters.storeId;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }

    const [rows, aggregates] = await Promise.all([
      prisma.commissionLedger.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.commissionLedger.groupBy({
        by: ["status"],
        where,
        _sum: { amount: true },
      }),
    ]);

    const totals = { pending: 0, settled: 0, paid: 0, refunded: 0 };
    for (const row of aggregates) {
      const sum = toNumOrZero(row._sum.amount);
      if (row.status === "pending") totals.pending = sum;
      else if (row.status === "settled") totals.settled = sum;
      else if (row.status === "paid") totals.paid = sum;
      else if (row.status === "refunded") totals.refunded = sum;
    }

    return { items: rows.map(mapLedger), totals };
  },

  /**
   * Settle batch — marca como settled. Scoped a tenantId del caller.
   */
  async settleByIds(tenantId: string, ids: string[]): Promise<{ count: number; settledAt: Date }> {
    if (!tenantId) throw new Error("[CommissionsDB.settleByIds] tenantId required");
    if (ids.length === 0) return { count: 0, settledAt: new Date() };

    const settledAt = new Date();
    const result = await prisma.commissionLedger.updateMany({
      where: { id: { in: ids }, status: "pending", tenantId },
      data: { status: "settled", settledAt },
    });
    return { count: result.count, settledAt };
  },

  /**
   * Refund — reversa atómica de comisiones de una orden.
   * Audit 2026-05-17 (construcción gap 1).
   *
   * 1. Busca todas las comisiones activas (pending/settled) de la orden.
   * 2. Las marca status=refunded + settledAt=now().
   * 3. Crea entrada negativa de compensación (type=refund_reversal).
   * 4. Todo dentro de prisma.$transaction para atomicidad.
   *
   * Retorna las comisiones revertidas + el monto total reversado.
   */
  async refundCommissionsByOrder(
    tenantId: string,
    orderId: string,
    reason?: string,
  ): Promise<{ reversed: DbCommissionLedger[]; totalReversed: number; reversalIds: string[] }> {
    if (!tenantId) throw new Error("[CommissionsDB.refundCommissionsByOrder] tenantId required");

    const reversalIds: string[] = [];

    const reversed = await prisma.$transaction(async (tx) => {
      const active = await tx.commissionLedger.findMany({
        where: {
          tenantId,
          orderId,
          status: { in: ["pending", "settled"] },
          type: { not: "refund_reversal" },
        },
      });

      if (active.length === 0) return [];

      const ids = active.map((c) => c.id);
      await tx.commissionLedger.updateMany({
        where: { id: { in: ids }, tenantId },
        data: { status: "refunded", settledAt: new Date() },
      });

      // Entrada negativa de compensación por cada fee revertido (audit trail).
      for (const c of active) {
        const reversal = await tx.commissionLedger.create({
          data: {
            tenantId,
            orderId,
            storeId: c.storeId,
            partnerId: c.partnerId,
            type: "refund_reversal",
            amount: -toNumOrZero(c.amount),
            rate: toNumOrZero(c.rate),
            status: "settled",
            settledAt: new Date(),
          },
        });
        reversalIds.push(reversal.id);
      }

      return active;
    });

    logger.info("[commissions] refunded by order", {
      tenantId,
      orderId,
      count: reversed.length,
      reason: reason ?? "no_reason",
    });

    return {
      reversed: reversed.map(mapLedger),
      totalReversed: round2(reversed.reduce((s, c) => s + toNumOrZero(c.amount), 0)),
      reversalIds,
    };
  },

  /**
   * Resumen de payout pendiente agrupado por vendor (storeId + partnerId).
   * Audit 2026-05-17 (construcción gap 3 — fase 1).
   *
   * El cron settle marca settledAt pero NO mueve dinero. Este método permite
   * al superadmin descargar la lista de transferencias por hacer y
   * procesarlas manual (o programáticamente cuando integremos Stripe Connect).
   */
  async payoutSummaryByVendor(
    tenantId: string,
    onlyStatus: "pending" | "settled" = "settled",
  ): Promise<Array<{
    vendorId: string;
    vendorType: "store" | "partner";
    count: number;
    total: number;
    types: Record<string, number>;
  }>> {
    if (!tenantId) throw new Error("[CommissionsDB.payoutSummaryByVendor] tenantId required");

    const rows = await prisma.commissionLedger.findMany({
      where: {
        tenantId,
        status: onlyStatus,
        type: { not: "refund_reversal" },
      },
      select: { storeId: true, partnerId: true, type: true, amount: true },
    });

    // Group por vendorId (storeId o partnerId — un row tiene uno u otro, no ambos)
    const map = new Map<string, { vendorId: string; vendorType: "store" | "partner"; count: number; total: number; types: Record<string, number> }>();
    for (const r of rows) {
      const vendorId = r.storeId ?? r.partnerId;
      if (!vendorId) continue;
      const key = `${r.storeId ? "store" : "partner"}:${vendorId}`;
      const existing = map.get(key) ?? {
        vendorId,
        vendorType: r.storeId ? "store" : "partner",
        count: 0,
        total: 0,
        types: {},
      };
      existing.count++;
      const amount = toNumOrZero(r.amount);
      existing.total = round2(existing.total + amount);
      existing.types[r.type] = round2((existing.types[r.type] ?? 0) + amount);
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  },
};
