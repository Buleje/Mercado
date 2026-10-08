/**
 * rendimiento-especie — el rendimiento del aserradero por especie y por
 * corrida, con el rango PROPIO de cada especie aprendido del histórico.
 * PURO y client-safe; lo arma la ruta `GET /api/admin/forestal/ctp/rendimiento`
 * y lo usa el simulador en el navegador.
 *
 * Por qué por especie y no contra «40-65 % del aserrío peruano»: la sierra
 * rinde distinto con tornillo que con capirona, y lo que el dueño quiere saber
 * es si ESTA corrida de tornillo salió peor que sus otras corridas de tornillo.
 *
 * Tres reglas:
 *   1. **Una corrida en proceso no enseña ni se juzga.** Si su lote tiene
 *      `finProceso` después de hoy, la salida todavía no es toda (Blas: 5 de 5
 *      con fin 01-11): su porcentaje es parcial, no entra al rango y no se
 *      marca «bajo».
 *   2. **Con pocas corridas, se dice.** Debajo de `MIN_CORRIDAS_RANGO` el rango
 *      es provisional (lo visto ± `HOLGURA_PROVISIONAL_PTS`) y la pantalla lo
 *      escribe: «3 corridas: rango provisional».
 *   3. **Una corrida se compara contra las OTRAS de su especie** (sin ella
 *      misma): con dos corridas, incluirla haría que nunca quede fuera.
 */
import { PT_POR_M3 } from "./cubicacion";
import { agregarRendimientoPlata, type RendimientoPlata } from "./rendimiento-plata";
import { rendimientoDeCorrida } from "./vincular-produccion";

/** Corridas terminadas de la especie a partir de las cuales el rango deja de ser provisional. */
export const MIN_CORRIDAS_RANGO = 5;
/** Holgura del rango provisional, en puntos, a cada lado de lo visto. */
export const HOLGURA_PROVISIONAL_PTS = 5;
/** Corridas terminadas mínimas para hablar de tendencia. */
export const MIN_CORRIDAS_TENDENCIA = 3;
/** Pendiente (puntos por corrida) debajo de la cual la especie está «estable». */
export const PENDIENTE_ESTABLE_PTS = 1;
/** Referencia general cuando la especie no tiene corridas terminadas: aserrío normal 40-65 %, meta 56 %. */
export const RANGO_REFERENCIA = { min: 40, centro: 56, max: 65 } as const;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export interface CorridaRendimiento {
  id: string;
  lineNo: number;
  /** `AAAA-MM-DD` (date-only). */
  fecha: string;
  especie: string;
  /** Código del lote de aserrío (LA-2026-001), si lo hay. */
  lote: string | null;
  m3Entrada: number;
  m3Salida: number;
  unidad: string;
  /** El del libro (`rendimientoDeCorrida`); null si no se puede (PT, sin entrada…). */
  rendimientoPct: number | null;
  /** `AAAA-MM-DD` del fin de proceso del lote. */
  finProceso: string | null;
  parcial: boolean;
}

export interface RangoPropio {
  min: number;
  max: number;
  /** Corridas terminadas con las que se aprendió. */
  corridas: number;
  provisional: boolean;
}

export type SentidoTendencia = "sube" | "baja" | "estable";
export interface Tendencia {
  sentido: SentidoTendencia;
  /** Puntos de rendimiento que gana (o pierde) por corrida. */
  ptsPorCorrida: number;
}

export interface ResumenEspecie {
  especie: string;
  corridas: number;
  terminadas: number;
  enProceso: number;
  m3Entrada: number;
  m3Salida: number;
  /** Ponderado de TODAS (como la cabecera del libro): parcial si hay alguna en proceso. */
  ponderadoPct: number | null;
  /** Ponderado sólo de las terminadas: el que usa el simulador. */
  ponderadoTerminadasPct: number | null;
  rango: RangoPropio | null;
  tendencia: Tendencia | null;
  /** Los % de las corridas en orden de fecha (para el gráfico), parciales incluidas y marcadas. */
  serie: { fecha: string; pct: number; parcial: boolean; id: string }[];
  /** El fin de proceso más lejano de las que siguen en proceso. */
  finProceso: string | null;
}

export type EstadoCorrida = "parcial" | "bajo_lo_suyo" | "en_rango" | "sobre_lo_suyo" | "sin_rango" | "sin_dato";

/** Percentil con interpolación lineal (valores ya ordenados). */
function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0];
  const i = (ordenados.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo);
}

/**
 * El rango propio de una especie. Con `MIN_CORRIDAS_RANGO` o más: del
 * percentil 10 al 90 (una corrida rara no lo ensancha). Con menos: lo visto ±
 * la holgura, rotulado provisional. Sin corridas: null.
 */
