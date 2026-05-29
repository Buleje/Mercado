/**
 * ForestPlanDB — Plan de Manejo Forestal + Censo + Especies autorizadas (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, las especies/volúmenes
 * autorizados y el censo de árboles. De acá la Tala jala datos por código.
 *
 * Patrón Buleje: tenantId 1er param · sin Prisma directo desde API/UI ·
 * cache invalidate por write.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";

const CACHE_PREFIX = "forest-plan";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/** Volumen comercial del árbol en pie (SERFOR): 0.7854 × DAP² × Hc × ff. */
export function censusVolume(dapM: number, hcM: number, ff = 0.65): number {
  if (!(dapM > 0) || !(hcM > 0)) return 0;
  return Math.round(0.7854 * dapM * dapM * hcM * ff * 10000) / 10000;
}

export interface PlanInput {
  caratulaId?: string | null;
  planType?: string;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Date | null;
  titularName: string;
  arffs?: string | null;
  region?: string | null;
  parcelaCorta?: string | null;
  areaHa?: number | string | null;
  uitRef?: number | string | null;
  vigenciaDesde?: Date | null;
  vigenciaHasta?: Date | null;
  estado?: string;
  notes?: string | null;
  createdBy: string;
}

export interface SpeciesInput {
  planId: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean;
  categoria?: string | null;
  volumenAutorizadoM3: number | string;
  arbolesAutorizados?: number | null;
  valorEstadoNaturalSoles?: number | string | null;
  precioVentaSoles?: number | string | null;
}

export interface TreeInput {
  planId: string;
  treeCode: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean;
  dapM?: number | string | null;
  alturaComercialM?: number | string | null;
  factorForma?: number | string | null;
  volumenEstimadoM3?: number | string | null;
  utmZona?: string | null;
  utmX?: number | string | null;
  utmY?: number | string | null;
  parcelaCorta?: string | null;
  calidad?: string | null;
  estado?: string;
  notes?: string | null;
  createdBy: string;
}

