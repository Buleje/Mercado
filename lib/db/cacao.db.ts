/**
 * CacaoDB — Acopio & Beneficio de Cacao (ADR-128).
 * Patrón Buleje: tenantId 1er param · cache invalidate · sin fallback de tenant.
 * Calidad/liquidación delegadas a funciones puras de `lib/cacao/cacao-quality`.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { cacaoFermentationIndex, cacaoGrade, cacaoLiquidacion, cacaoMerma, cacaoProyeccionSeco, cacaoRendimiento, cacaoVentaTotalPen } from "@/lib/cacao/cacao-quality";

const CACHE_PREFIX = "cacao";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);
const n = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

/**
 * Lee de CacaoVenta tolerando que la tabla aún no exista (drift pre-deploy) o
 * que el cliente Prisma en memoria sea anterior al modelo (server sin reiniciar).
 * En esos casos degrada a `fallback` en vez de romper inventario/stats con 500.
 */
async function safeVenta<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!(prisma as { cacaoVenta?: unknown }).cacaoVenta) return fallback;
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const msg = String(e instanceof Error ? e.message : e);
    if (code === "P2021" || /does not exist|relation .* does not exist/i.test(msg)) return fallback;
    throw e;
  }
}

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

export interface BeneficioInput {
  loteId?: string | null; loteCode?: string | null;
  fermInicio?: Date | null; fermDias?: number | null; fermVolteos?: number | null;
  fermTempMaxC?: number | string | null; tipoFermentador?: string | null;
  secInicio?: Date | null; secDias?: number | null; metodoSecado?: string | null;
  humedadInicial?: number | string | null; humedadFinal?: number | string | null;
  pesoHumedoKg?: number | string | null; pesoSecoKg?: number | string | null;
  estado?: string; observaciones?: string | null; createdBy: string;
}

export interface VentaInput {
  fecha?: Date; compradorNombre?: string | null; canal?: string | null;
  pesoKg: number | string; moneda?: string; precioPorKg?: number | string | null;
  tipoCambio?: number | string | null; esFob?: boolean; variedad?: string | null;
  grado?: string | null; observaciones?: string | null; createdBy: string;
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
  static async listLotes(
    tenantId: string,
    filters: { search?: string; includeAnnulled?: boolean; variedad?: string; grado?: string; from?: Date; to?: Date } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoLoteWhereInput = { tenantId, deletedAt: null };
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.variedad) where.variedad = filters.variedad;
    if (filters.grado) where.grado = filters.grado;
    if (filters.from || filters.to) {
      where.fecha = {};
      if (filters.from) (where.fecha as Prisma.DateTimeFilter).gte = filters.from;
      if (filters.to) (where.fecha as Prisma.DateTimeFilter).lte = filters.to;
    }
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

