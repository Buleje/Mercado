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

// ─── Plazo de registro (SINGLE SOURCE) ─────────────────────────────────────

/**
 * Plazo de registro en el LO-TH: 15 días CALENDARIO desde la actividad
 * (`entryDate`) hasta el registro (`createdAt`).
 *
 * ✅ VERIFICADO 2026-07-20 contra la Guía oficial SERFOR ("Guía para el Registro
 * de Información", 2021, 64 pp — firecrawl del PDF, NO de memoria): «El registro
 * de información en las secciones de tala, trozado, despacho de trozas, consumo de
 * trozas, producto terminado y despacho de producto terminado, se debe realizar
 * dentro de los 15 días CALENDARIO una vez realizada la actividad». Es DISTINTO
 * del LO-CTP (2 días HÁBILES, RDE D000025-2023) — son libros y normas distintas,
 * es correcto que difieran. NO cambiar sin re-verificar (skill serfor-osinfor §7).
 *
 * Este es el ÚNICO lugar donde vive el predicado: el badge del libro, la
 * analítica (`detectAnomalias`), el export Excel y el PDF lo importan de acá para
 * que nunca puedan divergir (antes el `15` estaba copiado en 5 archivos).
 */
export const PLAZO_REGISTRO_DIAS = 15;

/** Días entre la actividad y su registro (calendario). null si falta una fecha. */
export function diasDeRegistro(
  entryDate: Date | string | null | undefined,
  createdAt: Date | string | null | undefined,
): number | null {
  if (!entryDate || !createdAt) return null;
  const act = new Date(entryDate).getTime();
  const reg = new Date(createdAt).getTime();
  if (!act || !reg) return null;
  return Math.max(0, Math.floor((reg - act) / 86_400_000));
}

/** ¿La línea se registró fuera del plazo SERFOR? */
export function estaFueraDePlazo(
  entryDate: Date | string | null | undefined,
  createdAt: Date | string | null | undefined,
): boolean {
  const d = diasDeRegistro(entryDate, createdAt);
  return d != null && d > PLAZO_REGISTRO_DIAS;
}

// ─── Nombre de especie: UNA clave para cruzar plan y libro ─────────────────

/**
 * Clave canónica de una especie.
 *
 * El plan de manejo copia el nombre como figura en la resolución —«Tornillo
 * (Cedrelinga catenaeformis)»— y el libro registra el nombre común solo
 * —«Tornillo»—, con el científico en su propio campo. Cruzarlos por igualdad de
 * string hacía que **nunca** coincidieran, y eso no daba un error: daba una
 * infracción falsa («especie fuera del plan»), un saldo POA intacto habiendo
 * talado, y una rentabilidad en cero.
 *
 * Se queda con el nombre común: sin lo que va entre paréntesis, sin tildes, sin
 * dobles espacios y en minúscula.
 */
export function claveEspecie(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .replace(/\([^)]*\)/g, " ") // el científico entre paréntesis no identifica
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ¿Son la misma especie, escritas distinto? */
export const mismaEspecie = (a: string | null | undefined, b: string | null | undefined): boolean =>
  claveEspecie(a) !== "" && claveEspecie(a) === claveEspecie(b);

export interface CruceEspecies {
  /** clave → nombre tal como lo declara el plan. */
  autorizadas: Map<string, string>;
  /** Especies del libro que no están en el plan **ni se parecen** a ninguna. */
  sinAutorizar: string[];
  /**
   * Se parecen pero no son iguales: comparten la primera palabra. Casi siempre
   * es nomenclatura («Cedro» vs «Cedro rojo»), no una infracción — así que se
   * avisa, no se acusa.
   */
  ambiguas: { libro: string; plan: string }[];
}

/**
 * Cruza las especies que aparecen en el libro contra las autorizadas del plan.
 * Distingue tres casos en vez de dos, porque «no la encontré» y «está escrita
 * distinto» tienen consecuencias legales muy diferentes.
 */
