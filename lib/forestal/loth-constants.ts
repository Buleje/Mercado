/**
 * Constantes compartidas del LO-TH (ADR-125), seguras para cliente y servidor.
 * NO importar nada de `lib/db/*` ni `@/lib/prisma` acá (server-only).
 */

export const LOTH_SECTIONS = [
  "tala",
  "trozado",
  "despacho_troza",
  "consumo_troza",
  "producto_terminado",
  "despacho_producto",
] as const;

export type LothSection = (typeof LOTH_SECTIONS)[number];

// ─── Fórmulas SERFOR (puras, testeables, sin deps) ─────────────────────────

/** Cubicación de troza (Smalian/SERFOR): 0.7854 × ((Ø mayor + Ø menor)/2)² × Longitud (m³). */
export function smalianVolume(diamMayorM: number, diamMenorM: number, lengthM: number): number {
  if (!(diamMayorM > 0) || !(diamMenorM > 0) || !(lengthM > 0)) return 0;
  const dProm = (diamMayorM + diamMenorM) / 2;
  return Math.round(0.7854 * dProm * dProm * lengthM * 10000) / 10000;
}

/** Volumen comercial del árbol en pie (SERFOR): 0.7854 × DAP² × Hc × ff. */
export function censusVolume(dapM: number, hcM: number, ff = 0.65): number {
  if (!(dapM > 0) || !(hcM > 0)) return 0;
  return Math.round(0.7854 * dapM * dapM * hcM * ff * 10000) / 10000;
}

export interface BalanceSpeciesInput {
  speciesCommon: string;
  cites: boolean;
  volumenAutorizadoM3: number;
  precioVentaSoles?: number | null;
  valorEstadoNaturalSoles?: number | null;
}
export interface BalanceMovement {
  section: string;
  speciesCommon: string | null;
  trozaCode: string | null;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
}
export interface BalanceRowOut {
  species: string; cites: boolean; autorizado: number; talado: number; movilizado: number;
  saldo: number; pctMovilizado: number; precioVenta: number; valorMovilizado: number;
  pagoDerecho: number; exceso: boolean;
}

/**
 * Balance de extracción puro (SERFOR): autorizado − movilizado(GTF) por especie.
 * - talado    = Σ volumen de Tala por especie
 * - movilizado = Σ volumen de trozas despachadas (resuelto vía Trozado) +
 *                Σ cantidad de producto terminado despachado en m³
 * - pago área  = 0.01% UIT × ha ; pago derecho especie = VEN × movilizado
 */
export function computeBalance(
  species: BalanceSpeciesInput[],
  movements: BalanceMovement[],
  opts: { uitRef?: number; areaHa?: number } = {},
): { rows: BalanceRowOut[]; pagoArea: number; pagoDerechoTotal: number; valorTotal: number } {
  const trozaMap = new Map<string, { species: string | null; vol: number }>();
  const talado: Record<string, number> = {};
  for (const e of movements) {
    if (e.section === "trozado" && e.trozaCode) {
      trozaMap.set(e.trozaCode, { species: e.speciesCommon, vol: Number(e.volumeM3 ?? 0) });
    }
    if (e.section === "tala" && e.speciesCommon) {
      talado[e.speciesCommon] = (talado[e.speciesCommon] ?? 0) + Number(e.volumeM3 ?? 0);
    }
  }
  const movilizado: Record<string, number> = {};
  for (const e of movements) {
    if (e.section === "despacho_troza" && e.trozaCode) {
      const t = trozaMap.get(e.trozaCode);
      if (t?.species) movilizado[t.species] = (movilizado[t.species] ?? 0) + t.vol;
    }
    if (e.section === "despacho_producto" && e.speciesCommon && e.unit === "m3") {
      movilizado[e.speciesCommon] = (movilizado[e.speciesCommon] ?? 0) + Number(e.quantity ?? 0);
    }
  }
  const uit = Number(opts.uitRef ?? 0);
  const area = Number(opts.areaHa ?? 0);
  const pagoArea = Math.round(0.0001 * uit * area * 100) / 100;

  let pagoDerechoTotal = pagoArea;
  let valorTotal = 0;
  const rows = species.map((s) => {
    const autorizado = Number(s.volumenAutorizadoM3);
    const mov = movilizado[s.speciesCommon] ?? 0;
    const tal = talado[s.speciesCommon] ?? 0;
    const saldo = Math.round((autorizado - mov) * 10000) / 10000;
    const precio = Number(s.precioVentaSoles ?? 0);
    const ven = Number(s.valorEstadoNaturalSoles ?? 0);
    const valorMovilizado = Math.round(mov * precio * 100) / 100;
    const pagoDerecho = Math.round(mov * ven * 100) / 100;
    valorTotal += valorMovilizado;
    pagoDerechoTotal += pagoDerecho;
    return {
      species: s.speciesCommon, cites: s.cites, autorizado,
      talado: Math.round(tal * 10000) / 10000, movilizado: Math.round(mov * 10000) / 10000,
      saldo, pctMovilizado: autorizado > 0 ? Math.round((mov / autorizado) * 1000) / 10 : 0,
      precioVenta: precio, valorMovilizado, pagoDerecho,
      exceso: tal > autorizado + 1e-6 || mov > autorizado + 1e-6,
    };
  });
  return { rows, pagoArea, pagoDerechoTotal: Math.round(pagoDerechoTotal * 100) / 100, valorTotal: Math.round(valorTotal * 100) / 100 };
}

