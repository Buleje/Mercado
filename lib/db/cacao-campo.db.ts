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
import { CacaoDB } from "@/lib/db/cacao.db";
import { ExpensesDB } from "@/lib/db/finance.db";

/** Etiquetas de labor sin importar el config client (que arrastra icons). */
const TIPO_LABEL: Record<string, string> = {
  poda: "Poda", fertilizacion: "Fertilización", deshierbe: "Deshierbe",
  fitosanitario: "Control fitosanitario", riego: "Riego", cosecha: "Cosecha",
};

const CACHE_PREFIX = "cacao";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/**
 * Ciclo agronómico sugerido del cacao: días típicos entre labores del mismo tipo
 * en manejo tecnificado de selva. Base del "calendario agronómico" (próxima labor
 * sugerida por sección). La cosecha NO tiene ciclo fijo (depende de floración) →
 * se omite. Es una guía, no una regla: el productor la puede ignorar o reprogramar.
 */
const CACAO_CICLO_DIAS: Record<string, number> = {
  poda: 180, // sanitaria + de formación, ~2×/año
  fertilizacion: 90, // trimestral
  deshierbe: 60, // bimensual
  fitosanitario: 45, // monitoreo/aplicación
  riego: 15, // quincenal (época seca)
};

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
  insumo?: string | null;
  dosis?: string | null;
  costo?: number | string | null;
  recurrenteDias?: number | null;
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
      labores: labores.map((l) => ({ ...l, cantidad: l.cantidad == null ? null : Number(l.cantidad), costo: l.costo == null ? null : Number(l.costo) })),
    };
  }

  // ─── Agenda: todas las labores del campo con su sección (cronograma) ──
  static async listLabores(tenantId: string, filters: { tipo?: string; estado?: string; parcelaId?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoParcelaLaborWhereInput = { tenantId, deletedAt: null };
    if (filters.tipo) where.tipo = filters.tipo;
    if (filters.parcelaId) where.parcelaId = filters.parcelaId;
    if (filters.estado === "hecho") where.estado = "hecho";
    else if (filters.estado === "pendiente") where.estado = { not: "hecho" };
    const [labores, parcelas] = await Promise.all([
      prisma.cacaoParcelaLabor.findMany({ where, orderBy: [{ createdAt: "desc" }] }),
      prisma.cacaoParcela.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, codigo: true, nombre: true } }),
    ]);
    const pMap = new Map(parcelas.map((p) => [p.id, p]));
    const now = Date.now();
    // Fecha relevante para ordenar el cronograma: la que efectivamente pasó/pasará.
    const rows = labores.map((l) => {
      const p = pMap.get(l.parcelaId);
      const fecha = (l.estado === "hecho" ? l.fechaHecho : l.fechaPlan) ?? l.createdAt;
      const vencido = l.estado !== "hecho" && !!l.fechaPlan && l.fechaPlan.getTime() < now;
      return {
        id: l.id, parcelaId: l.parcelaId, parcelaCodigo: p?.codigo ?? "—", parcelaNombre: p?.nombre ?? null,
        tipo: l.tipo, estado: vencido ? "vencido" : l.estado, vencido,
        fecha: fecha.toISOString(),
        fechaHecho: l.fechaHecho ? l.fechaHecho.toISOString() : null,
        fechaPlan: l.fechaPlan ? l.fechaPlan.toISOString() : null,
        responsable: l.responsable, detalle: l.detalle,
        cantidad: l.cantidad == null ? null : Number(l.cantidad), unidad: l.unidad,
        insumo: l.insumo, dosis: l.dosis, costo: l.costo == null ? null : Number(l.costo), recurrenteDias: l.recurrenteDias,
      };
    });
    rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return rows;
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
        insumo: input.insumo?.trim() || null,
        dosis: input.dosis?.trim() || null,
        costo: dec(input.costo),
        recurrenteDias: input.recurrenteDias ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
    // Si se registra directo como hecha: agenda recurrencia + postea el costo a Finanzas.
    if (estado === "hecho") {
      await this.scheduleNextRecurrence(tenantId, l, l.fechaHecho ?? new Date());
      await this.syncGastoForLabor(tenantId, l, true);
    }
    this.invalidate(tenantId);
    return l;
  }

  /** Agenda la próxima ocurrencia de una labor recurrente (+recurrenteDias),
   *  evitando duplicar si ya hay una futura pendiente del mismo tipo/sección. */
  private static async scheduleNextRecurrence(
    tenantId: string,
    labor: { parcelaId: string; tipo: string; recurrenteDias: number | null; responsable: string | null; insumo: string | null; dosis: string | null; costo: Prisma.Decimal | null; unidad: string | null },
    base: Date,
  ) {
    if (!labor.recurrenteDias || labor.recurrenteDias <= 0) return;
    const yaAgendada = await prisma.cacaoParcelaLabor.findFirst({
      where: { tenantId, parcelaId: labor.parcelaId, tipo: labor.tipo, estado: { not: "hecho" }, deletedAt: null, fechaPlan: { gte: base } },
      select: { id: true },
    });
    if (yaAgendada) return;
    await prisma.cacaoParcelaLabor.create({
      data: {
        tenantId, parcelaId: labor.parcelaId, tipo: labor.tipo, estado: "pendiente",
        fechaPlan: new Date(base.getTime() + labor.recurrenteDias * 86_400_000), recurrenteDias: labor.recurrenteDias,
        responsable: labor.responsable, insumo: labor.insumo, dosis: labor.dosis, costo: labor.costo, unidad: labor.unidad,
        createdBy: "recurrencia",
      },
    });
  }

  /** Sincroniza el gasto en Finanzas para una labor: si está hecha y tiene costo,
   *  postea/mantiene un Expense (category 'campo'); si no, lo elimina. Idempotente. */
  private static async syncGastoForLabor(
    tenantId: string,
    labor: { id: string; tipo: string; costo: Prisma.Decimal | null; fechaHecho: Date | null; gastoId: string | null; parcelaId: string },
    incurred: boolean,
  ) {
    const costo = labor.costo == null ? 0 : Number(labor.costo);
    if (incurred && costo > 0) {
      if (labor.gastoId) return; // ya posteado
      const parcela = await prisma.cacaoParcela.findFirst({ where: { id: labor.parcelaId, tenantId }, select: { codigo: true } });
      const gasto = await ExpensesDB.add(tenantId, {
        category: "campo",
        description: `${TIPO_LABEL[labor.tipo] ?? labor.tipo} — sección ${parcela?.codigo ?? "—"}`,
        amount: costo,
        date: (labor.fechaHecho ?? new Date()).toISOString(),
        recurring: false,
      });
      await prisma.cacaoParcelaLabor.update({ where: { id: labor.id, tenantId } satisfies Prisma.CacaoParcelaLaborWhereUniqueInput, data: { gastoId: gasto.id } });
    } else if (labor.gastoId) {
      await ExpensesDB.delete(tenantId, labor.gastoId);
      await prisma.cacaoParcelaLabor.update({ where: { id: labor.id, tenantId } satisfies Prisma.CacaoParcelaLaborWhereUniqueInput, data: { gastoId: null } });
    }
  }

  /** Marca una labor como hecha (o la reabre a pendiente). Si la labor es
   *  recurrente (recurrenteDias) y se marca hecha, agenda automáticamente la
   *  próxima a +N días — así el ciclo alimenta los KPIs pendiente/vencido. */
  static async setLaborEstado(tenantId: string, id: string, estado: "hecho" | "pendiente", fechaHecho?: Date | null) {
    if (!tenantId) throw new Error("tenantId is required");
    const labor = await prisma.cacaoParcelaLabor.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, parcelaId: true, tipo: true, estado: true, recurrenteDias: true, responsable: true, insumo: true, dosis: true, costo: true, unidad: true, gastoId: true },
    });
    if (!labor) throw new Error("labor_not_found");
    const hechaAhora = estado === "hecho";
    const fecha = hechaAhora ? (fechaHecho ?? new Date()) : null;
    const l = await prisma.cacaoParcelaLabor.update({
      where: { id, tenantId } satisfies Prisma.CacaoParcelaLaborWhereUniqueInput,
      data: { estado, fechaHecho: fecha },
    });
    // Recién completada + recurrente → agenda la próxima ocurrencia.
    if (hechaAhora && labor.estado !== "hecho") await this.scheduleNextRecurrence(tenantId, labor, fecha ?? new Date());
    // Postea/quita el gasto en Finanzas según quede hecha o reabierta.
    await this.syncGastoForLabor(tenantId, { ...labor, fechaHecho: fecha }, hechaAhora);
    this.invalidate(tenantId);
    return l;
  }

  /** Envía una cosecha (labor hecha con kg) al módulo de Acopio como CacaoLote,
   *  arrastrando el origen (sección) para trazabilidad — clave para certificación
   *  y NTP 208.040. Marca la labor con loteId para no duplicar el envío. */
  static async enviarCosechaAAcopio(
    tenantId: string,
    laborId: string,
    opts: { precioPorKg?: number | null; productorNombre?: string | null; createdBy: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const labor = await prisma.cacaoParcelaLabor.findFirst({
      where: { id: laborId, tenantId, deletedAt: null },
      select: { id: true, tipo: true, estado: true, cantidad: true, fechaHecho: true, loteId: true, parcelaId: true },
    });
    if (!labor) throw new Error("labor_not_found");
    if (labor.tipo !== "cosecha") throw new Error("no_es_cosecha");
    if (labor.estado !== "hecho") throw new Error("cosecha_no_hecha");
    if (labor.loteId) throw new Error("ya_enviada");
    const kg = labor.cantidad == null ? 0 : Number(labor.cantidad);
    if (kg <= 0) throw new Error("sin_cantidad");
    const parcela = await prisma.cacaoParcela.findFirst({ where: { id: labor.parcelaId, tenantId }, select: { codigo: true, variedad: true } });
    const lote = await CacaoDB.createLote(tenantId, {
      pesoKg: kg,
      fecha: labor.fechaHecho ?? new Date(),
      variedad: parcela?.variedad ?? null,
      productorNombre: opts.productorNombre?.trim() || null,
      precioPorKg: opts.precioPorKg ?? null,
      tipoGrano: "seco",
      parcelaId: labor.parcelaId,
      parcelaCodigo: parcela?.codigo ?? null,
      observaciones: `Origen: sección ${parcela?.codigo ?? "—"} (Campo)`,
      createdBy: opts.createdBy,
    });
    await prisma.cacaoParcelaLabor.update({
      where: { id: laborId, tenantId } satisfies Prisma.CacaoParcelaLaborWhereUniqueInput,
      data: { loteId: lote.id },
    });
    this.invalidate(tenantId);
    return { lote: { id: lote.id, loteCode: lote.loteCode, pesoKg: Number(lote.pesoKg) } };
  }

  static async deleteLabor(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const labor = await prisma.cacaoParcelaLabor.findFirst({ where: { id, tenantId, deletedAt: null }, select: { gastoId: true } });
    const res = await prisma.cacaoParcelaLabor.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new Error("labor_not_found");
    // Quita el gasto de Finanzas asociado (si lo había).
    if (labor?.gastoId) await ExpensesDB.delete(tenantId, labor.gastoId);
    this.invalidate(tenantId);
    return { ok: true };
  }

  // ─── Análisis: productividad, rentabilidad y calendario agronómico ───
  /**
   * Analítica del campo por sección:
   *  · productividad  — kg cosechados, kg/ha, kg/planta, tendencia por campaña.
   *  · rentabilidad   — ingresos (valor de los lotes de acopio generados por sus
   *    cosechas) − costos (labores con costo, ya posteadas a Finanzas) → margen, ROI.
   *  · sugeridas      — próxima labor por sección según ciclo agronómico + última hecha.
   * Todo computado (sin schema nuevo). Ingreso "realizado" = lote valorado; los kg
   * cosechados sin precio se reportan aparte (kgSinValorar) para no inflar el número.
   */
  static async campoAnalytics(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [parcelas, labores] = await Promise.all([
      prisma.cacaoParcela.findMany({ where: { tenantId, deletedAt: null, status: "activa" }, orderBy: [{ codigo: "asc" }] }),
      prisma.cacaoParcelaLabor.findMany({
        where: { tenantId, deletedAt: null },
        select: { parcelaId: true, tipo: true, estado: true, cantidad: true, costo: true, fechaHecho: true, loteId: true },
      }),
    ]);
    // Valor de los lotes de acopio generados por cosechas (ingreso realizado).
    const loteIds = [...new Set(labores.filter((l) => l.loteId).map((l) => l.loteId as string))];
    const lotes = loteIds.length
      ? await prisma.cacaoLote.findMany({ where: { tenantId, id: { in: loteIds } }, select: { id: true, pesoKg: true, precioPorKg: true, premioPorKg: true, totalPagado: true } })
      : [];
    const loteVal = new Map<string, number>();
    for (const L of lotes) {
      const total = L.totalPagado != null ? Number(L.totalPagado)
        : L.precioPorKg != null ? (Number(L.precioPorKg) + Number(L.premioPorKg ?? 0)) * Number(L.pesoKg)
          : 0;
      loteVal.set(L.id, total);
    }

    const now = Date.now();
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const byParcela = new Map<string, typeof labores>();
    for (const l of labores) { const a = byParcela.get(l.parcelaId) ?? []; a.push(l); byParcela.set(l.parcelaId, a); }

    const secciones = parcelas.map((p) => {
      const ls = byParcela.get(p.id) ?? [];
      const areaHa = p.areaHa == null ? null : Number(p.areaHa);
      const nPlantas = p.nPlantas ?? null;
      const cosechas = ls.filter((l) => l.tipo === "cosecha" && l.estado === "hecho");
      const cosechaKg = cosechas.reduce((a, l) => a + (l.cantidad == null ? 0 : Number(l.cantidad)), 0);
      let ingresos = 0, kgSinValorar = 0;
      for (const c of cosechas) {
        const v = c.loteId ? (loteVal.get(c.loteId) ?? 0) : 0;
        if (v > 0) ingresos += v; else kgSinValorar += c.cantidad == null ? 0 : Number(c.cantidad);
      }
      const costos = ls.reduce((a, l) => a + (l.estado === "hecho" && l.costo != null ? Number(l.costo) : 0), 0);
      const margen = ingresos - costos;
      const porAnio = new Map<number, number>();
      for (const c of cosechas) if (c.fechaHecho) porAnio.set(c.fechaHecho.getUTCFullYear(), (porAnio.get(c.fechaHecho.getUTCFullYear()) ?? 0) + (c.cantidad == null ? 0 : Number(c.cantidad)));
      const tendencia = [...porAnio.entries()].sort((a, b) => a[0] - b[0]).map(([anio, kg]) => ({ anio, kg: Math.round(kg) }));
      return {
        id: p.id, codigo: p.codigo, nombre: p.nombre, variedad: p.variedad,
        areaHa, nPlantas,
        cosechaKg: Math.round(cosechaKg),
        rendKgHa: areaHa && areaHa > 0 ? r1(cosechaKg / areaHa) : null,
        rendKgPlanta: nPlantas && nPlantas > 0 ? r2(cosechaKg / nPlantas) : null,
        ingresos: r2(ingresos), kgSinValorar: Math.round(kgSinValorar),
        costos: r2(costos), margen: r2(margen),
        margenHa: areaHa && areaHa > 0 ? r2(margen / areaHa) : null,
        roi: costos > 0 ? r2(ingresos / costos) : null,
        tendencia,
      };
    });
    const ranked = [...secciones].sort((a, b) => (b.rendKgHa ?? -1) - (a.rendKgHa ?? -1));

    const totalCosechaKg = secciones.reduce((a, s) => a + s.cosechaKg, 0);
    const totalArea = secciones.reduce((a, s) => a + (s.areaHa ?? 0), 0);
    const totales = {
      secciones: secciones.length,
      areaHa: r2(totalArea),
      cosechaKg: totalCosechaKg,
      rendKgHa: totalArea > 0 ? r1(totalCosechaKg / totalArea) : null,
      ingresos: r2(secciones.reduce((a, s) => a + s.ingresos, 0)),
      costos: r2(secciones.reduce((a, s) => a + s.costos, 0)),
      margen: r2(secciones.reduce((a, s) => a + s.margen, 0)),
      kgSinValorar: secciones.reduce((a, s) => a + s.kgSinValorar, 0),
    };

    // Calendario agronómico: próxima labor sugerida por sección (ciclo + última hecha).
    const LOOKAHEAD_MS = 30 * 86_400_000; // mostrar lo que vence en ≤30 días o ya venció
    const sugeridas: Array<{ parcelaId: string; codigo: string; tipo: string; ultimaHecha: string | null; dueDate: string; diasRestantes: number; atrasada: boolean; nunca: boolean }> = [];
    for (const p of parcelas) {
      const ls = byParcela.get(p.id) ?? [];
      for (const tipo of Object.keys(CACAO_CICLO_DIAS)) {
        if (ls.some((l) => l.tipo === tipo && l.estado !== "hecho")) continue; // ya programada
        let ultima: Date | null = null;
        for (const l of ls) if (l.tipo === tipo && l.estado === "hecho" && l.fechaHecho && (!ultima || l.fechaHecho > ultima)) ultima = l.fechaHecho;
        const dueMs = ultima ? ultima.getTime() + CACAO_CICLO_DIAS[tipo] * 86_400_000 : now; // sin registro → sugerir ya
        if (dueMs > now + LOOKAHEAD_MS) continue;
        sugeridas.push({
          parcelaId: p.id, codigo: p.codigo, tipo,
          ultimaHecha: ultima ? ultima.toISOString() : null,
          dueDate: new Date(dueMs).toISOString(),
          diasRestantes: Math.round((dueMs - now) / 86_400_000),
          atrasada: dueMs < now, nunca: !ultima,
        });
      }
    }
    sugeridas.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return { secciones: ranked, totales, sugeridas };
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
