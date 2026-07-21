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
import {
  censusVolume, computeBalance, computeAprovechamiento, detectAnomalias, projectSaldo, computeCosteo,
  estaFueraDePlazo,
  type BalanceMovement, type BalanceSpeciesInput, type CosteoSpeciesInput,
} from "@/lib/forestal/loth-constants";

const CACHE_PREFIX = "forest-plan";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/** Volumen comercial del árbol en pie (re-export de la fórmula pura). */
export { censusVolume };

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
  costoExtraccionM3?: number | string | null;
  costoTransformacionM3?: number | string | null;
  costoFleteM3?: number | string | null;
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
        costoExtraccionM3: dec(input.costoExtraccionM3),
        costoTransformacionM3: dec(input.costoTransformacionM3),
        costoFleteM3: dec(input.costoFleteM3),
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
    const decKeys = new Set(["areaHa", "uitRef", "costoExtraccionM3", "costoTransformacionM3", "costoFleteM3"]);
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

    const species: BalanceSpeciesInput[] = speciesRows.map((s) => ({
      speciesCommon: s.speciesCommon,
      cites: s.cites,
      volumenAutorizadoM3: Number(s.volumenAutorizadoM3),
      precioVentaSoles: s.precioVentaSoles ? Number(s.precioVentaSoles) : null,
      valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ? Number(s.valorEstadoNaturalSoles) : null,
    }));
    const movements: BalanceMovement[] = entries.map((e) => ({
      section: e.section,
      speciesCommon: e.speciesCommon,
      trozaCode: e.trozaCode,
      volumeM3: e.volumeM3 ? Number(e.volumeM3) : null,
      quantity: e.quantity ? Number(e.quantity) : null,
      unit: e.unit,
    }));
    const uit = Number(plan?.uitRef ?? 0);
    const area = Number(plan?.areaHa ?? 0);

    const result = computeBalance(species, movements, { uitRef: uit, areaHa: area });
    return {
      ...result,
      plan: plan ? { vigenciaHasta: plan.vigenciaHasta, estado: plan.estado, areaHa: area, uitRef: uit } : null,
    };
  }

  /**
   * Analítica de inteligencia (Batch 2 · frente C): aprovechamiento bosque→producto,
   * balance por especie, proyección de agotamiento del saldo y anomalías.
   * Usa el plan activo si no se pasa planId. Funciona sin plan (sin balance/proyección).
   */
  static async analytics(tenantId: string, planId?: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = planId
      ? await prisma.forestPlan.findFirst({ where: { tenantId, id: planId, deletedAt: null } })
      : await prisma.forestPlan.findFirst({ where: { tenantId, deletedAt: null, estado: "vigente" }, orderBy: { createdAt: "desc" } });

    const [entries, speciesRows] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { section: true, speciesCommon: true, trozaCode: true, volumeM3: true, quantity: true, unit: true, entryDate: true, createdAt: true, cites: true },
      }),
      plan
        ? prisma.forestPlanSpecies.findMany({ where: { tenantId, planId: plan.id, deletedAt: null } })
        : Promise.resolve([]),
    ]);

    const movements: BalanceMovement[] = entries.map((e) => ({
      section: e.section, speciesCommon: e.speciesCommon, trozaCode: e.trozaCode,
      volumeM3: e.volumeM3 ? Number(e.volumeM3) : null, quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit,
    }));

    const aprovechamiento = computeAprovechamiento(movements);

    let balance: ReturnType<typeof computeBalance> | null = null;
    if (plan && speciesRows.length > 0) {
      const species: BalanceSpeciesInput[] = speciesRows.map((s) => ({
        speciesCommon: s.speciesCommon, cites: s.cites, volumenAutorizadoM3: Number(s.volumenAutorizadoM3),
        precioVentaSoles: s.precioVentaSoles ? Number(s.precioVentaSoles) : null,
        valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ? Number(s.valorEstadoNaturalSoles) : null,
      }));
      balance = computeBalance(species, movements, { uitRef: Number(plan.uitRef ?? 0), areaHa: Number(plan.areaHa ?? 0) });
    }

    // Fuera de plazo — predicado ÚNICO (loth-constants), no re-implementado acá.
    const lateCount = entries.filter((e) => estaFueraDePlazo(e.entryDate, e.createdAt)).length;

    const anomalias = detectAnomalias(movements, balance?.rows ?? [], lateCount);

    let projection = null;
    if (balance) {
      const saldoTotal = balance.rows.reduce((a, r) => a + Math.max(0, r.saldo), 0);
      const movilizadoTotal = balance.rows.reduce((a, r) => a + r.movilizado, 0);
      const firstActivity = entries.reduce<Date | null>((min, e) => (e.entryDate && (!min || e.entryDate < min) ? e.entryDate : min), null);
      projection = projectSaldo(saldoTotal, movilizadoTotal, firstActivity?.toISOString() ?? null, new Date().toISOString());
    }

    // Costeo y margen por m³ (Batch 3): cruza balance × precios × parámetros de costo del plan.
    const costos = {
      extraccionM3: Number(plan?.costoExtraccionM3 ?? 0),
      transformacionM3: Number(plan?.costoTransformacionM3 ?? 0),
      fleteM3: Number(plan?.costoFleteM3 ?? 0),
    };
    let costeo = null;
    if (plan && balance && speciesRows.length > 0) {
      const costeoInputs: CosteoSpeciesInput[] = balance.rows.map((r) => {
        const sp = speciesRows.find((s) => s.speciesCommon === r.species);
        return {
          species: r.species, cites: sp?.cites ?? false, movilizadoM3: r.movilizado,
          precioVentaM3: sp?.precioVentaSoles ? Number(sp.precioVentaSoles) : 0,
          venM3: sp?.valorEstadoNaturalSoles ? Number(sp.valorEstadoNaturalSoles) : 0,
        };
      });
      costeo = computeCosteo(costeoInputs, costos);
    }

    // Especies CITES presentes en el libro (para el cruce con el catálogo de
    // permisos en el panel Cumplimiento — informativo, no resta score).
    const citesEspecies = [
      ...new Set(entries.filter((e) => e.cites && e.speciesCommon).map((e) => e.speciesCommon as string)),
    ];

    // Especies con operaciones en el libro que NO figuran entre las autorizadas
    // del plan (tala/movilización fuera del POA — infracción que cruza OSINFOR).
    // Sólo si el plan declara especies; match case-insensitive. Sin query extra:
    // reusa `entries` + `speciesRows` ya cargados. T7 ya frena el despacho; esto
    // surfacea además la tala/trozado de una especie fuera del plan en el informe.
    const autorizadasSet = new Set(speciesRows.map((s) => s.speciesCommon.trim().toLowerCase()));
    const especiesNoAutorizadas =
      speciesRows.length > 0
        ? [
            ...new Set(
              entries
                .map((e) => e.speciesCommon?.trim())
                .filter((s): s is string => !!s)
                .filter((s) => !autorizadasSet.has(s.toLowerCase())),
            ),
          ]
        : [];

    return {
      hasPlan: !!plan,
      plan: plan ? { id: plan.id, planNumber: plan.planNumber ?? null, titularName: plan.titularName, estado: plan.estado, vigenciaHasta: plan.vigenciaHasta, costos } : null,
      aprovechamiento, balance, anomalias, projection, lateCount, costeo, citesEspecies, especiesNoAutorizadas,
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
