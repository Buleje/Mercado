/**
 * CacaoDB — Acopio & Beneficio de Cacao (ADR-128).
 * Patrón Buleje: tenantId 1er param · cache invalidate · sin fallback de tenant.
 * Calidad/liquidación delegadas a funciones puras de `lib/cacao/cacao-quality`.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { cacaoFermentationIndex, cacaoGrade, cacaoLiquidacion } from "@/lib/cacao/cacao-quality";

const CACHE_PREFIX = "cacao";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);
const n = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

export interface ProducerInput {
  codigo?: string | null; nombre: string; dni?: string | null; sector?: string | null;
  parcelaHa?: number | string | null; variedad?: string | null; certificacion?: string | null;
  altitudMsnm?: number | null; telefono?: string | null; observaciones?: string | null;
  status?: string; createdBy: string;
}

export interface LoteInput {
  loteCode?: string | null; productorId?: string | null; productorNombre?: string | null;
  fecha?: Date; variedad?: string | null; tipoGrano?: string;
  pesoKg: number | string; humedadPct?: number | string | null;
  precioPorKg?: number | string | null; premioPorKg?: number | string | null;
  cutGranos?: number | null; pctBienFermentado?: number | string | null; pctVioleta?: number | string | null;
  pctPizarroso?: number | string | null; pctMohoso?: number | string | null;
  granosPor100g?: number | null; pctCascara?: number | string | null; pctImpurezas?: number | string | null;
  destino?: string | null; observaciones?: string | null; createdBy: string;
}

export class CacaoDB {
  // ─── Productores ─────────────────────────────────────────────────────
  static async listProducers(tenantId: string, filters: { search?: string; includeInactive?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoProducerWhereInput = { tenantId, deletedAt: null };
    if (!filters.includeInactive) where.status = "activo";
    if (filters.search) {
      where.OR = [
        { nombre: { contains: filters.search, mode: "insensitive" } },
        { codigo: { contains: filters.search, mode: "insensitive" } },
        { sector: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    return prisma.cacaoProducer.findMany({ where, orderBy: { nombre: "asc" }, take: 500 });
  }

  static async createProducer(tenantId: string, input: ProducerInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.nombre?.trim()) throw new Error("nombre is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");
    let codigo = input.codigo?.trim() || null;
    if (!codigo) {
      const count = await prisma.cacaoProducer.count({ where: { tenantId, deletedAt: null } });
      codigo = `P-${String(count + 1).padStart(3, "0")}`;
    }
    const p = await prisma.cacaoProducer.create({
      data: {
        tenantId, codigo, nombre: input.nombre.trim(), dni: input.dni?.trim() || null,
        sector: input.sector?.trim() || null, parcelaHa: dec(input.parcelaHa),
        variedad: input.variedad?.trim() || null, certificacion: input.certificacion?.trim() || null,
        altitudMsnm: input.altitudMsnm ?? null, telefono: input.telefono?.trim() || null,
        observaciones: input.observaciones?.trim() || null, status: input.status ?? "activo",
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return p;
  }

  static async updateProducer(tenantId: string, id: string, patch: Partial<Omit<ProducerInput, "createdBy">>) {
    if (!tenantId) throw new Error("tenantId is required");
    const data: Prisma.CacaoProducerUpdateInput = {};
    const decKeys = new Set(["parcelaHa"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const p = await prisma.cacaoProducer.update({ where: { id, tenantId } satisfies Prisma.CacaoProducerWhereUniqueInput, data });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return p;
  }

  // ─── Lotes de acopio ─────────────────────────────────────────────────
  static async listLotes(tenantId: string, filters: { search?: string; includeAnnulled?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoLoteWhereInput = { tenantId, deletedAt: null };
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.search) {
      where.OR = [
        { loteCode: { contains: filters.search, mode: "insensitive" } },
        { productorNombre: { contains: filters.search, mode: "insensitive" } },
        { variedad: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    return prisma.cacaoLote.findMany({ where, orderBy: { fecha: "desc" }, take: 500 });
  }

  static async createLote(tenantId: string, input: LoteInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (input.pesoKg == null || Number(input.pesoKg) <= 0) throw new Error("pesoKg must be > 0");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    let loteCode = input.loteCode?.trim() || null;
    if (!loteCode) {
      const year = (input.fecha ?? new Date()).getUTCFullYear();
      const count = await prisma.cacaoLote.count({ where: { tenantId, loteCode: { startsWith: `L-${year}-` } } });
      loteCode = `L-${year}-${String(count + 1).padStart(3, "0")}`;
    }

    const cut = {
      pctBienFermentado: n(input.pctBienFermentado), pctVioleta: n(input.pctVioleta),
      pctPizarroso: n(input.pctPizarroso), pctMohoso: n(input.pctMohoso), humedadPct: n(input.humedadPct),
    };
    const indice = cacaoFermentationIndex(cut);
    const grado = cacaoGrade(cut);
    const total = cacaoLiquidacion(Number(input.pesoKg), n(input.precioPorKg), n(input.premioPorKg));

    const lote = await prisma.cacaoLote.create({
      data: {
        tenantId, loteCode, productorId: input.productorId?.trim() || null,
        productorNombre: input.productorNombre?.trim() || null, fecha: input.fecha ?? new Date(),
        variedad: input.variedad?.trim() || null, tipoGrano: input.tipoGrano?.trim() || "seco",
        pesoKg: new Prisma.Decimal(input.pesoKg), humedadPct: dec(input.humedadPct),
        precioPorKg: dec(input.precioPorKg), premioPorKg: dec(input.premioPorKg),
        totalPagado: dec(total),
        cutGranos: input.cutGranos ?? null, pctBienFermentado: dec(input.pctBienFermentado),
        pctVioleta: dec(input.pctVioleta), pctPizarroso: dec(input.pctPizarroso), pctMohoso: dec(input.pctMohoso),
        granosPor100g: input.granosPor100g ?? null, pctCascara: dec(input.pctCascara), pctImpurezas: dec(input.pctImpurezas),
        indiceFermentacion: dec(indice), grado: grado ?? null,
        destino: input.destino?.trim() || null, observaciones: input.observaciones?.trim() || null,
        status: "registrado", createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return lote;
  }

  static async annulLote(tenantId: string, id: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    const l = await prisma.cacaoLote.update({
      where: { id, tenantId } satisfies Prisma.CacaoLoteWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return l;
  }

  /** Resumen: kg acopiados, valor pagado, calidad, distribución por variedad/grado. */
  static async stats(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, productoresActivos] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { pesoKg: true, totalPagado: true, variedad: true, grado: true, indiceFermentacion: true, humedadPct: true },
      }),
      prisma.cacaoProducer.count({ where: { tenantId, deletedAt: null, status: "activo" } }),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    let kg = 0, valor = 0, idxSum = 0, idxN = 0, humOk = 0;
    const porVariedad: Record<string, number> = {};
    const porGrado: Record<string, number> = {};
    for (const l of lotes) {
      kg += Number(l.pesoKg ?? 0);
      valor += Number(l.totalPagado ?? 0);
      if (l.indiceFermentacion != null) { idxSum += Number(l.indiceFermentacion); idxN++; }
      if (l.humedadPct != null && Number(l.humedadPct) <= 7) humOk++;
      const v = l.variedad ?? "—"; porVariedad[v] = r2((porVariedad[v] ?? 0) + Number(l.pesoKg ?? 0));
      const g = l.grado ?? "sin_clasificar"; porGrado[g] = (porGrado[g] ?? 0) + 1;
    }
    return {
      lotes: lotes.length,
      productoresActivos,
      kgAcopiados: r2(kg),
      valorPagado: r2(valor),
      indiceFermentacionProm: idxN ? Math.round((idxSum / idxN) * 10) / 10 : 0,
      pctHumedadEnNorma: lotes.length ? Math.round((humOk / lotes.length) * 100) : 0,
      porVariedad: Object.entries(porVariedad).map(([variedad, kg]) => ({ variedad, kg })).sort((a, b) => b.kg - a.kg),
      porGrado: Object.entries(porGrado).map(([grado, count]) => ({ grado, count })),
    };
  }
}