export class ForestPlanDB {
  // ─── Plan ─────────────────────────────────────────────────────────────
  static async createPlan(tenantId: string, input: PlanInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    const plan = await prisma.forestPlan.create({
      data: {
        tenantId,
        caratulaId: input.caratulaId ?? null,
        planType: input.planType ?? "PO",
        planNumber: input.planNumber?.trim() || null,
        tituloHabilitante: input.tituloHabilitante?.trim() || null,
        resolucionNumber: input.resolucionNumber?.trim() || null,
        resolucionDate: input.resolucionDate ?? null,
        titularName: input.titularName.trim(),
        arffs: input.arffs?.trim() || null,
        region: input.region?.trim() || null,
        parcelaCorta: input.parcelaCorta?.trim() || null,
        areaHa: dec(input.areaHa),
        uitRef: dec(input.uitRef),
        vigenciaDesde: input.vigenciaDesde ?? null,
        vigenciaHasta: input.vigenciaHasta ?? null,
        estado: input.estado ?? "vigente",
        notes: input.notes?.trim() || null,
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return plan;
  }

  static async listPlans(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getPlan(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  static async getActivePlan(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updatePlan(
    tenantId: string,
    id: string,
    patch: Partial<Omit<PlanInput, "createdBy">>,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const data: Prisma.ForestPlanUpdateInput = {};
    const decKeys = new Set(["areaHa", "uitRef"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const plan = await prisma.forestPlan.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return plan;
  }

  static async softDeletePlan(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = await prisma.forestPlan.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanWhereUniqueInput,
      data: { deletedAt: new Date(), isActive: false },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return plan;
  }

  // ─── Especies autorizadas ──────────────────────────────────────────────
  static async listSpecies(tenantId: string, planId: string) {
    return prisma.forestPlanSpecies.findMany({
      where: { tenantId, planId, deletedAt: null },
      orderBy: { speciesCommon: "asc" },
    });
  }

  static async addSpecies(tenantId: string, input: SpeciesInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.planId) throw new Error("planId is required");
    if (!input.speciesCommon?.trim()) throw new Error("speciesCommon is required");
    const row = await prisma.forestPlanSpecies.create({
      data: {
        tenantId,
        planId: input.planId,
        speciesCommon: input.speciesCommon.trim(),
        speciesScientific: input.speciesScientific?.trim() || null,
        cites: input.cites ?? false,
        categoria: input.categoria?.trim() || null,
        volumenAutorizadoM3: new Prisma.Decimal(input.volumenAutorizadoM3),
        arbolesAutorizados: input.arbolesAutorizados ?? null,
        valorEstadoNaturalSoles: dec(input.valorEstadoNaturalSoles),
        precioVentaSoles: dec(input.precioVentaSoles),
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  static async updateSpecies(
    tenantId: string,
    id: string,
    patch: Partial<Omit<SpeciesInput, "planId">>,
  ) {
    const data: Prisma.ForestPlanSpeciesUpdateInput = {};
    const decKeys = new Set(["volumenAutorizadoM3", "valorEstadoNaturalSoles", "precioVentaSoles"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const row = await prisma.forestPlanSpecies.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanSpeciesWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  static async removeSpecies(tenantId: string, id: string) {
    const row = await prisma.forestPlanSpecies.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanSpeciesWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  // ─── Censo (árboles) ───────────────────────────────────────────────────
  static async listTrees(
    tenantId: string,
    planId: string,
    filters: { estado?: string; search?: string; limit?: number } = {},
  ) {
    const where: Prisma.ForestCensusTreeWhereInput = { tenantId, planId, deletedAt: null };
    if (filters.estado) where.estado = filters.estado;
    if (filters.search) {
      where.OR = [
        { treeCode: { contains: filters.search, mode: "insensitive" } },
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [trees, total] = await Promise.all([
      prisma.forestCensusTree.findMany({
        where,
        orderBy: { treeCode: "asc" },
        take: Math.min(Math.max(filters.limit ?? 500, 1), 2000),
      }),
      prisma.forestCensusTree.count({ where }),
    ]);
    return { trees, total };
  }

  /** Lookup por código — alimenta el autocompletado de Tala (data-driven). */
  static async getTreeByCode(tenantId: string, treeCode: string) {
    if (!tenantId || !treeCode?.trim()) return null;
    return prisma.forestCensusTree.findFirst({
      where: { tenantId, treeCode: treeCode.trim(), deletedAt: null },
    });
  }

  static async addTree(tenantId: string, input: TreeInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.planId) throw new Error("planId is required");
    if (!input.treeCode?.trim()) throw new Error("treeCode is required");
    const dap = input.dapM != null ? Number(input.dapM) : 0;
    const hc = input.alturaComercialM != null ? Number(input.alturaComercialM) : 0;
    const ff = input.factorForma != null ? Number(input.factorForma) : 0.65;
    const vol =
      input.volumenEstimadoM3 != null && input.volumenEstimadoM3 !== ""
        ? Number(input.volumenEstimadoM3)
        : censusVolume(dap, hc, ff);
    const row = await prisma.forestCensusTree.create({
      data: {
        tenantId,
        planId: input.planId,
        treeCode: input.treeCode.trim(),
        speciesCommon: input.speciesCommon.trim(),
        speciesScientific: input.speciesScientific?.trim() || null,
        cites: input.cites ?? false,
        dapM: dec(input.dapM),
        alturaComercialM: dec(input.alturaComercialM),
        factorForma: dec(input.factorForma ?? 0.65),
        volumenEstimadoM3: vol > 0 ? new Prisma.Decimal(vol) : null,
        utmZona: input.utmZona?.trim() || null,
        utmX: dec(input.utmX),
        utmY: dec(input.utmY),
        parcelaCorta: input.parcelaCorta?.trim() || null,
        calidad: input.calidad?.trim() || null,
        estado: input.estado ?? "en_pie",
        notes: input.notes?.trim() || null,
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  /** Import masivo del censo (cientos de árboles). Devuelve {creados, errores}. */
  static async bulkImportTrees(
    tenantId: string,
    planId: string,
    rows: Array<Omit<TreeInput, "planId" | "createdBy">>,
    createdBy: string,
  ) {
    let creados = 0;
    const errores: string[] = [];
    for (const r of rows) {
      try {
        if (!r.treeCode?.toString().trim() || !r.speciesCommon?.toString().trim()) {
          errores.push(`Fila sin código o especie`);
          continue;
        }
        await ForestPlanDB.addTree(tenantId, { ...r, planId, createdBy });
        creados++;
      } catch (e) {
        errores.push(`${r.treeCode}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { creados, errores };
  }

  static async updateTree(
    tenantId: string,
    id: string,
    patch: Partial<Omit<TreeInput, "planId" | "createdBy">>,
  ) {
    const data: Prisma.ForestCensusTreeUpdateInput = {};
    const decKeys = new Set(["dapM", "alturaComercialM", "factorForma", "volumenEstimadoM3", "utmX", "utmY"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const row = await prisma.forestCensusTree.update({
      where: { id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  /** Marca un árbol del censo por código (lo usa la Tala al talar). */
  static async markTreeStatusByCode(tenantId: string, treeCode: string, estado: string) {
    if (!tenantId || !treeCode?.trim()) return null;
    const tree = await ForestPlanDB.getTreeByCode(tenantId, treeCode);
    if (!tree) return null;
    const row = await prisma.forestCensusTree.update({
      where: { id: tree.id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data: { estado },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  static async softDeleteTree(tenantId: string, id: string) {
    const row = await prisma.forestCensusTree.update({
      where: { id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  // ─── Balance de extracción / saldos (ADR-126, Fase 3) ──────────────────
  /**
   * Saldo SERFOR = autorizado − movilizado(GTF), por especie.
   * Cruza las especies autorizadas del plan con los movimientos del LO-TH:
   *  - talado    = Σ volumen de la sección Tala por especie
   *  - movilizado = Σ volumen de trozas despachadas (resuelto vía Trozado) +
   *                 Σ cantidad de producto terminado despachado en m³
   */
  static async balanceExtraccion(tenantId: string, planId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [speciesRows, entries, plan] = await Promise.all([
      prisma.forestPlanSpecies.findMany({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { section: true, speciesCommon: true, trozaCode: true, volumeM3: true, quantity: true, unit: true },
      }),
      prisma.forestPlan.findFirst({ where: { tenantId, id: planId, deletedAt: null } }),
    ]);

    const trozaMap = new Map<string, { species: string | null; vol: number }>();
    const talado: Record<string, number> = {};
    for (const e of entries) {
      if (e.section === "trozado" && e.trozaCode) {
        trozaMap.set(e.trozaCode, { species: e.speciesCommon, vol: Number(e.volumeM3 ?? 0) });
      }
      if (e.section === "tala" && e.speciesCommon) {
        talado[e.speciesCommon] = (talado[e.speciesCommon] ?? 0) + Number(e.volumeM3 ?? 0);
      }
    }
    const movilizado: Record<string, number> = {};
    for (const e of entries) {
      if (e.section === "despacho_troza" && e.trozaCode) {
        const t = trozaMap.get(e.trozaCode);
        if (t?.species) movilizado[t.species] = (movilizado[t.species] ?? 0) + t.vol;
      }
      if (e.section === "despacho_producto" && e.speciesCommon && e.unit === "m3") {
        movilizado[e.speciesCommon] = (movilizado[e.speciesCommon] ?? 0) + Number(e.quantity ?? 0);
      }
    }

    const uit = Number(plan?.uitRef ?? 0);
    const area = Number(plan?.areaHa ?? 0);
    const pagoArea = Math.round(0.0001 * uit * area * 100) / 100; // 0.01% UIT × ha

    let pagoDerechoTotal = pagoArea;
    let valorTotal = 0;
    const rows = speciesRows.map((s) => {
      const autorizado = Number(s.volumenAutorizadoM3);
      const mov = movilizado[s.speciesCommon] ?? 0;
      const tal = talado[s.speciesCommon] ?? 0;
      const saldo = Math.round((autorizado - mov) * 10000) / 10000;
      const precio = Number(s.precioVentaSoles ?? 0);
      const ven = Number(s.valorEstadoNaturalSoles ?? 0);
      const valorMovilizado = Math.round(mov * precio * 100) / 100;
      const pagoDerecho = Math.round(mov * ven * 100) / 100;
      valorTotal += valorMovilizado;
      pagoDerechoTotal += pagoDerecho;
      return {
        species: s.speciesCommon,
        cites: s.cites,
        autorizado,
        talado: Math.round(tal * 10000) / 10000,
        movilizado: Math.round(mov * 10000) / 10000,
        saldo,
        pctMovilizado: autorizado > 0 ? Math.round((mov / autorizado) * 1000) / 10 : 0,
        precioVenta: precio,
        valorMovilizado,
        pagoDerecho,
        exceso: tal > autorizado + 1e-6 || mov > autorizado + 1e-6,
      };
    });

    return {
      rows,
      pagoArea,
      pagoDerechoTotal: Math.round(pagoDerechoTotal * 100) / 100,
      valorTotal: Math.round(valorTotal * 100) / 100,
      plan: plan ? { vigenciaHasta: plan.vigenciaHasta, estado: plan.estado, areaHa: area, uitRef: uit } : null,
    };
  }

  // ─── Stats del plan (censo) ────────────────────────────────────────────
  static async censusSummary(tenantId: string, planId: string) {
    const rows = await prisma.forestCensusTree.groupBy({
      by: ["estado"],
      where: { tenantId, planId, deletedAt: null },
      _count: { _all: true },
      _sum: { volumenEstimadoM3: true },
    });
    return rows.map((r) => ({
      estado: r.estado,
      count: r._count._all,
      volumenEstimadoM3: r._sum.volumenEstimadoM3?.toNumber() ?? 0,
    }));
  }
}
