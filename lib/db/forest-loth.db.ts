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

/** Smalian/SERFOR: V = 0.7854 × ((Dmayor + Dmenor)/2)² × Longitud (m³). */
export function smalianVolume(
  diamMayorM: number,
  diamMenorM: number,
  lengthM: number,
): number {
  if (!(diamMayorM > 0) || !(diamMenorM > 0) || !(lengthM > 0)) return 0;
  const dProm = (diamMayorM + diamMenorM) / 2;
  return Math.round(0.7854 * dProm * dProm * lengthM * 10000) / 10000;
}

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
