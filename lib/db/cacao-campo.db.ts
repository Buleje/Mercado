/**
 * CacaoCampoDB — manejo de campo de cacao (ADR/migración 304). La "maqueta" de
 * la chacra en grilla: secciones (CacaoParcela) + labores agrícolas por sección
 * (CacaoParcelaLabor). El estado de cada sección (al día / pendiente / vencido)
 * se calcula en backend a partir de sus labores. Patrón Buleje: tenantId 1er
 * param · sin fallback de tenant · invalidate tras writes.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";

const CACHE_PREFIX = "cacao";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

export const CACAO_LABOR_TIPOS = ["poda", "fertilizacion", "deshierbe", "fitosanitario", "riego", "cosecha"] as const;
export type CacaoLaborTipo = (typeof CACAO_LABOR_TIPOS)[number];

export type CacaoParcelaStatus = "al_dia" | "pendiente" | "vencido" | "sin_labores";

export interface ParcelaInput {
  codigo: string;
  nombre?: string | null;
  areaHa?: number | string | null;
  variedad?: string | null;
  anioSiembra?: number | null;
  nPlantas?: number | null;
  gridRow?: number | null;
  gridCol?: number | null;
  poligono?: string | null;
  color?: string | null;
  observaciones?: string | null;
  status?: string;
  createdBy?: string | null;
}

export interface LaborInput {
  parcelaId: string;
  tipo: CacaoLaborTipo;
  estado?: string;
  fechaPlan?: Date | null;
  fechaHecho?: Date | null;
  responsable?: string | null;
  detalle?: string | null;
  cantidad?: number | string | null;
  unidad?: string | null;
  createdBy?: string | null;
}

type LaborLite = { tipo: string; estado: string; fechaPlan: Date | null; fechaHecho: Date | null };

/** Estado de una sección a partir de sus labores (vencido > pendiente > al día). */
function parcelaStatusFrom(labores: LaborLite[], now: number): {
  status: CacaoParcelaStatus;
  hechos: number;
  pendientes: number;
  vencidos: number;
} {
  let hechos = 0, pendientes = 0, vencidos = 0;
  for (const l of labores) {
    if (l.estado === "hecho") hechos++;
    else if (l.fechaPlan && l.fechaPlan.getTime() < now) vencidos++;
    else pendientes++;
  }
  const status: CacaoParcelaStatus =
    vencidos > 0 ? "vencido" : pendientes > 0 ? "pendiente" : hechos > 0 ? "al_dia" : "sin_labores";
  return { status, hechos, pendientes, vencidos };
}

export class CacaoCampoDB {
  // ─── Secciones (parcelas) ────────────────────────────────────────────
  static async listParcelas(tenantId: string, filters: { includeInactive?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoParcelaWhereInput = { tenantId, deletedAt: null };
    if (!filters.includeInactive) where.status = "activa";
    const [parcelas, labores] = await Promise.all([
      prisma.cacaoParcela.findMany({ where, orderBy: [{ gridRow: "asc" }, { gridCol: "asc" }, { codigo: "asc" }] }),
      prisma.cacaoParcelaLabor.findMany({
        where: { tenantId, deletedAt: null },
        select: { parcelaId: true, tipo: true, estado: true, fechaPlan: true, fechaHecho: true },
      }),
    ]);
    const now = Date.now();
    const byParcela = new Map<string, LaborLite[]>();
    for (const l of labores) {
      const arr = byParcela.get(l.parcelaId) ?? [];
      arr.push(l);
      byParcela.set(l.parcelaId, arr);
    }
    const list = parcelas.map((p) => {
      const ls = byParcela.get(p.id) ?? [];
      const agg = parcelaStatusFrom(ls, now);
      // Resumen por tipo: último hecho + si hay pendiente/vencido de ese tipo.
      const porTipo: Record<string, { hechos: number; pendientes: number; vencido: boolean; ultimoHecho: string | null }> = {};
      for (const tipo of CACAO_LABOR_TIPOS) porTipo[tipo] = { hechos: 0, pendientes: 0, vencido: false, ultimoHecho: null };
      for (const l of ls) {
        const t = porTipo[l.tipo];
        if (!t) continue;
        if (l.estado === "hecho") {
          t.hechos++;
          const f = l.fechaHecho ? l.fechaHecho.toISOString() : null;
          if (f && (!t.ultimoHecho || f > t.ultimoHecho)) t.ultimoHecho = f;
        } else {
          t.pendientes++;
          if (l.fechaPlan && l.fechaPlan.getTime() < now) t.vencido = true;
        }
      }
      return {
        ...p,
        areaHa: p.areaHa == null ? null : Number(p.areaHa),
        status: p.status,
        laborStatus: agg.status,
        labores: { total: ls.length, hechos: agg.hechos, pendientes: agg.pendientes, vencidos: agg.vencidos },
        porTipo,
      };
    });
    return list;
  }

  static async parcelaDetail(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const parcela = await prisma.cacaoParcela.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!parcela) return null;
    const labores = await prisma.cacaoParcelaLabor.findMany({
      where: { tenantId, parcelaId: id, deletedAt: null },
      orderBy: [{ fechaHecho: "desc" }, { fechaPlan: "asc" }, { createdAt: "desc" }],
    });
    return {
      parcela: { ...parcela, areaHa: parcela.areaHa == null ? null : Number(parcela.areaHa) },
      labores: labores.map((l) => ({ ...l, cantidad: l.cantidad == null ? null : Number(l.cantidad) })),
    };
  }

