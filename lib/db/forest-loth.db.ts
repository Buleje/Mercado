/**
 * ForestLothDB — Libro de Operaciones de Títulos Habilitantes (LO-TH), ADR-125.
 *
 * Libro del titular de la concesión/permiso EN EL BOSQUE (≠ LO-CTP de planta).
 * Tabla unificada `ForestLothEntry` con discriminador `section` (6 secciones)
 * + carátula `ForestLothCaratula` (1 por tomo).
 *
 * Patrón estándar Buleje:
 * - tenantId 1er parámetro (multi-tenant guard)
 * - Sin Prisma directo desde API/UI (siempre via esta clase)
 * - Cache invalidate por write
 * - lineNo correlativo calculado max+1 por (tenant, carátula, sección)
 * - Subsanación SERFOR: anular es visible (status=anulado), no se borra
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { LOTH_SECTIONS, type LothSection } from "@/lib/forestal/loth-constants";

export { LOTH_SECTIONS };
export type { LothSection };

export interface LothEntryCreateInput {
  caratulaId?: string | null;
  planId?: string | null;
  section: LothSection;
  entryDate?: Date;

  treeCode?: string | null;
  trozaCode?: string | null;
  despachoCode?: string | null;
  isRama?: boolean;

  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;

  diamMayorM?: number | string | null;
  diamMenorM?: number | string | null;
  lengthM?: number | string | null;
  volumeM3?: number | string | null;

  productType?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  pieces?: number | null;

  gtfNumber?: string | null;

  discarded?: boolean;
  consumoInterno?: boolean;
  observations?: string | null;

  correctsLineNo?: number | null;
  correctionNote?: string | null;

  createdBy: string;
}

export interface LothListFilters {
  section?: LothSection;
  caratulaId?: string;
  search?: string; // matches code/species/gtf
  includeAnnulled?: boolean;
  limit?: number;
  offset?: number;
}

export interface LothCaratulaInput {
  registroNumber?: string | null;
  tomo?: string | null;
  titularName: string;
  representanteLegal?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefono?: string | null;
  email?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Date | null;
  createdBy: string;
}

const CACHE_PREFIX = "forest-loth";

/** Cubicación Smalian/SERFOR (re-export de la fórmula pura). */
export { smalianVolume } from "@/lib/forestal/loth-constants";

const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

export class ForestLothDB {
  // ─── Entries ─────────────────────────────────────────────────────────

  static async create(tenantId: string, input: LothEntryCreateInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!LOTH_SECTIONS.includes(input.section)) {
      throw new Error(`invalid section: ${input.section}`);
    }
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    // Correlativo por (tenant, carátula, sección)
    const max = await prisma.forestLothEntry.aggregate({
      where: { tenantId, caratulaId: input.caratulaId ?? null, section: input.section },
      _max: { lineNo: true },
    });
    const lineNo = (max._max.lineNo ?? 0) + 1;