// ─── Analítica de aprovechamiento (Batch 2 · frente C) ─────────────────────

export interface AprovResult {
  funnel: {
    taladoM3: number; trozadoM3: number; despachoTrozaM3: number;
    consumidoM3: number; productoCantidad: number; despachoProductoM3: number;
  };
  bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[];
  rendimientoGlobalPct: number; // trozado / talado (cuánto del árbol se aprovecha como troza)
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Aprovechamiento bosque→producto a partir de los movimientos del LO-TH.
 * - talado     = Σ volumen sección Tala por especie
 * - trozado    = Σ volumen sección Trozado por especie
 * - rendimiento= trozado / talado (× especie y global)
 * - merma      = talado − trozado (tocón, copa, despuntes)
 */
export function computeAprovechamiento(movements: BalanceMovement[]): AprovResult {
  const trozaMap = new Map<string, number>(); // trozaCode → vol (de Trozado)
  const tal: Record<string, number> = {};
  const troz: Record<string, number> = {};
  const cites: Record<string, boolean> = {};
  let consumidoM3 = 0, productoCantidad = 0, despachoProductoM3 = 0;

  for (const e of movements) {
    if (e.section === "trozado" && e.trozaCode) trozaMap.set(e.trozaCode, Number(e.volumeM3 ?? 0));
    if (e.section === "tala" && e.speciesCommon) tal[e.speciesCommon] = (tal[e.speciesCommon] ?? 0) + Number(e.volumeM3 ?? 0);
    if (e.section === "trozado" && e.speciesCommon) troz[e.speciesCommon] = (troz[e.speciesCommon] ?? 0) + Number(e.volumeM3 ?? 0);
    if (e.section === "consumo_troza") consumidoM3 += Number(e.volumeM3 ?? 0);
    if (e.section === "producto_terminado") productoCantidad += Number(e.quantity ?? 0);
    if (e.section === "despacho_producto" && e.unit === "m3") despachoProductoM3 += Number(e.quantity ?? 0);
  }
  let despachoTrozaM3 = 0;
  for (const e of movements) {
    if (e.section === "despacho_troza" && e.trozaCode) despachoTrozaM3 += trozaMap.get(e.trozaCode) ?? 0;
  }
  const allSpecies = new Set([...Object.keys(tal), ...Object.keys(troz)]);
  const bySpecies = [...allSpecies].map((sp) => {
    const t = tal[sp] ?? 0, tz = troz[sp] ?? 0;
    return { species: sp, cites: cites[sp] ?? false, taladoM3: r4(t), trozadoM3: r4(tz), rendimientoPct: t > 0 ? r1((tz / t) * 100) : 0, mermaM3: r4(Math.max(0, t - tz)) };
  }).sort((a, b) => b.taladoM3 - a.taladoM3);

  const taladoTotal = Object.values(tal).reduce((a, b) => a + b, 0);
  const trozadoTotal = Object.values(troz).reduce((a, b) => a + b, 0);
  return {
    funnel: {
      taladoM3: r4(taladoTotal), trozadoM3: r4(trozadoTotal), despachoTrozaM3: r4(despachoTrozaM3),
      consumidoM3: r4(consumidoM3), productoCantidad: r4(productoCantidad), despachoProductoM3: r4(despachoProductoM3),
    },
    bySpecies,
    rendimientoGlobalPct: taladoTotal > 0 ? r1((trozadoTotal / taladoTotal) * 100) : 0,
  };
}

export interface Anomaly { level: "error" | "warn"; code: string; message: string; species?: string }

/**
 * Detecta inconsistencias en el libro (defensa ante fiscalización):
 *  - trozado > talado (imposible: no se troza más de lo tumbado)
 *  - producto despachado en m³ > materia prima consumida (rendimiento >100%)
 *  - movilizado > autorizado (exceso de aprovechamiento — grave)
 *  - saldo < 10% del autorizado (alerta de agotamiento)
 *  - troza despachada sin registro previo de trozado
 *  - líneas registradas fuera del plazo de 15 días
 */
export function detectAnomalias(
  movements: BalanceMovement[],
  balanceRows: { species: string; autorizado: number; movilizado: number; saldo: number; exceso: boolean }[] = [],
  lateCount = 0,
): Anomaly[] {
  const out: Anomaly[] = [];
  const aprov = computeAprovechamiento(movements);
  for (const s of aprov.bySpecies) {
    if (s.trozadoM3 > s.taladoM3 + 1e-4) {
      out.push({ level: "error", code: "trozado_gt_talado", species: s.species, message: `Trozado (${s.trozadoM3} m³) supera lo talado (${s.taladoM3} m³). Revisá la captura.` });
    }
  }
  if (aprov.funnel.despachoProductoM3 > aprov.funnel.consumidoM3 + 1e-4 && aprov.funnel.consumidoM3 > 0) {
    out.push({ level: "error", code: "rend_aserrio_imposible", message: `Producto despachado (${aprov.funnel.despachoProductoM3} m³) supera la materia prima consumida (${aprov.funnel.consumidoM3} m³).` });
  }
  for (const b of balanceRows) {
    if (b.exceso) out.push({ level: "error", code: "exceso_autorizado", species: b.species, message: `Movilizado (${b.movilizado} m³) supera el volumen autorizado (${b.autorizado} m³) de ${b.species}.` });
    else if (b.autorizado > 0 && b.saldo > 0 && b.saldo < b.autorizado * 0.1) {
      out.push({ level: "warn", code: "saldo_bajo", species: b.species, message: `Queda solo ${b.saldo} m³ de ${b.species} (${r1((b.saldo / b.autorizado) * 100)}% del autorizado).` });
    }
  }
  const trozas = new Set(movements.filter((e) => e.section === "trozado").map((e) => e.trozaCode));
  for (const e of movements) {
    if (e.section === "despacho_troza" && e.trozaCode && !trozas.has(e.trozaCode)) {
      out.push({ level: "warn", code: "troza_fantasma", message: `Troza ${e.trozaCode} despachada sin registro de trozado.` });
    }
  }
  if (lateCount > 0) out.push({ level: "warn", code: "fuera_de_plazo", message: `${lateCount} línea(s) registrada(s) fuera del plazo de 15 días.` });
  return out;
}

export interface SaldoProjection { ritmoDiaM3: number; diasParaAgotar: number; fechaAgotamientoISO: string | null }

/** Proyección de agotamiento del saldo según el ritmo histórico de movilización. */
export function projectSaldo(saldoM3: number, movilizadoM3: number, firstActivityISO: string | null, nowISO: string): SaldoProjection | null {
  if (!firstActivityISO || movilizadoM3 <= 0 || saldoM3 <= 0) return null;
  const dias = Math.max(1, (new Date(nowISO).getTime() - new Date(firstActivityISO).getTime()) / 86_400_000);
  const ritmoDiaM3 = movilizadoM3 / dias;
  if (ritmoDiaM3 <= 0) return null;
  const diasParaAgotar = Math.round(saldoM3 / ritmoDiaM3);
  const fecha = new Date(new Date(nowISO).getTime() + diasParaAgotar * 86_400_000);
  return { ritmoDiaM3: Math.round(ritmoDiaM3 * 10000) / 10000, diasParaAgotar, fechaAgotamientoISO: fecha.toISOString() };
}

// ─── Costeo y margen por m³ (Batch 3 · frente D) ───────────────────────────

export interface CosteoSpeciesInput { species: string; cites?: boolean; movilizadoM3: number; precioVentaM3: number; venM3: number }
export interface CosteoParams { extraccionM3: number; transformacionM3: number; fleteM3: number }
export interface CosteoRow {
  species: string; cites: boolean; movilizadoM3: number;
  precioVentaM3: number; costoTotalM3: number; margenM3: number; margenPct: number;
  ingreso: number; costo: number; margen: number;
  desglose: { venM3: number; extraccionM3: number; transformacionM3: number; fleteM3: number };
}

/**
 * Costeo bosque→venta por especie (S//m³). Margen = precio venta − (derecho VEN +
 * extracción + transformación + flete). Multiplica por lo movilizado para el total.
 */
export function computeCosteo(rows: CosteoSpeciesInput[], params: CosteoParams): {
  rows: CosteoRow[]; ingresoTotal: number; costoTotal: number; margenTotal: number; margenPctTotal: number; costoOperativoM3: number;
} {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const op = Number(params.extraccionM3 || 0) + Number(params.transformacionM3 || 0) + Number(params.fleteM3 || 0);
  let ingresoTotal = 0, costoTotal = 0, margenTotal = 0;
  const out = rows.map((s) => {
    const costoTotalM3 = s.venM3 + op;
    const margenM3 = s.precioVentaM3 - costoTotalM3;
    const ingreso = s.precioVentaM3 * s.movilizadoM3;
    const costo = costoTotalM3 * s.movilizadoM3;
    const margen = margenM3 * s.movilizadoM3;
    ingresoTotal += ingreso; costoTotal += costo; margenTotal += margen;
    return {
      species: s.species, cites: s.cites ?? false, movilizadoM3: r2(s.movilizadoM3),
      precioVentaM3: r2(s.precioVentaM3), costoTotalM3: r2(costoTotalM3), margenM3: r2(margenM3),
      margenPct: s.precioVentaM3 > 0 ? Math.round((margenM3 / s.precioVentaM3) * 1000) / 10 : 0,
      ingreso: r2(ingreso), costo: r2(costo), margen: r2(margen),
      desglose: { venM3: r2(s.venM3), extraccionM3: r2(Number(params.extraccionM3 || 0)), transformacionM3: r2(Number(params.transformacionM3 || 0)), fleteM3: r2(Number(params.fleteM3 || 0)) },
    };
  });
  return {
    rows: out, ingresoTotal: r2(ingresoTotal), costoTotal: r2(costoTotal), margenTotal: r2(margenTotal),
    margenPctTotal: ingresoTotal > 0 ? Math.round((margenTotal / ingresoTotal) * 1000) / 10 : 0,
    costoOperativoM3: r2(op),
  };
}

/** DTO de una entrada del LO-TH tal como la devuelve la API (Decimals → string). */
export interface LothEntryDTO {
  id: string;
  section: LothSection;
  lineNo: number;
  entryDate: string;
  treeCode: string | null;
  trozaCode: string | null;
  despachoCode: string | null;
  isRama: boolean;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  diamMayorM: string | null;
  diamMenorM: string | null;
  lengthM: string | null;
  volumeM3: string | null;
  productType: string | null;
  quantity: string | null;
  unit: string | null;
  pieces: number | null;
  gtfNumber: string | null;
  discarded: boolean;
  consumoInterno: boolean;
  observations: string | null;
  status: "registrado" | "anulado";
  annulledReason: string | null;
  gpsLat: string | null;
  gpsLng: string | null;
  photoUrl: string | null;
}