  static async createParcela(tenantId: string, input: ParcelaInput) {
    if (!tenantId) throw new Error("tenantId is required");
    try {
      const p = await prisma.cacaoParcela.create({
        data: {
          tenantId,
          codigo: input.codigo.trim(),
          nombre: input.nombre?.trim() || null,
          areaHa: dec(input.areaHa),
          variedad: input.variedad?.trim() || null,
          anioSiembra: input.anioSiembra ?? null,
          nPlantas: input.nPlantas ?? null,
          gridRow: input.gridRow ?? 0,
          gridCol: input.gridCol ?? 0,
          poligono: input.poligono?.trim() || null,
          color: input.color?.trim() || null,
          observaciones: input.observaciones?.trim() || null,
          status: input.status ?? "activa",
          createdBy: input.createdBy ?? null,
        },
      });
      this.invalidate(tenantId);
      return p;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") throw new Error("codigo_duplicado");
      throw e;
    }
  }

  static async updateParcela(tenantId: string, id: string, patch: Partial<Omit<ParcelaInput, "createdBy">>) {
    if (!tenantId) throw new Error("tenantId is required");
    const data: Prisma.CacaoParcelaUpdateInput = {};
    const decKeys = new Set(["areaHa"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    try {
      const p = await prisma.cacaoParcela.update({
        where: { id, tenantId } satisfies Prisma.CacaoParcelaWhereUniqueInput,
        data,
      });
      this.invalidate(tenantId);
      return p;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") throw new Error("codigo_duplicado");
      throw e;
    }
  }

  /** Soft-delete de la sección + sus labores (no rompe historial). */
  static async deleteParcela(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const now = new Date();
    await prisma.$transaction([
      prisma.cacaoParcela.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: now } }),
      prisma.cacaoParcelaLabor.updateMany({ where: { parcelaId: id, tenantId, deletedAt: null }, data: { deletedAt: now } }),
    ]);
    this.invalidate(tenantId);
    return { ok: true };
  }

  // ─── Labores ─────────────────────────────────────────────────────────
  static async createLabor(tenantId: string, input: LaborInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const parcela = await prisma.cacaoParcela.findFirst({
      where: { id: input.parcelaId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!parcela) throw new Error("parcela_not_found");
    const estado = input.estado === "hecho" ? "hecho" : "pendiente";
    const l = await prisma.cacaoParcelaLabor.create({
      data: {
        tenantId,
        parcelaId: input.parcelaId,
        tipo: input.tipo,
        estado,
        fechaPlan: input.fechaPlan ?? null,
        fechaHecho: estado === "hecho" ? (input.fechaHecho ?? new Date()) : (input.fechaHecho ?? null),
        responsable: input.responsable?.trim() || null,
        detalle: input.detalle?.trim() || null,
        cantidad: dec(input.cantidad),
        unidad: input.unidad?.trim() || null,
        createdBy: input.createdBy ?? null,
      },
    });
    this.invalidate(tenantId);
    return l;
  }

  /** Marca una labor como hecha (o la reabre a pendiente). */
  static async setLaborEstado(tenantId: string, id: string, estado: "hecho" | "pendiente", fechaHecho?: Date | null) {
    if (!tenantId) throw new Error("tenantId is required");
    const labor = await prisma.cacaoParcelaLabor.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
    if (!labor) throw new Error("labor_not_found");
    const l = await prisma.cacaoParcelaLabor.update({
      where: { id, tenantId } satisfies Prisma.CacaoParcelaLaborWhereUniqueInput,
      data: {
        estado,
        fechaHecho: estado === "hecho" ? (fechaHecho ?? new Date()) : null,
      },
    });
    this.invalidate(tenantId);
    return l;
  }

  static async deleteLabor(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const res = await prisma.cacaoParcelaLabor.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new Error("labor_not_found");
    this.invalidate(tenantId);
    return { ok: true };
  }

  // ─── KPIs del campo ──────────────────────────────────────────────────
  static async stats(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const parcelas = await this.listParcelas(tenantId, { includeInactive: false });
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const areaHa = parcelas.reduce((a, p) => a + (p.areaHa ?? 0), 0);
    const alDia = parcelas.filter((p) => p.laborStatus === "al_dia").length;
    const pendientes = parcelas.filter((p) => p.laborStatus === "pendiente").length;
    const vencidos = parcelas.filter((p) => p.laborStatus === "vencido").length;
    const laboresPendientes = parcelas.reduce((a, p) => a + p.labores.pendientes + p.labores.vencidos, 0);
    return {
      parcelas: parcelas.length,
      areaHa: r2(areaHa),
      alDia,
      pendientes,
      vencidos,
      laboresPendientes,
    };
  }

  private static invalidate(tenantId: string) {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
  }
}