    const entry = await prisma.forestLothEntry.create({
      data: {
        tenantId,
        caratulaId: input.caratulaId ?? null,
        planId: input.planId ?? null,
        section: input.section,
        lineNo,
        entryDate: input.entryDate ?? new Date(),
        treeCode: input.treeCode?.trim() || null,
        trozaCode: input.trozaCode?.trim() || null,
        despachoCode: input.despachoCode?.trim() || null,
        isRama: input.isRama ?? false,
        speciesCommon: input.speciesCommon?.trim() || null,
        speciesScientific: input.speciesScientific?.trim() || null,
        cites: input.cites ?? false,
        diamMayorM: dec(input.diamMayorM),
        diamMenorM: dec(input.diamMenorM),
        lengthM: dec(input.lengthM),
        volumeM3: dec(input.volumeM3),
        productType: input.productType?.trim() || null,
        quantity: dec(input.quantity),
        unit: input.unit?.trim() || null,
        pieces: input.pieces ?? null,
        gtfNumber: input.gtfNumber?.trim() || null,
        discarded: input.discarded ?? false,
        consumoInterno: input.consumoInterno ?? false,
        observations: input.observations?.trim() || null,
        correctsLineNo: input.correctsLineNo ?? null,
        correctionNote: input.correctionNote?.trim() || null,
        status: "registrado",
        createdBy: input.createdBy,
      },
    });

    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  static async list(tenantId: string, filters: LothListFilters = {}) {
    if (!tenantId) throw new Error("tenantId is required");

    const where: Prisma.ForestLothEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (filters.caratulaId) where.caratulaId = filters.caratulaId;
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.search) {
      where.OR = [
        { treeCode: { contains: filters.search, mode: "insensitive" } },
        { trozaCode: { contains: filters.search, mode: "insensitive" } },
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
        { gtfNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [entries, total] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where,
        orderBy: [{ section: "asc" }, { lineNo: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.forestLothEntry.count({ where }),
    ]);

    return { entries, total };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothEntry.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  /** Subsanación SERFOR: anular es visible, no se borra. */
  static async annul(tenantId: string, id: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("annul reason is required");
    const entry = await prisma.forestLothEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  /** Soft delete (solo errores de captura del sistema, no subsanación normativa). */
  static async softDelete(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entry = await prisma.forestLothEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  /** Resumen por sección: conteo + volumen registrado. */
  static async stats(tenantId: string, caratulaId?: string) {
    const where: Prisma.ForestLothEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
    };
    if (caratulaId) where.caratulaId = caratulaId;
    const rows = await prisma.forestLothEntry.groupBy({
      by: ["section"],
      where,
      _count: { _all: true },
      _sum: { volumeM3: true, quantity: true },
    });
    return rows.map((r) => ({
      section: r.section as LothSection,
      count: r._count._all,
      totalVolumeM3: r._sum.volumeM3?.toNumber() ?? 0,
      totalQuantity: r._sum.quantity?.toNumber() ?? 0,
    }));
  }

  /**
   * Trozas despachadas con su especie/medidas/volumen resueltos desde Trozado.
   * Alimenta el prefill de la GTF ("cargar desde despacho").
   */
  static async despachablesResueltos(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entries = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", section: { in: ["trozado", "despacho_troza"] } },
      select: {
        section: true, trozaCode: true, speciesCommon: true, speciesScientific: true, cites: true,
        diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true, gtfNumber: true,
      },
    });
    const trozaMap = new Map<string, { species: string | null; scientific: string | null; cites: boolean; dM: number | null; dm: number | null; L: number | null; vol: number | null }>();
    for (const e of entries) {
      if (e.section === "trozado" && e.trozaCode) {
        trozaMap.set(e.trozaCode, {
          species: e.speciesCommon, scientific: e.speciesScientific, cites: e.cites,
          dM: e.diamMayorM ? Number(e.diamMayorM) : null, dm: e.diamMenorM ? Number(e.diamMenorM) : null,
          L: e.lengthM ? Number(e.lengthM) : null, vol: e.volumeM3 ? Number(e.volumeM3) : null,
        });
      }
    }
    const items: Array<Record<string, unknown>> = [];
    for (const e of entries) {
      if (e.section === "despacho_troza" && e.trozaCode) {
        const t = trozaMap.get(e.trozaCode);
        items.push({
          code: e.trozaCode, species: t?.species ?? null, scientific: t?.scientific ?? null, cites: t?.cites ?? false,
          diamMayorM: t?.dM ?? null, diamMenorM: t?.dm ?? null, lengthM: t?.L ?? null, volumeM3: t?.vol ?? null,
          gtfNumber: e.gtfNumber ?? null,
        });
      }
    }
    return items;
  }

  /**
   * Ítems seleccionables para la sección (flujo data-driven, ADR-127):
   *  - tala            → censo del plan con árboles `en_pie`
   *  - trozado         → talas registradas (árboles tumbados) listos para trozar
   *  - despacho_troza  → trozas trozadas aún no despachadas
   *  - consumo_troza   → trozas trozadas aún no consumidas
   *  - producto_terminado → trozas consumidas (materia prima del aserrío)
   *  - despacho_producto  → productos terminados disponibles para despachar
   */
  static async availableSource(tenantId: string, section: LothSection, planId?: string) {
    if (!tenantId) throw new Error("tenantId is required");

    if (section === "tala") {
      const trees = await prisma.forestCensusTree.findMany({
        where: { tenantId, deletedAt: null, estado: "en_pie", ...(planId ? { planId } : {}) },
        orderBy: { treeCode: "asc" },
        take: 1000,
      });
      return trees.map((t) => ({
        kind: "censo" as const,
        code: t.treeCode,
        species: t.speciesCommon,
        scientific: t.speciesScientific,
        cites: t.cites,
        dapM: t.dapM ? Number(t.dapM) : null,
        hcM: t.alturaComercialM ? Number(t.alturaComercialM) : null,
        vol: t.volumenEstimadoM3 ? Number(t.volumenEstimadoM3) : null,
        meta: t.parcelaCorta ?? null,
      }));
    }

    const entries = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", ...(planId ? { planId } : {}) },
      select: { section: true, treeCode: true, trozaCode: true, speciesCommon: true, speciesScientific: true, cites: true, volumeM3: true, productType: true, quantity: true, unit: true },
    });
    const mapTroza = (e: (typeof entries)[number]) => ({
      kind: "troza" as const, code: e.trozaCode, species: e.speciesCommon, scientific: e.speciesScientific,
      cites: e.cites, vol: e.volumeM3 ? Number(e.volumeM3) : null,
    });

    if (section === "trozado") {
      return entries.filter((e) => e.section === "tala" && e.treeCode).map((e) => ({
        kind: "tala" as const, code: e.treeCode, species: e.speciesCommon, scientific: e.speciesScientific,
        cites: e.cites, vol: e.volumeM3 ? Number(e.volumeM3) : null,
      }));
    }
    if (section === "despacho_troza" || section === "consumo_troza") {
      const used = new Set(entries.filter((e) => e.section === section).map((e) => e.trozaCode));
      return entries.filter((e) => e.section === "trozado" && e.trozaCode && !used.has(e.trozaCode)).map(mapTroza);
    }
    if (section === "producto_terminado") {
      return entries.filter((e) => e.section === "consumo_troza" && e.trozaCode).map(mapTroza);
    }
    if (section === "despacho_producto") {
      return entries.filter((e) => e.section === "producto_terminado").map((e) => ({
        kind: "producto" as const, code: e.productType, species: e.speciesCommon, scientific: e.speciesScientific,
        cites: e.cites, productType: e.productType, quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit,
      }));
    }
    return [];
  }