export function cruzarEspecies(delLibro: string[], delPlan: string[]): CruceEspecies {
  const autorizadas = new Map<string, string>();
  for (const p of delPlan) {
    const k = claveEspecie(p);
    if (k) autorizadas.set(k, p);
  }

  const sinAutorizar: string[] = [];
  const ambiguas: { libro: string; plan: string }[] = [];
  const vistas = new Set<string>();

  for (const nombre of delLibro) {
    const k = claveEspecie(nombre);
    if (!k || vistas.has(k) || autorizadas.has(k)) {
      vistas.add(k);
      continue;
    }
    vistas.add(k);
    const primera = k.split(" ")[0];
    const parecida = [...autorizadas.entries()].find(([kp]) => kp.split(" ")[0] === primera);
    if (parecida) ambiguas.push({ libro: nombre, plan: parecida[1] });
    else sinAutorizar.push(nombre);
  }

  return { autorizadas, sinAutorizar, ambiguas };
}

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
): {
  rows: BalanceRowOut[];
  /**
   * Lo movilizado de especies que el POA **no** autoriza. Va aparte porque
   * `rows` recorre las especies del plan: sin esta lista, mover una especie no
   * autorizada no aparecía en ninguna fila y el saldo se leía impecable —
   * cuanto más grave la infracción, más limpio se veía el tablero.
   */
  fueraDePlan: { species: string; movilizadoM3: number }[];
  pagoArea: number;
  pagoDerechoTotal: number;
  valorTotal: number;
} {
  // Todo se acumula por CLAVE de especie: el plan escribe «Tornillo (Cedrelinga
  // catenaeformis)» y el libro «Tornillo». Cruzarlos por string exacto dejaba el
  // saldo intacto habiendo talado, que es el peor error posible acá.
  const trozaMap = new Map<string, { species: string | null; vol: number }>();
  const talado: Record<string, number> = {};
  const nombreDe: Record<string, string> = {}; // clave → primer nombre visto
  const recordar = (sp: string) => {
    const k = claveEspecie(sp);
    if (k && !nombreDe[k]) nombreDe[k] = sp.trim();
    return k;
  };
  for (const e of movements) {
    if (e.section === "trozado" && e.trozaCode) {
      trozaMap.set(e.trozaCode, { species: e.speciesCommon, vol: Number(e.volumeM3 ?? 0) });
    }
    if (e.section === "tala" && e.speciesCommon) {
      const k = recordar(e.speciesCommon);
      if (k) talado[k] = (talado[k] ?? 0) + Number(e.volumeM3 ?? 0);
    }
  }
  const movilizado: Record<string, number> = {};
  for (const e of movements) {
    if (e.section === "despacho_troza" && e.trozaCode) {
      const t = trozaMap.get(e.trozaCode);
      if (t?.species) {
        const k = recordar(t.species);
        if (k) movilizado[k] = (movilizado[k] ?? 0) + t.vol;
      }
    }
    if (e.section === "despacho_producto" && e.speciesCommon && e.unit === "m3") {
      const k = recordar(e.speciesCommon);
      if (k) movilizado[k] = (movilizado[k] ?? 0) + Number(e.quantity ?? 0);
    }
  }
  const uit = Number(opts.uitRef ?? 0);
  const area = Number(opts.areaHa ?? 0);
  const pagoArea = Math.round(0.0001 * uit * area * 100) / 100;

  let pagoDerechoTotal = pagoArea;
  let valorTotal = 0;
  const rows = species.map((s) => {
    const clave = claveEspecie(s.speciesCommon);
    const autorizado = Number(s.volumenAutorizadoM3);
    const mov = movilizado[clave] ?? 0;
    const tal = talado[clave] ?? 0;
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
  const autorizadas = new Set(species.map((s) => claveEspecie(s.speciesCommon)));
  const fueraDePlan = Object.entries(movilizado)
    .filter(([k, vol]) => !autorizadas.has(k) && vol > 1e-6)
    .map(([k, vol]) => ({ species: nombreDe[k] ?? k, movilizadoM3: Math.round(vol * 10000) / 10000 }))
    .sort((a, b) => b.movilizadoM3 - a.movilizadoM3);

  return {
    rows,
    fueraDePlan,
    pagoArea,
    pagoDerechoTotal: Math.round(pagoDerechoTotal * 100) / 100,
    valorTotal: Math.round(valorTotal * 100) / 100,
  };
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
  if (lateCount > 0) out.push({ level: "warn", code: "fuera_de_plazo", message: `${lateCount} línea(s) registrada(s) fuera del plazo de ${PLAZO_REGISTRO_DIAS} días.` });
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
  /**
   * Cuándo se ASENTÓ la línea en el libro (≠ `entryDate`, que es cuándo pasó la
   * actividad). La API ya lo devuelve —`ForestLothDB.list` no filtra columnas—;
   * acá se declara opcional porque los fixtures viejos no lo traen. Sin este
   * campo no hay forma de ver el plazo de registro de 15 días (RDE 264-2019),
   * que es lo primero que revisa una fiscalización.
   */
  createdAt?: string | null;
  /** Quién asentó la línea. Viaja en el JSON; hace falta para auditar el libro. */
  createdBy?: string | null;
  /** Subsanación SERFOR: esta línea corrige a la N° tal (la vieja NO se borra). */
  correctsLineNo?: number | null;
  correctionNote?: string | null;
}
