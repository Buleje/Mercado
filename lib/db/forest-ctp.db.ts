/**
 * ForestCtpDB — Libro CTP: producción/transformación + despacho + saldos de planta (ADR-127).
 * El ingreso de materia prima vive en `WoodEntry` (ADR-124); acá producción y despacho.
 * Patrón Buleje: tenantId 1er param · cache invalidate · lineNo correlativo.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";

export const CTP_SECTIONS = ["produccion", "despacho"] as const;
export type CtpSection = (typeof CTP_SECTIONS)[number];

const CACHE_PREFIX = "forest-ctp";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

export interface CtpEntryInput {
  section: CtpSection;
  entryDate?: Date;
  gtfIngreso?: string | null;
  materiaPrimaRef?: string | null;
  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;
  productType?: string | null;
  volumeInputM3?: number | string | null;
  rendimientoPct?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  pieces?: number | null;
  gtfNumber?: string | null;
  destino?: string | null;
  observations?: string | null;
  createdBy: string;
}

export class ForestCtpDB {
  static async create(tenantId: string, input: CtpEntryInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!CTP_SECTIONS.includes(input.section)) throw new Error(`invalid section: ${input.section}`);
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    const max = await prisma.forestCtpEntry.aggregate({
      where: { tenantId, section: input.section },
      _max: { lineNo: true },
    });
    const lineNo = (max._max.lineNo ?? 0) + 1;

    // Rendimiento auto si hay input+output en m³ y no se pasó explícito
    let rendimiento = input.rendimientoPct;
    const inVol = input.volumeInputM3 != null ? Number(input.volumeInputM3) : 0;
    const outQty = input.quantity != null ? Number(input.quantity) : 0;
    if (rendimiento == null && input.section === "produccion" && inVol > 0 && outQty > 0 && input.unit === "m3") {
      rendimiento = Math.round((outQty / inVol) * 10000) / 100;
    }

    const entry = await prisma.forestCtpEntry.create({
      data: {
        tenantId,
        section: input.section,
        lineNo,
        entryDate: input.entryDate ?? new Date(),
        gtfIngreso: input.gtfIngreso?.trim() || null,
        materiaPrimaRef: input.materiaPrimaRef?.trim() || null,
        speciesCommon: input.speciesCommon?.trim() || null,
        speciesScientific: input.speciesScientific?.trim() || null,
        cites: input.cites ?? false,
        productType: input.productType?.trim() || null,
        volumeInputM3: dec(input.volumeInputM3),
        rendimientoPct: dec(rendimiento),
        quantity: dec(input.quantity),
        unit: input.unit?.trim() || null,
        pieces: input.pieces ?? null,
        gtfNumber: input.gtfNumber?.trim() || null,
        destino: input.destino?.trim() || null,
        observations: input.observations?.trim() || null,
        status: "registrado",
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  static async list(tenantId: string, filters: { section?: CtpSection; search?: string; includeAnnulled?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.search) {
      where.OR = [
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
        { productType: { contains: filters.search, mode: "insensitive" } },
        { gtfNumber: { contains: filters.search, mode: "insensitive" } },
        { gtfIngreso: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [entries, total] = await Promise.all([
      prisma.forestCtpEntry.findMany({ where, orderBy: [{ section: "asc" }, { lineNo: "asc" }], take: 500 }),
      prisma.forestCtpEntry.count({ where }),
    ]);
    return { entries, total };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpEntry.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  static async annul(tenantId: string, id: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return e;
  }

  static async softDelete(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return e;
  }

  /**
   * Saldos de planta del CTP:
   *  - materia prima = Σ ingreso (WoodEntry) − Σ consumido en producción
   *  - stock de productos (por tipo) = Σ producido − Σ despachado
   */
  static async saldos(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [ingresoAgg, ctp] = await Promise.all([
      prisma.woodEntry.aggregate({
        where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado", "pendiente"] } },
        _sum: { volumeM3: true },
        _count: { _all: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { section: true, productType: true, speciesCommon: true, volumeInputM3: true, quantity: true, unit: true },
      }),
    ]);

    const ingresoM3 = ingresoAgg._sum.volumeM3?.toNumber() ?? 0;
    let consumidoM3 = 0;
    const prod: Record<string, { producido: number; despachado: number }> = {};
    for (const e of ctp) {
      if (e.section === "produccion") {
        consumidoM3 += Number(e.volumeInputM3 ?? 0);
        const key = `${e.productType ?? "—"} · ${e.speciesCommon ?? "—"}`;
        (prod[key] ??= { producido: 0, despachado: 0 }).producido += Number(e.quantity ?? 0);
      }
      if (e.section === "despacho") {
        const key = `${e.productType ?? "—"} · ${e.speciesCommon ?? "—"}`;
        (prod[key] ??= { producido: 0, despachado: 0 }).despachado += Number(e.quantity ?? 0);
      }
    }
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    return {
      materiaPrima: {
        ingresoM3: r4(ingresoM3),
        ingresosCount: ingresoAgg._count._all,
        consumidoM3: r4(consumidoM3),
        saldoM3: r4(ingresoM3 - consumidoM3),
      },
      productos: Object.entries(prod).map(([k, v]) => ({
        producto: k,
        producido: r4(v.producido),
        despachado: r4(v.despachado),
        stock: r4(v.producido - v.despachado),
      })),
    };
  }
}
