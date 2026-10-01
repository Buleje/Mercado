/**
 * CacaoSanidadDB — monitoreo fitosanitario del campo (migración 309). Focos de
 * plaga/enfermedad por sección (CacaoSanidad). Patrón Buleje: tenantId 1er param,
 * sin fallback de tenant, invalidate tras writes. Ref a parcela = app-level.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";

const CACHE_PREFIX = "cacao";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

export const CACAO_PLAGAS_TIPOS = ["monilia", "escoba_bruja", "phytophthora", "mazorquero", "chinche", "otros"] as const;
export const SANIDAD_SEVERIDADES = ["baja", "media", "alta"] as const;
export const SANIDAD_ESTADOS = ["activo", "controlado", "resuelto"] as const;
const SEV_RANK: Record<string, number> = { baja: 1, media: 2, alta: 3 };

export interface SanidadInput {
  parcelaId: string;
  plaga: string;
  severidad?: string;
  incidenciaPct?: number | string | null;
  fecha?: Date | null;
  tratamiento?: string | null;
  responsable?: string | null;
  notas?: string | null;
  estado?: string;
  createdBy?: string | null;
}

/** Resumen de focos ACTIVOS (no resueltos) por sección, para enriquecer la grilla/mapa. */
export type SanidadResumen = { focos: number; severidadMax: string | null; plagas: string[] };

export class CacaoSanidadDB {
  static async list(tenantId: string, filters: { parcelaId?: string; plaga?: string; estado?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoSanidadWhereInput = { tenantId, deletedAt: null };
    if (filters.parcelaId) where.parcelaId = filters.parcelaId;
    if (filters.plaga) where.plaga = filters.plaga;
    if (filters.estado) where.estado = filters.estado;
    const [rows, parcelas] = await Promise.all([
      prisma.cacaoSanidad.findMany({ where, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] }),
      prisma.cacaoParcela.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, codigo: true, nombre: true } }),
    ]);
    const pMap = new Map(parcelas.map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      incidenciaPct: r.incidenciaPct == null ? null : Number(r.incidenciaPct),
      fecha: r.fecha.toISOString(),
      createdAt: r.createdAt.toISOString(),
      parcelaCodigo: pMap.get(r.parcelaId)?.codigo ?? "—",
      parcelaNombre: pMap.get(r.parcelaId)?.nombre ?? null,
    }));
  }

  static async create(tenantId: string, input: SanidadInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const parcela = await prisma.cacaoParcela.findFirst({ where: { id: input.parcelaId, tenantId, deletedAt: null }, select: { id: true } });
    if (!parcela) throw new Error("parcela_not_found");
    const r = await prisma.cacaoSanidad.create({
      data: {
        tenantId,
        parcelaId: input.parcelaId,
        plaga: input.plaga,
        severidad: SANIDAD_SEVERIDADES.includes(input.severidad as never) ? (input.severidad as string) : "media",
        incidenciaPct: dec(input.incidenciaPct),
        fecha: input.fecha ?? new Date(),
        tratamiento: input.tratamiento?.trim() || null,
        responsable: input.responsable?.trim() || null,
        notas: input.notas?.trim() || null,
        estado: SANIDAD_ESTADOS.includes(input.estado as never) ? (input.estado as string) : "activo",
        createdBy: input.createdBy ?? null,
      },
    });
    this.invalidate(tenantId);
    return r;
  }

  /** Cambia el estado del foco (activo → controlado → resuelto) + nota opcional de tratamiento. */
  static async setEstado(tenantId: string, id: string, estado: string, tratamiento?: string | null) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!SANIDAD_ESTADOS.includes(estado as never)) throw new Error("estado_invalido");
    const data: Prisma.CacaoSanidadUpdateInput = { estado };
    if (tratamiento != null && tratamiento.trim()) data.tratamiento = tratamiento.trim();
    const res = await prisma.cacaoSanidad.updateMany({ where: { id, tenantId, deletedAt: null }, data });
    if (res.count === 0) throw new Error("sanidad_not_found");
    this.invalidate(tenantId);
    return { ok: true };
  }

  static async remove(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const res = await prisma.cacaoSanidad.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (res.count === 0) throw new Error("sanidad_not_found");
    this.invalidate(tenantId);
    return { ok: true };
  }

  /** KPIs del tablero de sanidad. */
  static async stats(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.cacaoSanidad.findMany({
      where: { tenantId, deletedAt: null },
      select: { parcelaId: true, plaga: true, severidad: true, estado: true, incidenciaPct: true },
    });
    const activos = rows.filter((r) => r.estado !== "resuelto");
    const seccionesAfectadas = new Set(activos.map((r) => r.parcelaId)).size;
    const porPlaga = new Map<string, { count: number; sevRank: number }>();
    let incSum = 0, incN = 0;
    for (const r of activos) {
      const cur = porPlaga.get(r.plaga) ?? { count: 0, sevRank: 0 };
      cur.count++; cur.sevRank = Math.max(cur.sevRank, SEV_RANK[r.severidad] ?? 0);
      porPlaga.set(r.plaga, cur);
      if (r.incidenciaPct != null) { incSum += Number(r.incidenciaPct); incN++; }
    }
    const porPlagaArr = [...porPlaga.entries()].map(([plaga, v]) => ({ plaga, count: v.count, sevRank: v.sevRank })).sort((a, b) => b.count - a.count);
    return {
      focosActivos: activos.length,
      criticos: activos.filter((r) => r.severidad === "alta").length,
      seccionesAfectadas,
      incidenciaProm: incN > 0 ? Math.round((incSum / incN) * 10) / 10 : null,
      plagaTop: porPlagaArr[0]?.plaga ?? null,
      porPlaga: porPlagaArr,
      total: rows.length,
    };
  }

  /** Resumen de focos activos por sección (para grilla/mapa/drawer). */
  static async summaryByParcela(tenantId: string): Promise<Map<string, SanidadResumen>> {
    if (!tenantId) return new Map();
    const rows = await prisma.cacaoSanidad.findMany({
      where: { tenantId, deletedAt: null, estado: { not: "resuelto" } },
      select: { parcelaId: true, plaga: true, severidad: true },
    });
    const m = new Map<string, SanidadResumen>();
    for (const r of rows) {
      const cur = m.get(r.parcelaId) ?? { focos: 0, severidadMax: null, plagas: [] };
      cur.focos++;
      if (!cur.plagas.includes(r.plaga)) cur.plagas.push(r.plaga);
      if (!cur.severidadMax || (SEV_RANK[r.severidad] ?? 0) > (SEV_RANK[cur.severidadMax] ?? 0)) cur.severidadMax = r.severidad;
      m.set(r.parcelaId, cur);
    }
    return m;
  }

  private static invalidate(tenantId: string) {
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
  }
}
