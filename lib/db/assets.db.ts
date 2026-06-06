import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/assets.db.ts — Activos & Maquinaria (MVP, Brandon 2026-06-06).
 *
 * Para negocios que ALQUILAN equipos (forestal: cargador, oruga, camión).
 * Cada activo genera renta (AssetIncome) y acumula costos (AssetExpense).
 * Rentabilidad por máquina = SUM(incomes) − SUM(expenses), calculada acá.
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
};

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

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const numOrNull = (d: unknown): number | null => (d == null ? null : Number(d));

const DEFAULT_CAPACITY_PER_DAY = 8;

export type AssetFinStats = {
  costPerUnit: number | null;   // gasto total / unidades trabajadas (costo REAL por hora)
  incomePerUnit: number | null; // ingreso total / unidades trabajadas
  marginPerUnit: number | null; // ingreso/u − costo/u
  utilizationPct: number | null; // units30d / (capacidad/día × 30), tope 100%
};

/**
 * Cálculo puro de rentabilidad fina por máquina (costo/hora + utilización).
 * Extraído de listWithStats para poder testearlo sin DB ni Next (Brandon 2026-06-06).
 *
 * - costo/hora = gasto / horas trabajadas (solo si hubo horas).
 * - utilización = horas de los últimos 30 días / capacidad mensual (cap/día × 30),
 *   acotada a 100% (si trabajó más que su capacidad teórica, igual muestra 100%).
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

export const AssetsDB = {
  /**
   * Lista los activos del tenant con sus stats de rentabilidad (income,
   * expense, profit) agregadas. 2 groupBy en paralelo — eficiente para
   * decenas de máquinas.
   */
  async listWithStats(tenantId: string, opts: { includeInactive?: boolean } = {}): Promise<DbAssetWithStats[]> {
    const assets = await prisma.asset.findMany({
      where: { tenantId, ...(opts.includeInactive ? {} : { active: true }) },
      orderBy: { createdAt: "desc" },
    });
    if (assets.length === 0) return [];

    const ids = assets.map((a) => a.id);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [incomes, expenses, incomes30d] = await Promise.all([
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
    ]);
    const incMap = new Map(incomes.map((i) => [i.assetId, { sum: num(i._sum.amount), units: num(i._sum.quantity), count: i._count.id }]));
    const expMap = new Map(expenses.map((e) => [e.assetId, { sum: num(e._sum.amount), count: e._count.id }]));
    const u30Map = new Map(incomes30d.map((i) => [i.assetId, num(i._sum.quantity)]));

    return assets.map((a) => {
      const inc = incMap.get(a.id) ?? { sum: 0, units: 0, count: 0 };
      const exp = expMap.get(a.id) ?? { sum: 0, count: 0 };
      const units30d = u30Map.get(a.id) ?? 0;
      const fin = computeAssetFinStats({
        incomeSum: inc.sum,
        expenseSum: exp.sum,
        unitsWorked: inc.units,
        units30d,
        capacityPerDay: a.capacityPerDay,
      });
      return {
        id: a.id,
        tenantId: a.tenantId,
        name: a.name,
        type: a.type,
        plate: a.plate,
        imageUrl: a.imageUrl,
        purchaseValue: numOrNull(a.purchaseValue),
        status: a.status,
        hourlyRate: numOrNull(a.hourlyRate),
        rateUnit: a.rateUnit,
        capacityPerDay: a.capacityPerDay ?? null,
        notes: a.notes,
        active: a.active,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
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
      };
    });
  },

  async create(tenantId: string, data: {
    name: string; type: string; plate?: string | null; imageUrl?: string | null;
    purchaseValue?: number | null; status?: string; hourlyRate?: number | null;
    rateUnit?: string; capacityPerDay?: number | null; notes?: string | null;
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
        notes: data.notes ?? null,
      },
    });
    logger.info("[Assets] created", { tenantId, assetId: row.id });
    return this.mapAsset(row);
  },

  async update(tenantId: string, id: string, data: Partial<{
    name: string; type: string; plate: string | null; imageUrl: string | null;
    purchaseValue: number | null; status: string; hourlyRate: number | null;
    rateUnit: string; capacityPerDay: number | null; notes: string | null; active: boolean;
  }>): Promise<DbAsset | null> {
    // Ownership: solo actualiza si pertenece al tenant.
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

  async listMovements(tenantId: string, assetId: string, limit = 100): Promise<{ incomes: DbAssetIncome[]; expenses: DbAssetExpense[] }> {
    const [incomes, expenses] = await Promise.all([
      prisma.assetIncome.findMany({ where: { tenantId, assetId }, orderBy: { date: "desc" }, take: limit }),
      prisma.assetExpense.findMany({ where: { tenantId, assetId }, orderBy: { date: "desc" }, take: limit }),
    ]);
    return {
      incomes: incomes.map((i) => ({
        id: i.id, assetId: i.assetId, date: i.date.toISOString(), client: i.client,
        quantity: numOrNull(i.quantity), unit: i.unit, rate: num(i.rate), amount: num(i.amount),
        hourStart: numOrNull(i.hourStart), hourEnd: numOrNull(i.hourEnd), notes: i.notes,
      })),
      expenses: expenses.map((e) => ({
        id: e.id, assetId: e.assetId, date: e.date.toISOString(), category: e.category,
        gallons: numOrNull(e.gallons), unitPrice: numOrNull(e.unitPrice), amount: num(e.amount), notes: e.notes,
      })),
    };
  },

  async addIncome(tenantId: string, data: {
    assetId: string; client?: string | null; quantity?: number | null; unit?: string;
    rate: number; amount: number; hourStart?: number | null; hourEnd?: number | null; notes?: string | null;
  }): Promise<DbAssetIncome> {
    const row = await prisma.assetIncome.create({
      data: {
        tenantId, assetId: data.assetId, client: data.client ?? null,
        quantity: data.quantity ?? null, unit: data.unit ?? "hora",
        rate: data.rate, amount: data.amount,
        hourStart: data.hourStart ?? null, hourEnd: data.hourEnd ?? null, notes: data.notes ?? null,
      },
    });
    return {
      id: row.id, assetId: row.assetId, date: row.date.toISOString(), client: row.client,
      quantity: numOrNull(row.quantity), unit: row.unit, rate: num(row.rate), amount: num(row.amount),
      hourStart: numOrNull(row.hourStart), hourEnd: numOrNull(row.hourEnd), notes: row.notes,
    };
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

  mapAsset(a: {
    id: string; tenantId: string; name: string; type: string; plate: string | null;
    imageUrl: string | null; purchaseValue: unknown; status: string; hourlyRate: unknown;
    rateUnit: string; capacityPerDay: number | null; notes: string | null; active: boolean; createdAt: Date; updatedAt: Date;
  }): DbAsset {
    return {
      id: a.id, tenantId: a.tenantId, name: a.name, type: a.type, plate: a.plate,
      imageUrl: a.imageUrl, purchaseValue: numOrNull(a.purchaseValue), status: a.status,
      hourlyRate: numOrNull(a.hourlyRate), rateUnit: a.rateUnit, capacityPerDay: a.capacityPerDay ?? null,
      notes: a.notes, active: a.active, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    };
  },
};