  /**
   * Trazabilidad por código (target del QR de origen, Batch 4): dado un código de
   * árbol (85-TOR) o de troza (85-TOR-A), reconstruye toda la cadena del árbol +
   * el plan/título que lo autoriza. Solo info de origen legal (sin costos/precios).
   */
  static async traceByCode(tenantId: string, code: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const norm = code.trim();
    if (!norm) return null;
    // El código de troza es <árbol>-<sufijo>; derivamos el árbol raíz.
    const treeRoot = norm.includes("-") ? norm.replace(/-[A-Za-z0-9]+$/, "") : norm;

    const entries = await prisma.forestLothEntry.findMany({
      where: {
        tenantId, deletedAt: null, status: "registrado",
        OR: [
          { treeCode: treeRoot }, { treeCode: norm },
          { trozaCode: norm }, { trozaCode: treeRoot }, { trozaCode: { startsWith: `${treeRoot}-` } },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      select: {
        section: true, lineNo: true, entryDate: true, treeCode: true, trozaCode: true, despachoCode: true,
        speciesCommon: true, speciesScientific: true, cites: true, productType: true,
        volumeM3: true, quantity: true, unit: true, gtfNumber: true, planId: true,
      },
    });
    if (entries.length === 0) return null;

    const planId = entries.find((e) => e.planId)?.planId ?? null;
    const plan = planId
      ? await prisma.forestPlan.findFirst({
          where: { tenantId, id: planId, deletedAt: null },
          select: { planType: true, planNumber: true, titularName: true, tituloHabilitante: true, resolucionNumber: true, resolucionDate: true, region: true, arffs: true, vigenciaHasta: true, estado: true },
        })
      : null;

    const speciesEntry = entries.find((e) => e.speciesCommon) ?? entries[0];
    const gtfs = [...new Set(entries.map((e) => e.gtfNumber).filter(Boolean))] as string[];

    return {
      code: norm,
      treeCode: treeRoot,
      species: speciesEntry.speciesCommon,
      scientific: speciesEntry.speciesScientific,
      cites: speciesEntry.cites,
      plan,
      gtfs,
      chain: entries.map((e) => ({
        section: e.section, lineNo: e.lineNo, entryDate: e.entryDate.toISOString(),
        treeCode: e.treeCode, trozaCode: e.trozaCode, despachoCode: e.despachoCode,
        productType: e.productType, volumeM3: e.volumeM3 ? Number(e.volumeM3) : null,
        quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit, gtfNumber: e.gtfNumber,
      })),
    };
  }

  // ─── Carátula ────────────────────────────────────────────────────────

  static async createCaratula(tenantId: string, input: LothCaratulaInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    const caratula = await prisma.forestLothCaratula.create({
      data: {
        tenantId,
        registroNumber: input.registroNumber?.trim() || null,
        tomo: input.tomo?.trim() || null,
        titularName: input.titularName.trim(),
        representanteLegal: input.representanteLegal?.trim() || null,
        tituloHabilitante: input.tituloHabilitante?.trim() || null,
        ruc: input.ruc?.trim() || null,
        dni: input.dni?.trim() || null,
        domicilio: input.domicilio?.trim() || null,
        departamento: input.departamento?.trim() || null,
        provincia: input.provincia?.trim() || null,
        distrito: input.distrito?.trim() || null,
        telefono: input.telefono?.trim() || null,
        email: input.email?.trim() || null,
        docGestionType: input.docGestionType?.trim() || null,
        docGestionName: input.docGestionName?.trim() || null,
        resolucionNumber: input.resolucionNumber?.trim() || null,
        resolucionDate: input.resolucionDate ?? null,
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return caratula;
  }

  static async listCaratulas(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothCaratula.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getActiveCaratula(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothCaratula.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateCaratula(
    tenantId: string,
    id: string,
    patch: Partial<Omit<LothCaratulaInput, "createdBy">>,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const data: Prisma.ForestLothCaratulaUpdateInput = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      (data as Record<string, unknown>)[k] =
        typeof v === "string" ? v.trim() || null : v;
    }
    const caratula = await prisma.forestLothCaratula.update({
      where: { id, tenantId } satisfies Prisma.ForestLothCaratulaWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return caratula;
  }
}
