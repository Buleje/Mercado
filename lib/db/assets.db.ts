import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/assets.db.ts — Activos & Maquinaria (Brandon 2026-06-06).
 *
 * Para negocios que ALQUILAN equipos (forestal: cargador, oruga, camión).
 * Cada máquina genera renta (AssetIncome) y acumula costos (AssetExpense).
 * Rentabilidad por máquina = SUM(incomes) − SUM(expenses), calculada acá.
 *
 * Features reforzadas (2026-06-06): horómetro, alerta de combustible, cuentas
 * por cobrar, mantenimiento preventivo, checklist de inspección, calendario.
 *
 * Patrón Buleje: tenantId 1er param en TODAS las funciones; ownership
 * verificado en cada write (el assetId debe pertenecer al tenant).
 */

export type DbAsset = {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  plate: string | null;
  imageUrl: string | null;
  purchaseValue: number | null;
  status: string;
  hourlyRate: number | null;
  rateUnit: string;
  capacityPerDay: number | null;
  currentHours: number | null;
  fuelTargetPerUnit: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DbAssetWithStats = DbAsset & {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  incomeCount: number;
  expenseCount: number;
  // Operación / rentabilidad fina (Brandon 2026-06-06)
  unitsWorked: number;       // SUM(quantity) histórico — horas/días/m³ trabajados
  units30d: number;          // unidades trabajadas últimos 30 días
  costPerUnit: number | null;   // gasto total / unidades trabajadas (costo real por hora)
  incomePerUnit: number | null; // ingreso / unidad
  marginPerUnit: number | null; // ingreso/u − costo/u
  utilizationPct: number | null; // units30d / (capacidad/día × 30) — % de uso
  // Features reforzadas
  pendingAmount: number;     // cuentas por cobrar (alquileres no pagados)
  fuelPerUnit: number | null; // galones / unidad trabajada
  fuelAlert: boolean;        // consume por encima de la meta
  maintenanceDue: number;    // mantenimientos vencidos o sin hacer
  maintenanceSoon: number;   // mantenimientos por vencer pronto
  publishedProductId: number | null; // ficha de servicio publicada en tienda (o null)
};

/** SKU interno que vincula un activo con su ficha de servicio en el catálogo. */
export const assetServiceSku = (assetId: string) => `asset:${assetId}`;

export type DbAssetIncome = {
  id: string;
  assetId: string;
  date: string;
  client: string | null;
  quantity: number | null;
  unit: string;
  rate: number;
  amount: number;
  hourStart: number | null;
  hourEnd: number | null;
  paid: boolean;
  paidAt: string | null;
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type DbAssetExpense = {
  id: string;
  assetId: string;
  date: string;
  category: string;
  gallons: number | null;
  unitPrice: number | null;
  amount: number;
  notes: string | null;
};

export type DbMaintenance = {
  id: string;
  assetId: string;
  title: string;
  intervalHours: number | null;
  intervalDays: number | null;
  lastDoneHours: number | null;
  lastDoneAt: string | null;
  notes: string | null;
  active: boolean;
  // Estado calculado:
  state: "ok" | "soon" | "due";
  detail: string;
};

export type DbInspection = {
  id: string;
  assetId: string;
  kind: string;
  client: string | null;
  hours: number | null;
  items: { label: string; ok: boolean }[];
  notes: string | null;
  date: string;
};

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const numOrNull = (d: unknown): number | null => (d == null ? null : Number(d));
const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const DEFAULT_CAPACITY_PER_DAY = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AssetFinStats = {
  costPerUnit: number | null;   // gasto total / unidades trabajadas (costo REAL por hora)
  incomePerUnit: number | null; // ingreso total / unidades trabajadas
  marginPerUnit: number | null; // ingreso/u − costo/u
  utilizationPct: number | null; // units30d / (capacidad/día × 30), tope 100%
};

/**
 * Cálculo puro de rentabilidad fina por máquina (costo/hora + utilización).
 * Extraído de listWithStats para poder testearlo sin DB ni Next (Brandon 2026-06-06).
 */
export function computeAssetFinStats(input: {
  incomeSum: number;
  expenseSum: number;
  unitsWorked: number;
  units30d: number;
  capacityPerDay: number | null;
}): AssetFinStats {
  const capPerDay = input.capacityPerDay ?? DEFAULT_CAPACITY_PER_DAY;
  const costPerUnit = input.unitsWorked > 0 ? input.expenseSum / input.unitsWorked : null;
  const incomePerUnit = input.unitsWorked > 0 ? input.incomeSum / input.unitsWorked : null;
  const marginPerUnit =
    costPerUnit != null && incomePerUnit != null ? incomePerUnit - costPerUnit : null;
  const capacity30d = capPerDay * 30;
  const utilizationPct =
    capacity30d > 0 ? Math.min((input.units30d / capacity30d) * 100, 100) : null;
  return { costPerUnit, incomePerUnit, marginPerUnit, utilizationPct };
}

/**
 * Estado de un mantenimiento dado el horómetro actual y la fecha.
 * Puro y testeable. "due" = vencido/sin hacer, "soon" = por vencer, "ok".
 */
export function computeMaintenanceStatus(
  m: { intervalHours: number | null; intervalDays: number | null; lastDoneHours: unknown; lastDoneAt: Date | string | null },
  currentHours: number | null,
  nowMs: number,
): { state: "ok" | "soon" | "due"; detail: string } {
  const lastDoneHours = m.lastDoneHours == null ? null : Number(m.lastDoneHours);
  // Por horas de horómetro
  if (m.intervalHours && m.intervalHours > 0) {
    if (lastDoneHours == null || currentHours == null) {
      return { state: "due", detail: "Sin registro — programar" };
    }
    const nextAt = lastDoneHours + m.intervalHours;
    const remaining = nextAt - currentHours;
    if (remaining <= 0) return { state: "due", detail: `Vencido por ${Math.abs(Math.round(remaining))} h` };
    if (remaining <= m.intervalHours * 0.15 || remaining <= 25) return { state: "soon", detail: `En ${Math.round(remaining)} h` };
    return { state: "ok", detail: `En ${Math.round(remaining)} h` };
  }
  // Por fecha
  if (m.intervalDays && m.intervalDays > 0) {
    const last = m.lastDoneAt ? new Date(m.lastDoneAt).getTime() : null;
    if (last == null) return { state: "due", detail: "Sin registro — programar" };
    const nextAt = last + m.intervalDays * DAY_MS;
    const remainingDays = Math.round((nextAt - nowMs) / DAY_MS);
    if (remainingDays <= 0) return { state: "due", detail: `Vencido por ${Math.abs(remainingDays)} d` };
    if (remainingDays <= Math.max(3, m.intervalDays * 0.15)) return { state: "soon", detail: `En ${remainingDays} d` };
    return { state: "ok", detail: `En ${remainingDays} d` };
  }
  return { state: "ok", detail: "Sin programación" };
}

export const AssetsDB = {
  /**
   * Lista los activos del tenant con todas sus stats (rentabilidad, cobranza,
   * combustible, mantenimiento). Agregaciones en paralelo — eficiente.
   */
  async listWithStats(tenantId: string, opts: { includeInactive?: boolean } = {}): Promise<DbAssetWithStats[]> {
    const assets = await prisma.asset.findMany({
      where: { tenantId, ...(opts.includeInactive ? {} : { active: true }) },
      orderBy: { createdAt: "desc" },
    });
    if (assets.length === 0) return [];

    const ids = assets.map((a) => a.id);
    const nowMs = Date.now();
    const since30d = new Date(nowMs - 30 * DAY_MS);
    const [incomes, expenses, incomes30d, unpaid, fuel, maintenances, publishedProducts] = await Promise.all([
      prisma.assetIncome.groupBy({
        by: ["assetId"],
        where: { tenantId, assetId: { in: ids } },
        _sum: { amount: true, quantity: true },
        _count: { id: true },
      }),
      prisma.assetExpense.groupBy({
        by: ["assetId"],
        where: { tenantId, assetId: { in: ids } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.assetIncome.groupBy({
        by: ["assetId"],
        where: { tenantId, assetId: { in: ids }, date: { gte: since30d } },
        _sum: { quantity: true },
      }),
      prisma.assetIncome.groupBy({
        by: ["assetId"],
        where: { tenantId, assetId: { in: ids }, paid: false },
        _sum: { amount: true },
      }),
      prisma.assetExpense.groupBy({
        by: ["assetId"],
        where: { tenantId, assetId: { in: ids }, category: "combustible" },
        _sum: { gallons: true },
      }),
      prisma.assetMaintenance.findMany({
        where: { tenantId, assetId: { in: ids }, active: true },
      }),
      // Fichas de servicio publicadas en tienda (vinculadas por sku asset:<id>).
      prisma.product.findMany({
        where: { tenantId, active: true, sku: { in: ids.map(assetServiceSku) } },
        select: { id: true, sku: true },
      }),
    ]);
    const pubMap = new Map<string, number>();
    for (const p of publishedProducts) if (p.sku) pubMap.set(p.sku, p.id);
    const incMap = new Map(incomes.map((i) => [i.assetId, { sum: num(i._sum.amount), units: num(i._sum.quantity), count: i._count.id }]));
    const expMap = new Map(expenses.map((e) => [e.assetId, { sum: num(e._sum.amount), count: e._count.id }]));
    const u30Map = new Map(incomes30d.map((i) => [i.assetId, num(i._sum.quantity)]));
    const unpaidMap = new Map(unpaid.map((i) => [i.assetId, num(i._sum.amount)]));
    const fuelMap = new Map(fuel.map((e) => [e.assetId, num(e._sum.gallons)]));
    const maintByAsset = new Map<string, typeof maintenances>();
    for (const m of maintenances) {
      const arr = maintByAsset.get(m.assetId) ?? [];
      arr.push(m);
      maintByAsset.set(m.assetId, arr);
    }

    return assets.map((a) => {
      const inc = incMap.get(a.id) ?? { sum: 0, units: 0, count: 0 };
      const exp = expMap.get(a.id) ?? { sum: 0, count: 0 };
      const units30d = u30Map.get(a.id) ?? 0;
      const fin = computeAssetFinStats({
        incomeSum: inc.sum, expenseSum: exp.sum, unitsWorked: inc.units, units30d, capacityPerDay: a.capacityPerDay,
      });
      const galSum = fuelMap.get(a.id) ?? 0;
      const fuelPerUnit = inc.units > 0 && galSum > 0 ? galSum / inc.units : null;
      const fuelTarget = numOrNull(a.fuelTargetPerUnit);
      const fuelAlert = fuelTarget != null && fuelPerUnit != null && fuelPerUnit > fuelTarget;
      let maintenanceDue = 0, maintenanceSoon = 0;
      for (const m of maintByAsset.get(a.id) ?? []) {
        const st = computeMaintenanceStatus(m, numOrNull(a.currentHours), nowMs);
        if (st.state === "due") maintenanceDue++;
        else if (st.state === "soon") maintenanceSoon++;
      }
      return {
        ...this.mapAsset(a),
        totalIncome: inc.sum,
        totalExpense: exp.sum,
        profit: inc.sum - exp.sum,
        incomeCount: inc.count,
        expenseCount: exp.count,
        unitsWorked: inc.units,
        units30d,
        costPerUnit: fin.costPerUnit,
        incomePerUnit: fin.incomePerUnit,
        marginPerUnit: fin.marginPerUnit,
        utilizationPct: fin.utilizationPct,
        pendingAmount: unpaidMap.get(a.id) ?? 0,
        fuelPerUnit,
        fuelAlert,
        maintenanceDue,
        maintenanceSoon,
        publishedProductId: pubMap.get(assetServiceSku(a.id)) ?? null,
      };
    });
  },

  async create(tenantId: string, data: {
    name: string; type: string; plate?: string | null; imageUrl?: string | null;
    purchaseValue?: number | null; status?: string; hourlyRate?: number | null;
    rateUnit?: string; capacityPerDay?: number | null; currentHours?: number | null;
    fuelTargetPerUnit?: number | null; notes?: string | null;
  }): Promise<DbAsset> {
    const row = await prisma.asset.create({
      data: {
        tenantId,
        name: data.name,
        type: data.type,
        plate: data.plate ?? null,
        imageUrl: data.imageUrl ?? null,
        purchaseValue: data.purchaseValue ?? null,
        status: data.status ?? "operativo",
        hourlyRate: data.hourlyRate ?? null,
        rateUnit: data.rateUnit ?? "hora",
        capacityPerDay: data.capacityPerDay ?? 8,
        currentHours: data.currentHours ?? null,
        fuelTargetPerUnit: data.fuelTargetPerUnit ?? null,
        notes: data.notes ?? null,
      },
    });
    logger.info("[Assets] created", { tenantId, assetId: row.id });
    return this.mapAsset(row);
  },

  async update(tenantId: string, id: string, data: Partial<{
    name: string; type: string; plate: string | null; imageUrl: string | null;
    purchaseValue: number | null; status: string; hourlyRate: number | null;
    rateUnit: string; capacityPerDay: number | null; currentHours: number | null;
    fuelTargetPerUnit: number | null; notes: string | null; active: boolean;
  }>): Promise<DbAsset | null> {
    const result = await prisma.asset.updateMany({ where: { id, tenantId }, data });
    if (result.count === 0) return null;
    const row = await prisma.asset.findUnique({ where: { id } });
    return row ? this.mapAsset(row) : null;
  },

  async remove(tenantId: string, id: string): Promise<boolean> {
    const result = await prisma.asset.deleteMany({ where: { id, tenantId } });
    return result.count > 0;
  },

  /** Verifica que el asset pertenece al tenant (para writes de income/expense). */
  async assertOwned(tenantId: string, assetId: string): Promise<boolean> {
    const a = await prisma.asset.findFirst({ where: { id: assetId, tenantId }, select: { id: true } });
    return !!a;
  },

  async getOne(tenantId: string, id: string): Promise<DbAsset | null> {
    const a = await prisma.asset.findFirst({ where: { id, tenantId } });
    return a ? this.mapAsset(a) : null;
  },

  async listMovements(tenantId: string, assetId: string, limit = 100): Promise<{ incomes: DbAssetIncome[]; expenses: DbAssetExpense[] }> {
    const [incomes, expenses] = await Promise.all([
      prisma.assetIncome.findMany({ where: { tenantId, assetId }, orderBy: { date: "desc" }, take: limit }),
      prisma.assetExpense.findMany({ where: { tenantId, assetId }, orderBy: { date: "desc" }, take: limit }),
    ]);
    return {
      incomes: incomes.map(mapIncome),
      expenses: expenses.map((e) => ({
        id: e.id, assetId: e.assetId, date: e.date.toISOString(), category: e.category,
        gallons: numOrNull(e.gallons), unitPrice: numOrNull(e.unitPrice), amount: num(e.amount), notes: e.notes,
      })),
    };
  },

  async addIncome(tenantId: string, data: {
    assetId: string; client?: string | null; quantity?: number | null; unit?: string;
    rate: number; amount: number; hourStart?: number | null; hourEnd?: number | null;
    paid?: boolean; dueDate?: string | null; startDate?: string | null; endDate?: string | null;
    notes?: string | null;
  }): Promise<DbAssetIncome> {
    // Horómetro: si dan inicio y fin y no la cantidad, la calculamos.
    let quantity = data.quantity ?? null;
    if (quantity == null && data.hourStart != null && data.hourEnd != null && data.hourEnd > data.hourStart) {
      quantity = Number((data.hourEnd - data.hourStart).toFixed(2));
    }
    const paid = data.paid ?? true;
    const row = await prisma.assetIncome.create({
      data: {
        tenantId, assetId: data.assetId, client: data.client ?? null,
        quantity, unit: data.unit ?? "hora",
        rate: data.rate, amount: data.amount,
        hourStart: data.hourStart ?? null, hourEnd: data.hourEnd ?? null,
        paid, paidAt: paid ? new Date() : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes ?? null,
      },
    });
    // Actualiza el horómetro del activo si la lectura final es mayor.
    if (data.hourEnd != null) {
      await prisma.asset.updateMany({
        where: { id: data.assetId, tenantId, OR: [{ currentHours: null }, { currentHours: { lt: data.hourEnd } }] },
        data: { currentHours: data.hourEnd },
      });
    }
    return mapIncome(row);
  },

  async addExpense(tenantId: string, data: {
    assetId: string; category?: string; gallons?: number | null; unitPrice?: number | null;
    amount: number; notes?: string | null;
  }): Promise<DbAssetExpense> {
    const row = await prisma.assetExpense.create({
      data: {
        tenantId, assetId: data.assetId, category: data.category ?? "combustible",
        gallons: data.gallons ?? null, unitPrice: data.unitPrice ?? null,
        amount: data.amount, notes: data.notes ?? null,
      },
    });
    return {
      id: row.id, assetId: row.assetId, date: row.date.toISOString(), category: row.category,
      gallons: numOrNull(row.gallons), unitPrice: numOrNull(row.unitPrice), amount: num(row.amount), notes: row.notes,
    };
  },

  // ── Cuentas por cobrar ──────────────────────────────────────────────────
  async setIncomePaid(tenantId: string, incomeId: string, paid: boolean): Promise<boolean> {
    const res = await prisma.assetIncome.updateMany({
      where: { id: incomeId, tenantId },
      data: { paid, paidAt: paid ? new Date() : null },
    });
    return res.count > 0;
  },

  /** Alquileres pendientes de cobro (cuentas por cobrar), con nombre de la máquina. */
  async listReceivables(tenantId: string): Promise<(DbAssetIncome & { assetName: string })[]> {
    const rows = await prisma.assetIncome.findMany({
      where: { tenantId, paid: false },
      orderBy: [{ dueDate: "asc" }, { date: "asc" }],
      include: { asset: { select: { name: true } } },
      take: 200,
    });
    return rows.map((r) => ({ ...mapIncome(r), assetName: r.asset.name }));
  },

  // ── Mantenimiento preventivo ────────────────────────────────────────────
  async listMaintenance(tenantId: string, assetId: string): Promise<DbMaintenance[]> {
    const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId }, select: { currentHours: true } });
    const rows = await prisma.assetMaintenance.findMany({ where: { tenantId, assetId }, orderBy: { createdAt: "asc" } });
    const nowMs = Date.now();
    const ch = numOrNull(asset?.currentHours);
    return rows.map((m) => {
      const st = computeMaintenanceStatus(m, ch, nowMs);
      return {
        id: m.id, assetId: m.assetId, title: m.title,
        intervalHours: m.intervalHours, intervalDays: m.intervalDays,
        lastDoneHours: numOrNull(m.lastDoneHours), lastDoneAt: isoOrNull(m.lastDoneAt),
        notes: m.notes, active: m.active, state: st.state, detail: st.detail,
      };
    });
  },

  async addMaintenance(tenantId: string, data: {
    assetId: string; title: string; intervalHours?: number | null; intervalDays?: number | null;
    lastDoneHours?: number | null; lastDoneAt?: string | null; notes?: string | null;
  }): Promise<{ id: string }> {
    const row = await prisma.assetMaintenance.create({
      data: {
        tenantId, assetId: data.assetId, title: data.title,
        intervalHours: data.intervalHours ?? null, intervalDays: data.intervalDays ?? null,
        lastDoneHours: data.lastDoneHours ?? null,
        lastDoneAt: data.lastDoneAt ? new Date(data.lastDoneAt) : null,
        notes: data.notes ?? null,
      },
    });
    return { id: row.id };
  },

  /** Marca un mantenimiento como hecho (resetea el contador al horómetro/fecha actual). */
  async completeMaintenance(tenantId: string, id: string, atHours: number | null): Promise<boolean> {
    const res = await prisma.assetMaintenance.updateMany({
      where: { id, tenantId },
      data: { lastDoneAt: new Date(), lastDoneHours: atHours ?? undefined },
    });
    return res.count > 0;
  },

  async updateMaintenance(tenantId: string, id: string, data: Partial<{
    title: string; intervalHours: number | null; intervalDays: number | null; notes: string | null; active: boolean;
  }>): Promise<boolean> {
    const res = await prisma.assetMaintenance.updateMany({ where: { id, tenantId }, data });
    return res.count > 0;
  },

  async removeMaintenance(tenantId: string, id: string): Promise<boolean> {
    const res = await prisma.assetMaintenance.deleteMany({ where: { id, tenantId } });
    return res.count > 0;
  },

  // ── Checklist / inspección ──────────────────────────────────────────────
  async addInspection(tenantId: string, data: {
    assetId: string; kind?: string; client?: string | null; hours?: number | null;
    items: { label: string; ok: boolean }[]; notes?: string | null;
  }): Promise<{ id: string }> {
    const row = await prisma.assetInspection.create({
      data: {
        tenantId, assetId: data.assetId, kind: data.kind ?? "salida",
        client: data.client ?? null, hours: data.hours ?? null,
        itemsJson: JSON.stringify(data.items ?? []), notes: data.notes ?? null,
      },
    });
    return { id: row.id };
  },

  async listInspections(tenantId: string, assetId: string): Promise<DbInspection[]> {
    const rows = await prisma.assetInspection.findMany({ where: { tenantId, assetId }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((r) => {
      let items: { label: string; ok: boolean }[] = [];
      try { items = r.itemsJson ? JSON.parse(r.itemsJson) : []; } catch { items = []; }
      return {
        id: r.id, assetId: r.assetId, kind: r.kind, client: r.client,
        hours: numOrNull(r.hours), items, notes: r.notes, date: r.createdAt.toISOString(),
      };
    });
  },

  mapAsset(a: {
    id: string; tenantId: string; name: string; type: string; plate: string | null;
    imageUrl: string | null; purchaseValue: unknown; status: string; hourlyRate: unknown;
    rateUnit: string; capacityPerDay: number | null; currentHours: unknown; fuelTargetPerUnit: unknown;
    notes: string | null; active: boolean; createdAt: Date; updatedAt: Date;
  }): DbAsset {
    return {
      id: a.id, tenantId: a.tenantId, name: a.name, type: a.type, plate: a.plate,
      imageUrl: a.imageUrl, purchaseValue: numOrNull(a.purchaseValue), status: a.status,
      hourlyRate: numOrNull(a.hourlyRate), rateUnit: a.rateUnit, capacityPerDay: a.capacityPerDay ?? null,
      currentHours: numOrNull(a.currentHours), fuelTargetPerUnit: numOrNull(a.fuelTargetPerUnit),
      notes: a.notes, active: a.active, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    };
  },
};

function mapIncome(i: {
  id: string; assetId: string; date: Date; client: string | null; quantity: unknown; unit: string;
  rate: unknown; amount: unknown; hourStart: unknown; hourEnd: unknown; paid: boolean;
  paidAt: Date | null; dueDate: Date | null; startDate: Date | null; endDate: Date | null; notes: string | null;
}): DbAssetIncome {
  return {
    id: i.id, assetId: i.assetId, date: i.date.toISOString(), client: i.client,
    quantity: numOrNull(i.quantity), unit: i.unit, rate: num(i.rate), amount: num(i.amount),
    hourStart: numOrNull(i.hourStart), hourEnd: numOrNull(i.hourEnd),
    paid: i.paid, paidAt: isoOrNull(i.paidAt), dueDate: isoOrNull(i.dueDate),
    startDate: isoOrNull(i.startDate), endDate: isoOrNull(i.endDate), notes: i.notes,
  };
}
