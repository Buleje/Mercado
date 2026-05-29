/**
 * CacaoDB — Acopio & Beneficio de Cacao (ADR-128).
 * Patrón Buleje: tenantId 1er param · cache invalidate · sin fallback de tenant.
 * Calidad/liquidación delegadas a funciones puras de `lib/cacao/cacao-quality`.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { cacaoFermentationIndex, cacaoGrade, cacaoLiquidacion, cacaoMerma, cacaoProyeccionSeco, cacaoRendimiento } from "@/lib/cacao/cacao-quality";

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

export interface BeneficioInput {
  loteId?: string | null; loteCode?: string | null;
  fermInicio?: Date | null; fermDias?: number | null; fermVolteos?: number | null;
  fermTempMaxC?: number | string | null; tipoFermentador?: string | null;
  secInicio?: Date | null; secDias?: number | null; metodoSecado?: string | null;
  humedadInicial?: number | string | null; humedadFinal?: number | string | null;
  pesoHumedoKg?: number | string | null; pesoSecoKg?: number | string | null;
  estado?: string; observaciones?: string | null; createdBy: string;
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

  // ─── Ficha de lote: detalle + beneficio vinculado ────────────────────
  static async loteDetail(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.cacaoLote.findFirst({ where: { id, tenantId } });
    if (!lote) return null;
    const beneficio = await prisma.cacaoBeneficio.findFirst({
      where: { tenantId, loteId: id, deletedAt: null, status: "registrado" },
      orderBy: { createdAt: "desc" },
    });
    return { lote, beneficio };
  }

  // ─── Inventario de cacao seco + valorización ─────────────────────────
  static async inventory(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [lotes, beneficios] = await Promise.all([
      prisma.cacaoLote.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { id: true, tipoGrano: true, pesoKg: true, precioPorKg: true, premioPorKg: true, totalPagado: true },
      }),
      prisma.cacaoBeneficio.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: { loteId: true, estado: true, pesoHumedoKg: true, pesoSecoKg: true },
      }),
    ]);
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const lotesConBeneficio = new Set(beneficios.map((b) => b.loteId).filter(Boolean) as string[]);

    // Seco terminado del beneficio + lotes acopiados ya secos (sin beneficio, evita doble conteo)
    let kgSecoBeneficio = 0, kgSecoAcopiado = 0, kgHumedoProceso = 0, kgSecoProyectado = 0;
    let rendSum = 0, rendN = 0;
    for (const b of beneficios) {
      if (b.estado === "terminado" && b.pesoSecoKg != null) kgSecoBeneficio += Number(b.pesoSecoKg);
      else {
        const h = Number(b.pesoHumedoKg ?? 0);
        kgHumedoProceso += h;
        kgSecoProyectado += cacaoProyeccionSeco(h);
      }
      const rend = cacaoRendimiento(b.pesoHumedoKg == null ? null : Number(b.pesoHumedoKg), b.pesoSecoKg == null ? null : Number(b.pesoSecoKg));
      if (rend != null) { rendSum += rend; rendN++; }
    }
    let kgSecoValBase = 0, valBase = 0;
    for (const l of lotes) {
      if (l.tipoGrano === "seco" && !lotesConBeneficio.has(l.id)) {
        kgSecoAcopiado += Number(l.pesoKg ?? 0);
      }
      // precio ponderado de referencia (a costo de acopio)
      const peso = Number(l.pesoKg ?? 0);
      const precio = Number(l.precioPorKg ?? 0) + Number(l.premioPorKg ?? 0);
      if (peso > 0 && precio > 0) { kgSecoValBase += peso; valBase += peso * precio; }
    }
    const kgSecoDisponible = r2(kgSecoBeneficio + kgSecoAcopiado);
    const precioRefProm = kgSecoValBase > 0 ? r2(valBase / kgSecoValBase) : 0;
    return {
      kgSecoDisponible,
      kgSecoBeneficio: r2(kgSecoBeneficio),
      kgSecoAcopiado: r2(kgSecoAcopiado),
      kgHumedoProceso: r2(kgHumedoProceso),
      kgSecoProyectado: r2(kgSecoProyectado),
      precioRefProm,
      valorEstimado: r2(kgSecoDisponible * precioRefProm),
      rendimientoProm: rendN ? Math.round((rendSum / rendN) * 10) / 10 : null,
      lotesEnProceso: beneficios.filter((b) => b.estado !== "terminado").length,
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
}