export function rangoPropio(valores: readonly number[]): RangoPropio | null {
  const v = valores.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  if (v.length >= MIN_CORRIDAS_RANGO) {
    return { min: r1(percentil(v, 0.1)), max: r1(percentil(v, 0.9)), corridas: v.length, provisional: false };
  }
  return {
    min: r1(Math.max(0, v[0] - HOLGURA_PROVISIONAL_PTS)),
    max: r1(Math.min(100, v[v.length - 1] + HOLGURA_PROVISIONAL_PTS)),
    corridas: v.length,
    provisional: true,
  };
}

/** Pendiente por mínimos cuadrados sobre el orden de las corridas. */
export function tendencia(valoresEnOrden: readonly number[]): Tendencia | null {
  const v = valoresEnOrden.filter((n) => Number.isFinite(n));
  if (v.length < MIN_CORRIDAS_TENDENCIA) return null;
  const n = v.length;
  const mx = (n - 1) / 2;
  const my = v.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  v.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const pendiente = den > 0 ? num / den : 0;
  const sentido: SentidoTendencia = Math.abs(pendiente) < PENDIENTE_ESTABLE_PTS ? "estable" : pendiente > 0 ? "sube" : "baja";
  return { sentido, ptsPorCorrida: r1(pendiente) };
}

const ordenFecha = (a: CorridaRendimiento, b: CorridaRendimiento) => a.fecha.localeCompare(b.fecha) || a.lineNo - b.lineNo;
const terminadaConDato = (c: CorridaRendimiento) => !c.parcial && c.rendimientoPct != null;

/** Ponderado m³/m³ de un grupo; sólo cuentan las corridas en m³ con entrada y salida. */
function ponderado(cs: readonly CorridaRendimiento[]): { entrada: number; salida: number; pct: number | null } {
  const validas = cs.filter((c) => c.rendimientoPct != null);
  const entrada = r4(validas.reduce((a, c) => a + c.m3Entrada, 0));
  const salida = r4(validas.reduce((a, c) => a + c.m3Salida, 0));
  return { entrada, salida, pct: rendimientoDeCorrida(salida, entrada, "m3") };
}

/** Resumen por especie, de la de más madera a la de menos. */
export function resumenPorEspecie(corridas: readonly CorridaRendimiento[]): ResumenEspecie[] {
  const grupos = new Map<string, CorridaRendimiento[]>();
  for (const c of corridas) {
    const k = c.especie.trim() || "Sin especie";
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.entries()]
    .map(([especie, cs]) => {
      const orden = [...cs].sort(ordenFecha);
      const terminadas = orden.filter(terminadaConDato);
      const todas = ponderado(orden);
      const enProceso = orden.filter((c) => c.parcial);
      const fines = enProceso.map((c) => c.finProceso).filter((f): f is string => !!f).sort();
      return {
        especie,
        corridas: orden.length,
        terminadas: terminadas.length,
        enProceso: enProceso.length,
        m3Entrada: todas.entrada,
        m3Salida: todas.salida,
        ponderadoPct: todas.pct,
        ponderadoTerminadasPct: ponderado(terminadas).pct,
        rango: rangoPropio(terminadas.map((c) => c.rendimientoPct as number)),
        tendencia: tendencia(terminadas.map((c) => c.rendimientoPct as number)),
        serie: orden
          .filter((c) => c.rendimientoPct != null)
          .map((c) => ({ fecha: c.fecha, pct: c.rendimientoPct as number, parcial: c.parcial, id: c.id })),
        finProceso: fines.length > 0 ? fines[fines.length - 1] : null,
      };
    })
    .sort((a, b) => b.m3Entrada - a.m3Entrada || a.especie.localeCompare(b.especie));
}

/**
 * Cómo salió UNA corrida contra las otras terminadas de su especie. El rango
 * se aprende SIN ella: con dos corridas, contarla haría que nunca quede fuera.
 */
export function estadoCorrida(
  c: CorridaRendimiento,
  todas: readonly CorridaRendimiento[],
): { estado: EstadoCorrida; rango: RangoPropio | null } {
  if (c.parcial) return { estado: "parcial", rango: null };
  if (c.rendimientoPct == null) return { estado: "sin_dato", rango: null };
  const clave = c.especie.trim() || "Sin especie";
  const otras = todas.filter((o) => o.id !== c.id && (o.especie.trim() || "Sin especie") === clave && terminadaConDato(o));
  const rango = rangoPropio(otras.map((o) => o.rendimientoPct as number));
  if (!rango) return { estado: "sin_rango", rango: null };
  if (c.rendimientoPct < rango.min) return { estado: "bajo_lo_suyo", rango };
  if (c.rendimientoPct > rango.max) return { estado: "sobre_lo_suyo", rango };
  return { estado: "en_rango", rango };
}

// ── Simulador ──────────────────────────────────────────────────────────────

export type FuenteSimulacion = "propio" | "provisional" | "referencia";

export interface FilaSimulacion {
  especie: string;
  m3: number;
  trozas: number;
  pct: number;
  pctMin: number;
  pctMax: number;
  fuente: FuenteSimulacion;
  /** Corridas terminadas de la especie que respaldan el número. */
  corridas: number;
  ptEsperado: number;
  ptMin: number;
  ptMax: number;
}