  // ─── Beneficio (fermentación + secado) ───────────────────────────────
  static async listBeneficios(tenantId: string, filters: { search?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoBeneficioWhereInput = { tenantId, deletedAt: null, status: "registrado" };
    if (filters.search) where.loteCode = { contains: filters.search, mode: "insensitive" };
    return prisma.cacaoBeneficio.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  }

  /** Lotes de acopio (húmedos sobre todo) seleccionables para registrar su beneficio. */
  static async availableLotesForBeneficio(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, beneficios] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        orderBy: { fecha: "desc" }, take: 300,
        select: { id: true, loteCode: true, variedad: true, pesoKg: true, tipoGrano: true, humedadPct: true },
      }),
      prisma.cacaoBeneficio.findMany({ where: { tenantId, deletedAt: null, status: "registrado" }, select: { loteId: true } }),
    ]);
    const withBeneficio = new Set(beneficios.map((b) => b.loteId).filter(Boolean));
    return lotes.filter((l) => !withBeneficio.has(l.id));
  }

  static async createBeneficio(tenantId: string, input: BeneficioInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");
    const merma = cacaoMerma(n(input.pesoHumedoKg), n(input.pesoSecoKg));
    // estado: si hay humedad final/peso seco → terminado; si hay secado → secando; else fermentando
    const estado = input.estado?.trim()
      || (input.humedadFinal != null || input.pesoSecoKg != null ? "terminado" : input.secInicio ? "secando" : "fermentando");
    const b = await prisma.cacaoBeneficio.create({
      data: {
        tenantId, loteId: input.loteId?.trim() || null, loteCode: input.loteCode?.trim() || null,
        fermInicio: input.fermInicio ?? null, fermDias: input.fermDias ?? null, fermVolteos: input.fermVolteos ?? null,
        fermTempMaxC: dec(input.fermTempMaxC), tipoFermentador: input.tipoFermentador?.trim() || null,
        secInicio: input.secInicio ?? null, secDias: input.secDias ?? null, metodoSecado: input.metodoSecado?.trim() || null,
        humedadInicial: dec(input.humedadInicial), humedadFinal: dec(input.humedadFinal),
        pesoHumedoKg: dec(input.pesoHumedoKg), pesoSecoKg: dec(input.pesoSecoKg), mermaPct: dec(merma),
        estado, observaciones: input.observaciones?.trim() || null, status: "registrado", createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return b;
  }

  static async annulBeneficio(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const b = await prisma.cacaoBeneficio.update({
      where: { id, tenantId } satisfies Prisma.CacaoBeneficioWhereUniqueInput,
      data: { status: "anulado" },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return b;
  }

  /**
   * Avanza la etapa del beneficio: fermentando → secando → terminado.
   * Estampa fechas/días automáticamente y cierra merma al terminar.
   * Al pasar a "terminado" exige peso seco (para calcular rendimiento/merma).
   */
  static async advanceBeneficio(
    tenantId: string,
    id: string,
    payload: { pesoSecoKg?: number | string | null; humedadFinal?: number | string | null; metodoSecado?: string | null } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const current = await prisma.cacaoBeneficio.findFirst({
      where: { id, tenantId, deletedAt: null } satisfies Prisma.CacaoBeneficioWhereInput,
    });
    if (!current) throw new Error("beneficio_not_found");
    if (current.status !== "registrado") throw new Error("beneficio_anulado");
    const now = new Date();
    const toNum = (v: unknown): number | null => (v == null ? null : Number(v));
    const days = (from: Date | null) =>
      from ? Math.max(0, Math.round((now.getTime() - from.getTime()) / 86_400_000)) : null;
    const data: Prisma.CacaoBeneficioUpdateInput = {};

    if (current.estado === "fermentando") {
      // → secando: arranca el secado, cierra los días de fermentación
      data.estado = "secando";
      data.secInicio = current.secInicio ?? now;
      if (current.fermDias == null) { const d = days(current.fermInicio); if (d != null) data.fermDias = d; }
      const metodo = payload.metodoSecado?.trim();
      if (metodo) data.metodoSecado = metodo;
    } else if (current.estado === "secando") {
      // → terminado: requiere peso seco para cerrar merma/rendimiento
      const pesoSeco = n(payload.pesoSecoKg) ?? toNum(current.pesoSecoKg);
      if (pesoSeco == null || pesoSeco <= 0) throw new Error("peso_seco_requerido");
      data.estado = "terminado";
      data.pesoSecoKg = dec(pesoSeco);
      const humedad = n(payload.humedadFinal) ?? toNum(current.humedadFinal);
      if (humedad != null) data.humedadFinal = dec(humedad);
      const merma = cacaoMerma(toNum(current.pesoHumedoKg), pesoSeco);
      if (merma != null) data.mermaPct = dec(merma);
      if (current.secDias == null) { const d = days(current.secInicio); if (d != null) data.secDias = d; }
    } else {
      throw new Error("beneficio_ya_terminado");
    }

    const b = await prisma.cacaoBeneficio.update({
      where: { id, tenantId } satisfies Prisma.CacaoBeneficioWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return b;
  }

  /** Resumen: kg acopiados, valor pagado, calidad, distribución por variedad/grado. */
  static async stats(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, productoresActivos] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { pesoKg: true, totalPagado: true, variedad: true, grado: true, indiceFermentacion: true, humedadPct: true, tipoGrano: true, fecha: true },
      }),
      prisma.cacaoProducer.count({ where: { tenantId, deletedAt: null, status: "activo" } }),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    let kg = 0, valor = 0, idxSum = 0, idxN = 0, humOk = 0, humN = 0, kgSeco = 0, kgHumedo = 0, gradoI = 0;
    let minFecha: Date | null = null, maxFecha: Date | null = null;
    const porVariedad: Record<string, number> = {};
    const porGrado: Record<string, number> = {};
    for (const l of lotes) {
      const peso = Number(l.pesoKg ?? 0);
      kg += peso;
      valor += Number(l.totalPagado ?? 0);
      if (l.indiceFermentacion != null) { idxSum += Number(l.indiceFermentacion); idxN++; }
      if (l.humedadPct != null) { humN++; if (Number(l.humedadPct) <= 7) humOk++; }
      if (l.tipoGrano === "seco") kgSeco += peso; else kgHumedo += peso;
      if (l.grado === "I") gradoI++;
      const v = l.variedad ?? "—"; porVariedad[v] = r2((porVariedad[v] ?? 0) + peso);
      const g = l.grado ?? "sin_clasificar"; porGrado[g] = (porGrado[g] ?? 0) + 1;
      const f = new Date(l.fecha);
      if (!minFecha || f < minFecha) minFecha = f;
      if (!maxFecha || f > maxFecha) maxFecha = f;
    }
    const n = lotes.length;
    const diasCampana = minFecha && maxFecha ? Math.max(1, Math.round((maxFecha.getTime() - minFecha.getTime()) / 86400000) + 1) : 0;
    return {
      lotes: n,
      productoresActivos,
      kgAcopiados: r2(kg),
      valorPagado: r2(valor),
      precioPromKg: kg > 0 ? r2(valor / kg) : 0,
      ticketPromLote: n ? r2(valor / n) : 0,
      kgPromLote: n ? r2(kg / n) : 0,
      kgSeco: r2(kgSeco),
      kgHumedo: r2(kgHumedo),
      pctGradoI: n ? Math.round((gradoI / n) * 100) : 0,
      indiceFermentacionProm: idxN ? Math.round((idxSum / idxN) * 10) / 10 : 0,
      pctHumedadEnNorma: humN ? Math.round((humOk / humN) * 100) : 0,
      humedadMuestras: humN,
      primeraFecha: minFecha ? minFecha.toISOString() : null,
      ultimaFecha: maxFecha ? maxFecha.toISOString() : null,
      diasCampana,
      porVariedad: Object.entries(porVariedad).map(([variedad, kg]) => ({ variedad, kg })).sort((a, b) => b.kg - a.kg),
      porGrado: Object.entries(porGrado).map(([grado, count]) => ({ grado, count })),
    };
  }

  // ─── Ficha de productor: perfil + historial agregado ─────────────────
  static async producerDetail(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const producer = await prisma.cacaoProducer.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!producer) return null;
    const lotes = await prisma.cacaoLote.findMany({
      where: { tenantId, productorId: id, deletedAt: null, status: "registrado" },
      orderBy: { fecha: "desc" }, take: 200,
      select: {
        id: true, loteCode: true, fecha: true, variedad: true, tipoGrano: true,
        pesoKg: true, humedadPct: true, grado: true, indiceFermentacion: true, totalPagado: true,
      },
    });
    const r2 = (x: number) => Math.round(x * 100) / 100;
    let totalKg = 0, totalPagado = 0, idxSum = 0, idxN = 0;
    const gradoCounts: Record<string, number> = {};
    for (const l of lotes) {
      totalKg += Number(l.pesoKg ?? 0);
      totalPagado += Number(l.totalPagado ?? 0);
      if (l.indiceFermentacion != null) { idxSum += Number(l.indiceFermentacion); idxN++; }
      const g = l.grado ?? "sin_clasificar"; gradoCounts[g] = (gradoCounts[g] ?? 0) + 1;
    }
    return {
      producer,
      lotes,
      agg: {
        loteCount: lotes.length,
        totalKg: r2(totalKg),
        totalPagado: r2(totalPagado),
        avgIndice: idxN ? Math.round((idxSum / idxN) * 10) / 10 : null,
        gradoCounts,
        lastFecha: lotes[0]?.fecha ?? null,
      },
    };
  }

  // ─── Productores + agregados de compra (analítica de proveedores) ────
  static async producersWithStats(tenantId: string, filters: { search?: string; includeInactive?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const [producers, lotes] = await Promise.all([
      this.listProducers(tenantId, filters),
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", productorId: { not: null } },
        select: { productorId: true, pesoKg: true, totalPagado: true, fecha: true, grado: true },
      }),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    type Agg = { kg: number; pagado: number; lotes: number; lastFecha: Date | null; gradoI: number };
    const agg = new Map<string, Agg>();
    for (const l of lotes) {
      if (!l.productorId) continue;
      const a = agg.get(l.productorId) ?? { kg: 0, pagado: 0, lotes: 0, lastFecha: null, gradoI: 0 };
      a.kg += Number(l.pesoKg ?? 0); a.pagado += Number(l.totalPagado ?? 0); a.lotes++;
      if (l.grado === "I") a.gradoI++;
      const f = new Date(l.fecha);
      if (!a.lastFecha || f > a.lastFecha) a.lastFecha = f;
      agg.set(l.productorId, a);
    }
    const withStats = producers.map((p) => {
      const a = agg.get(p.id);
      return {
        ...p,
        stats: {
          kg: r2(a?.kg ?? 0), pagado: r2(a?.pagado ?? 0), lotes: a?.lotes ?? 0,
          lastFecha: a?.lastFecha ? a.lastFecha.toISOString() : null, gradoI: a?.gradoI ?? 0,
        },
      };
    });
    const totalKg = withStats.reduce((s, p) => s + p.stats.kg, 0);
    const totalPagado = withStats.reduce((s, p) => s + p.stats.pagado, 0);
    const conCompras = withStats.filter((p) => p.stats.lotes > 0).length;
    const top = [...withStats].filter((p) => p.stats.lotes > 0).sort((a, b) => b.stats.pagado - a.stats.pagado)[0];
    return {
      producers: withStats,
      summary: {
        total: producers.length,
        conCompras,
        totalKg: r2(totalKg),
        totalPagado: r2(totalPagado),
        top: top ? { nombre: top.nombre, kg: top.stats.kg, pagado: top.stats.pagado } : null,
      },
    };
  }

  // ─── Ficha de lote: detalle + beneficio vinculado ────────────────────
  static async loteDetail(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.cacaoLote.findFirst({ where: { id, tenantId } });
    if (!lote) return null;
    const [beneficio, producer] = await Promise.all([
      prisma.cacaoBeneficio.findFirst({
        where: { tenantId, loteId: id, deletedAt: null, status: "registrado" },
        orderBy: { createdAt: "desc" },
      }),
      lote.productorId ? prisma.cacaoProducer.findFirst({ where: { id: lote.productorId, tenantId }, select: { telefono: true } }) : Promise.resolve(null),
    ]);
    return { lote, beneficio, productorTelefono: producer?.telefono ?? null };
  }

  // ─── Trazabilidad pública por código de lote (QR) ───────────────────
  // Solo info de origen/calidad; NUNCA precios/pagos (es público).
  static async traceByCode(tenantId: string, code: string) {
    if (!tenantId || !code) return null;
    const lote = await prisma.cacaoLote.findFirst({
      where: { tenantId, loteCode: code, deletedAt: null, status: "registrado" },
      select: {
        id: true, loteCode: true, fecha: true, variedad: true, tipoGrano: true, grado: true,
        indiceFermentacion: true, humedadPct: true, productorId: true, productorNombre: true,
        pctBienFermentado: true, pctVioleta: true, pctPizarroso: true, pctMohoso: true,
      },
    });
    if (!lote) return null;
    const [producer, beneficio] = await Promise.all([
      lote.productorId ? prisma.cacaoProducer.findFirst({ where: { id: lote.productorId, tenantId }, select: { sector: true, certificacion: true, altitudMsnm: true } }) : Promise.resolve(null),
      prisma.cacaoBeneficio.findFirst({
        where: { tenantId, loteId: lote.id, deletedAt: null, status: "registrado" },
        orderBy: { createdAt: "desc" },
        select: { fermDias: true, secDias: true, metodoSecado: true, humedadFinal: true, tipoFermentador: true },
      }),
    ]);
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
      loteCode: lote.loteCode,
      fecha: lote.fecha.toISOString(),
      variedad: lote.variedad,
      tipoGrano: lote.tipoGrano,
      grado: lote.grado,
      indiceFermentacion: num(lote.indiceFermentacion),
      humedadPct: num(lote.humedadPct),
      productorNombre: lote.productorNombre,
      sector: producer?.sector ?? null,
      certificacion: producer?.certificacion ?? null,
      altitudMsnm: producer?.altitudMsnm ?? null,
      cut: { bien: num(lote.pctBienFermentado), violeta: num(lote.pctVioleta), pizarroso: num(lote.pctPizarroso), mohoso: num(lote.pctMohoso) },
      beneficio: beneficio ? {
        fermDias: beneficio.fermDias, secDias: beneficio.secDias, metodoSecado: beneficio.metodoSecado,
        humedadFinal: num(beneficio.humedadFinal), tipoFermentador: beneficio.tipoFermentador,
      } : null,
    };
  }

  // ─── Inventario de cacao seco + valorización + desgloses ─────────────
  static async inventory(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, beneficios, ventas] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { id: true, loteCode: true, tipoGrano: true, pesoKg: true, precioPorKg: true, premioPorKg: true, variedad: true, grado: true },
      }),
      prisma.cacaoBeneficio.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { loteId: true, loteCode: true, estado: true, pesoHumedoKg: true, pesoSecoKg: true, fermInicio: true, secInicio: true, createdAt: true },
      }),
      safeVenta(() => prisma.cacaoVenta.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { pesoKg: true, totalPen: true },
      }), [] as { pesoKg: Prisma.Decimal | null; totalPen: Prisma.Decimal | null }[]),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const loteById = new Map(lotes.map((l) => [l.id, l]));
    const lotesConBeneficio = new Set(beneficios.map((b) => b.loteId).filter(Boolean) as string[]);
    const now = Date.now();

    let kgSecoBeneficio = 0, kgSecoAcopiado = 0, kgHumedoProceso = 0, kgSecoProyectado = 0;
    let rendSum = 0, rendN = 0;
    const porVariedad: Record<string, number> = {};
    const porGrado: Record<string, number> = {};
    const addStock = (variedad: string | null, grado: string | null, kg: number) => {
      if (kg <= 0) return;
      const v = variedad || "—"; porVariedad[v] = r2((porVariedad[v] ?? 0) + kg);
      const g = grado || "sin_clasificar"; porGrado[g] = r2((porGrado[g] ?? 0) + kg);
    };
    const enProceso: { loteCode: string | null; estado: string; pesoHumedoKg: number; secoProyectado: number; diasEnProceso: number }[] = [];

    for (const b of beneficios) {
      const lote = b.loteId ? loteById.get(b.loteId) : null;
      if (b.estado === "terminado" && b.pesoSecoKg != null) {
        const kg = Number(b.pesoSecoKg);
        kgSecoBeneficio += kg;
        addStock(lote?.variedad ?? null, lote?.grado ?? null, kg);
      } else {
        const h = Number(b.pesoHumedoKg ?? 0);
        kgHumedoProceso += h;
        const proy = cacaoProyeccionSeco(h);
        kgSecoProyectado += proy;
        const start = b.fermInicio ?? b.secInicio ?? b.createdAt;
        enProceso.push({
          loteCode: b.loteCode ?? lote?.loteCode ?? null,
          estado: b.estado,
          pesoHumedoKg: r2(h),
          secoProyectado: r2(proy),
          diasEnProceso: start ? Math.max(0, Math.floor((now - new Date(start).getTime()) / 86400000)) : 0,
        });
      }
      const rend = cacaoRendimiento(b.pesoHumedoKg == null ? null : Number(b.pesoHumedoKg), b.pesoSecoKg == null ? null : Number(b.pesoSecoKg));
      if (rend != null) { rendSum += rend; rendN++; }
    }
    let kgSecoValBase = 0, valBase = 0;
    for (const l of lotes) {
      if (l.tipoGrano === "seco" && !lotesConBeneficio.has(l.id)) {
        const kg = Number(l.pesoKg ?? 0);
        kgSecoAcopiado += kg;
        addStock(l.variedad, l.grado, kg);
      }
      const peso = Number(l.pesoKg ?? 0);
      const precio = Number(l.precioPorKg ?? 0) + Number(l.premioPorKg ?? 0);
      if (peso > 0 && precio > 0) { kgSecoValBase += peso; valBase += peso * precio; }
    }
    const kgProducido = kgSecoBeneficio + kgSecoAcopiado;
    let kgVendido = 0, ingresosVenta = 0;
    for (const v of ventas) { kgVendido += Number(v.pesoKg ?? 0); ingresosVenta += Number(v.totalPen ?? 0); }
    const kgSecoDisponible = r2(Math.max(0, kgProducido - kgVendido));
    const precioRefProm = kgSecoValBase > 0 ? r2(valBase / kgSecoValBase) : 0;
    return {
      kgSecoDisponible,
      kgProducido: r2(kgProducido),
      kgVendido: r2(kgVendido),
      ingresosVenta: r2(ingresosVenta),
      kgSecoBeneficio: r2(kgSecoBeneficio),
      kgSecoAcopiado: r2(kgSecoAcopiado),
      kgHumedoProceso: r2(kgHumedoProceso),
      kgSecoProyectado: r2(kgSecoProyectado),
      precioRefProm,
      valorEstimado: r2(kgSecoDisponible * precioRefProm),
      rendimientoProm: rendN ? Math.round((rendSum / rendN) * 10) / 10 : null,
      lotesEnProceso: enProceso.length,
      porVariedad: Object.entries(porVariedad).map(([variedad, kg]) => ({ variedad, kg })).sort((a, b) => b.kg - a.kg),
      porGrado: Object.entries(porGrado).map(([grado, kg]) => ({ grado, kg })).sort((a, b) => b.kg - a.kg),
      enProceso: enProceso.sort((a, b) => b.diasEnProceso - a.diasEnProceso),
    };
  }

  // ─── Tendencias para el dashboard ────────────────────────────────────
  static async trends(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lotes = await prisma.cacaoLote.findMany({
      where: { tenantId, deletedAt: null, status: "registrado" },
      orderBy: { fecha: "asc" }, take: 2000,
      select: {
        fecha: true, pesoKg: true, totalPagado: true, productorId: true, productorNombre: true,
        humedadPct: true, loteCode: true, pctBienFermentado: true, pctVioleta: true, pctPizarroso: true, pctMohoso: true,
      },
    });
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const porMes: Record<string, { kg: number; valor: number }> = {};
    const porProductor: Record<string, { nombre: string; kg: number; pagado: number; lotes: number }> = {};
    let bienN = 0, bienSum = 0, vioSum = 0, pizSum = 0, mohSum = 0;
    const humedadFuera: { loteCode: string; humedadPct: number }[] = [];
    for (const l of lotes) {
      const d = new Date(l.fecha);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      porMes[key] = porMes[key] ?? { kg: 0, valor: 0 };
      porMes[key].kg = r2(porMes[key].kg + Number(l.pesoKg ?? 0));
      porMes[key].valor = r2(porMes[key].valor + Number(l.totalPagado ?? 0));
      const pk = l.productorId ?? l.productorNombre ?? "—";
      porProductor[pk] = porProductor[pk] ?? { nombre: l.productorNombre ?? "Sin nombre", kg: 0, pagado: 0, lotes: 0 };
      porProductor[pk].kg = r2(porProductor[pk].kg + Number(l.pesoKg ?? 0));
      porProductor[pk].pagado = r2(porProductor[pk].pagado + Number(l.totalPagado ?? 0));
      porProductor[pk].lotes++;
      if (l.pctBienFermentado != null || l.pctVioleta != null || l.pctPizarroso != null || l.pctMohoso != null) {
        bienN++;
        bienSum += Number(l.pctBienFermentado ?? 0); vioSum += Number(l.pctVioleta ?? 0);
        pizSum += Number(l.pctPizarroso ?? 0); mohSum += Number(l.pctMohoso ?? 0);
      }
      if (l.humedadPct != null && Number(l.humedadPct) > 7) humedadFuera.push({ loteCode: l.loteCode, humedadPct: Number(l.humedadPct) });
    }
    const meses = Object.entries(porMes).map(([mes, v]) => ({ mes, ...v })).slice(-12);
    const topProductores = Object.values(porProductor).sort((a, b) => b.pagado - a.pagado).slice(0, 8);
    return {
      meses,
      topProductores,
      calidad: bienN
        ? { bien: Math.round((bienSum / bienN) * 10) / 10, violeta: Math.round((vioSum / bienN) * 10) / 10, pizarroso: Math.round((pizSum / bienN) * 10) / 10, mohoso: Math.round((mohSum / bienN) * 10) / 10, muestras: bienN }
        : null,
      humedadFuera: humedadFuera.slice(0, 20),
      humedadFueraCount: humedadFuera.length,
    };
  }

  /**
   * Serie mensual del precio propio (S//kg): a cómo COMPRÉ (acopio: totalPagado/kg)
   * y a cómo VENDÍ (ventas: totalPen/kg). Últimos 12 meses con actividad. La serie
   * de venta degrada a vacío si la tabla CacaoVenta aún no existe (`safeVenta`).
   */
  static async precioHistorico(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, ventas] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        orderBy: { fecha: "asc" }, take: 3000,
        select: { fecha: true, pesoKg: true, totalPagado: true },
      }),
      safeVenta(() => prisma.cacaoVenta.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        orderBy: { fecha: "asc" }, take: 3000,
        select: { fecha: true, pesoKg: true, totalPen: true },
      }), [] as { fecha: Date; pesoKg: Prisma.Decimal | null; totalPen: Prisma.Decimal | null }[]),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const mk = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const acc = (rows: { fecha: Date; pesoKg: unknown; valor: unknown }[]) => {
      const m: Record<string, { kg: number; valor: number }> = {};
      for (const r of rows) {
        const k = mk(new Date(r.fecha));
        (m[k] ??= { kg: 0, valor: 0 });
        m[k].kg += Number(r.pesoKg ?? 0);
        m[k].valor += Number(r.valor ?? 0);
      }
      return m;
    };
    const compra = acc(lotes.map((l) => ({ fecha: l.fecha, pesoKg: l.pesoKg, valor: l.totalPagado })));
    const venta = acc(ventas.map((v) => ({ fecha: v.fecha, pesoKg: v.pesoKg, valor: v.totalPen })));
    const keys = Array.from(new Set([...Object.keys(compra), ...Object.keys(venta)])).sort().slice(-12);
    return keys.map((mes) => {
      const c = compra[mes], s = venta[mes];
      return {
        mes,
        precioCompra: c && c.kg > 0 ? r2(c.valor / c.kg) : null,
        precioVenta: s && s.kg > 0 ? r2(s.valor / s.kg) : null,
        kgCompra: c ? r2(c.kg) : 0,
        kgVenta: s ? r2(s.kg) : 0,
      };
    });
  }

  /** Precio de compra promedio del tenant (S//kg) sobre lotes SECOS — comparable
   *  con la referencia internacional en S//kg seco. Ponderado por peso. */
  static async avgBuyPrice(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lotes = await prisma.cacaoLote.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", tipoGrano: "seco" },
      select: { pesoKg: true, precioPorKg: true, premioPorKg: true, totalPagado: true },
    });
    let kg = 0, total = 0;
    for (const l of lotes) {
      const peso = Number(l.pesoKg ?? 0);
      const t = l.totalPagado != null ? Number(l.totalPagado) : peso * (Number(l.precioPorKg ?? 0) + Number(l.premioPorKg ?? 0));
      if (peso > 0 && t > 0) { kg += peso; total += t; }
    }
    return {
      kg: Math.round(kg * 100) / 100,
      avgPrecioPorKg: kg > 0 ? Math.round((total / kg) * 100) / 100 : null,
      lotes: lotes.length,
    };
  }

  // ─── Ventas de cacao seco (ADR-128 v3) ───────────────────────────────
  static async listVentas(tenantId: string, filters: { search?: string; includeAnnulled?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.CacaoVentaWhereInput = { tenantId, deletedAt: null };
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.search) where.OR = [
      { ventaCode: { contains: filters.search, mode: "insensitive" } },
      { compradorNombre: { contains: filters.search, mode: "insensitive" } },
    ];
    return safeVenta(() => prisma.cacaoVenta.findMany({ where, orderBy: { fecha: "desc" }, take: 500 }), []);
  }

  static async createVenta(tenantId: string, input: VentaInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!(prisma as { cacaoVenta?: unknown }).cacaoVenta) throw new Error("ventas_no_disponible");
    if (input.pesoKg == null || Number(input.pesoKg) <= 0) throw new Error("pesoKg must be > 0");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");
    const year = (input.fecha ?? new Date()).getUTCFullYear();
    const count = await prisma.cacaoVenta.count({ where: { tenantId, ventaCode: { startsWith: `V-${year}-` } } });
    const ventaCode = `V-${year}-${String(count + 1).padStart(3, "0")}`;
    const moneda = input.moneda === "USD" ? "USD" : "PEN";
    const totalPen = cacaoVentaTotalPen(Number(input.pesoKg), n(input.precioPorKg), moneda, n(input.tipoCambio));
    const venta = await prisma.cacaoVenta.create({
      data: {
        tenantId, ventaCode, fecha: input.fecha ?? new Date(),
        compradorNombre: input.compradorNombre?.trim() || null, canal: input.canal?.trim() || null,
        pesoKg: new Prisma.Decimal(input.pesoKg), moneda,
        precioPorKg: dec(input.precioPorKg), tipoCambio: moneda === "USD" ? dec(input.tipoCambio) : null,
        totalPen: dec(totalPen), esFob: !!input.esFob, variedad: input.variedad?.trim() || null,
        grado: input.grado?.trim() || null, observaciones: input.observaciones?.trim() || null,
        status: "registrado", createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return venta;
  }

  static async annulVenta(tenantId: string, id: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!(prisma as { cacaoVenta?: unknown }).cacaoVenta) throw new Error("ventas_no_disponible");
    const v = await prisma.cacaoVenta.update({
      where: { id, tenantId } satisfies Prisma.CacaoVentaWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason?.trim() || null },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return v;
  }

  static async ventasStats(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const ventas = await safeVenta(() => prisma.cacaoVenta.findMany({
      where: { tenantId, deletedAt: null, status: "registrado" },
      select: { pesoKg: true, totalPen: true, esFob: true },
    }), [] as { pesoKg: Prisma.Decimal | null; totalPen: Prisma.Decimal | null; esFob: boolean }[]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    let kg = 0, ingresos = 0, fob = 0;
    for (const v of ventas) { kg += Number(v.pesoKg ?? 0); ingresos += Number(v.totalPen ?? 0); if (v.esFob) fob++; }
    return {
      ventas: ventas.length,
      kgVendido: r2(kg),
      ingresos: r2(ingresos),
      precioVentaPromKg: kg > 0 ? r2(ingresos / kg) : 0,
      ventasFob: fob,
    };
  }
}