const claveEsp = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Del lote de rolliza (m³ por especie) al PT aserrado esperado: con el
 * ponderado de las corridas TERMINADAS de cada especie y su rango; si la
 * especie no tiene ninguna, con la referencia general — rotulada como tal.
 * Es una vista previa: no se guarda.
 */
export function simularAserrado(
  entradas: ReadonlyArray<{ especie: string; m3: number; trozas?: number }>,
  especies: readonly ResumenEspecie[],
): FilaSimulacion[] {
  const porClave = new Map(especies.map((e) => [claveEsp(e.especie), e]));
  const agrupadas = new Map<string, { especie: string; m3: number; trozas: number }>();
  for (const e of entradas) {
    if (!(e.m3 > 0)) continue;
    const nombre = e.especie.trim() || "Sin especie";
    const k = claveEsp(nombre);
    const prev = agrupadas.get(k) ?? { especie: nombre, m3: 0, trozas: 0 };
    agrupadas.set(k, { especie: prev.especie, m3: prev.m3 + e.m3, trozas: prev.trozas + (e.trozas ?? 1) });
  }
  const pt = (m3: number, pct: number) => r2(m3 * (pct / 100) * PT_POR_M3);
  return [...agrupadas.entries()]
    .map(([k, g]) => {
      const r = porClave.get(k);
      const propio = r && r.ponderadoTerminadasPct != null && r.rango ? r : null;
      const pct = propio ? (propio.ponderadoTerminadasPct as number) : RANGO_REFERENCIA.centro;
      const pctMin = propio ? Math.min(pct, propio.rango!.min) : RANGO_REFERENCIA.min;
      const pctMax = propio ? Math.max(pct, propio.rango!.max) : RANGO_REFERENCIA.max;
      const m3 = r4(g.m3);
      return {
        especie: propio?.especie ?? g.especie,
        m3,
        trozas: g.trozas,
        pct,
        pctMin,
        pctMax,
        fuente: (propio ? (propio.rango!.provisional ? "provisional" : "propio") : "referencia") as FuenteSimulacion,
        corridas: propio?.terminadas ?? 0,
        ptEsperado: pt(m3, pct),
        ptMin: pt(m3, pctMin),
        ptMax: pt(m3, pctMax),
      };
    })
    .sort((a, b) => b.m3 - a.m3);
}

// ── Lo que devuelve la ruta ───────────────────────────────────────────────

export interface CorridaRendimientoDTO extends CorridaRendimiento {
  estado: EstadoCorrida;
  /** El rango con el que se juzgó (el de las OTRAS corridas de la especie). */
  rango: RangoPropio | null;
  /** `null` si el rol no ve plata. */
  plata: RendimientoPlata | null;
}

export interface RendimientoAserraderoDTO {
  /** Clave Lima del día con el que se decidió «en proceso». */
  hoy: string;
  corridas: CorridaRendimientoDTO[];
  especies: ResumenEspecie[];
  total: {
    corridas: number;
    enProceso: number;
    m3Entrada: number;
    m3Salida: number;
    ponderadoPct: number | null;
    /** Promedio simple de los %: se muestra al lado sólo para explicar la diferencia. */
    promedioSimplePct: number | null;
    plata: RendimientoPlata | null;
  };
  plataVisible: boolean;
  /** Se leyeron sólo las últimas N corridas para la plata. */
  plataTruncada: boolean;
}

/** Arma la respuesta entera: totales en el servidor, la pantalla sólo dibuja. */
export function armarRendimientoAserradero(
  corridas: readonly CorridaRendimiento[],
  plataPorCorrida: ReadonlyMap<string, RendimientoPlata> | null,
  hoy: string,
  plataTruncada = false,
): RendimientoAserraderoDTO {
  const orden = [...corridas].sort(ordenFecha);
  const filas: CorridaRendimientoDTO[] = orden.map((c) => {
    const { estado, rango } = estadoCorrida(c, orden);
    return { ...c, estado, rango, plata: plataPorCorrida?.get(c.id) ?? null };
  });
  const tot = ponderado(orden);
  const pcts = orden.map((c) => c.rendimientoPct).filter((p): p is number => p != null);
  const platas = plataPorCorrida ? filas.map((f) => f.plata).filter((p): p is RendimientoPlata => p != null) : [];
  return {
    hoy,
    corridas: filas,
    especies: resumenPorEspecie(orden),
    total: {
      corridas: orden.length,
      enProceso: orden.filter((c) => c.parcial).length,
      m3Entrada: tot.entrada,
      m3Salida: tot.salida,
      ponderadoPct: tot.pct,
      promedioSimplePct: pcts.length > 0 ? r2(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      plata: platas.length > 0 ? agregarRendimientoPlata(platas) : null,
    },
    plataVisible: plataPorCorrida != null,
    plataTruncada,
  };
}
