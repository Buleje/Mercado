/**
 * loth-trace-tabla — un árbol, una fila, un solo número por hecho.
 *
 * Hasta acá la pantalla «Por árbol» contaba la misma historia dos veces: la
 * tarjeta decía «47.7% · 2.85 m³» y el cuadro «Censo vs realidad» de abajo
 * repetía «47.7% · 2.8502» con dos columnas que la tarjeta no tenía (censo y
 * DMC). Dos cifras para un solo hecho es lo que hace desconfiar de un tablero.
 *
 * Acá se unen las dos mitades por `treeCode`:
 *   · los VOLÚMENES y el recorrido salen de `loth-trace` (`TraceOperation`),
 *   · el CENSO —estimado, DAP, DMC, banderas de plan— sale de `loth-arbol`
 *     (`ArbolFicha`), que es lo único que la trazabilidad no sabe.
 *
 * Un árbol censado que nunca se taló no tiene operación: entra igual, con
 * `op: null`, porque «lo que autorizaron y no se tocó» es parte de la pregunta
 * que hace OSINFOR.
 *
 * PURO y client-safe.
 */

import type { ArbolFicha, ArbolFlag } from "./loth-arbol";
import { FLAG_LABEL, FLAG_TONE } from "./loth-arbol";
import type { TraceOperation } from "./loth-trace";
import type { VeredictoMerma } from "./loth-trace-umbrales";

export interface TraceFila {
  tree: string;
  especie: string | null;
  /** null = árbol censado que todavía está en pie. */
  op: TraceOperation | null;
  /** null = se taló un árbol que el censo no declara. */
  ficha: ArbolFicha | null;
  enPie: boolean;
  cites: boolean;
  // ── censo (sólo lo sabe la ficha) ──
  censoM3: number | null;
  dapCm: number | null;
  dmcCm: number | null;
  /** talado / censado × 100. */
  precisionCensoPct: number | null;
  // ── volúmenes y recorrido (sólo los sabe la operación) ──
  /** null = en pie, o una tala asentada sin volumen (no es «0 m³», es «no se midió»). */
  taladoM3: number | null;
  trozadoM3: number;
  movilizadoM3: number;
  patioM3: number;
  /** Trozas asentadas sin código: no se sabe si salieron o siguen en patio. */
  sinCodigoM3: number;
  /** null = todavía no se trozó: no rindió 0 %, todavía no se sabe. */
  rendimientoPct: number | null;
  /** null = todavía no se trozó (antes se mostraba el árbol entero como merma). */
  mermaM3: number | null;
  mermaPct: number | null;
  mermaVeredicto: VeredictoMerma | null;
  etapas: number;
  diasTalaSalida: number | null;
  diasParado: number | null;
  tardias: number;
  gtfs: string[];
  // ── veredicto conjunto ──
  flags: ArbolFlag[];
  /** Motivos legibles (alertas de la operación + banderas del censo). */
  motivos: string[];
  /** El peor nivel entre ambas fuentes. */
  nivel: "error" | "warn" | null;
}

export const movilizadoDe = (op: TraceOperation): number => {
  let total = 0;
  for (const t of op.trozado) {
    const estado = t.trozaCode ? op.trozaEstado[t.trozaCode] : undefined;
    if (estado === "despachada" || estado === "consumida") total += Number(t.volumeM3 ?? 0) || 0;
  }
  return total;
};

/** Volumen de las trozas asentadas sin código (no tienen estado que leer). */
export const sinCodigoDe = (op: TraceOperation): number =>
  op.trozado.filter((t) => !t.trozaCode).reduce((a, t) => a + (Number(t.volumeM3 ?? 0) || 0), 0);

/**
 * Une trazabilidad y censo por código de árbol.
 *
 * Cuando los dos lados miden lo mismo (trozado, movilizado, rendimiento) gana
 * la operación: es la que la tarjeta muestra y la que el usuario acaba de leer
 * arriba. La ficha aporta lo suyo — censo, DAP, DMC, banderas — y nada más.
 */
export function construirFilasTrace(ops: TraceOperation[], fichas: ArbolFicha[]): TraceFila[] {
  const porArbol = new Map<string, ArbolFicha>();
  for (const f of fichas) porArbol.set(f.treeCode, f);

  const filas: TraceFila[] = ops.map((op) => {
    const ficha = porArbol.get(op.tree) ?? null;
    const movilizadoM3 = movilizadoDe(op);
    // Rendimiento y merma existen recién con lo talado Y lo trozado medidos.
    const seMide = op.talaVolM3 > 0 && op.trozadoVolM3 > 0;
    const censoM3 = ficha?.volumenCensoM3 ?? null;
    const flags = ficha?.flags ?? [];
    const motivos = [...op.alerts.map((a) => a.message), ...flags.filter((f) => FLAG_TONE[f] !== "info").map((f) => FLAG_LABEL[f])];
    const nivel: TraceFila["nivel"] =
      op.alerts.some((a) => a.level === "error") || flags.some((f) => FLAG_TONE[f] === "error")
        ? "error"
        : motivos.length > 0
          ? "warn"
          : null;

    return {
      tree: op.tree,
      especie: op.species,
      op,
      ficha,
      enPie: false,
      cites: op.cites,
      censoM3,
      dapCm: ficha?.dapCm ?? null,
      dmcCm: ficha?.dmcCm ?? null,
      // Se recalcula acá (y no se toma de la ficha) para que el % de la tabla
      // sea el mismo número que la tarjeta: los dos dividen el MISMO talado.
      precisionCensoPct: censoM3 != null && censoM3 > 0 ? Math.round((op.talaVolM3 / censoM3) * 1000) / 10 : null,
      taladoM3: op.tala.some((t) => Number(t.volumeM3 ?? 0) > 0) ? op.talaVolM3 : null,
      trozadoM3: op.trozadoVolM3,
      movilizadoM3,
      patioM3: op.patioVolM3,
      sinCodigoM3: sinCodigoDe(op),
      rendimientoPct: seMide ? Math.round((op.trozadoVolM3 / op.talaVolM3) * 1000) / 10 : null,
      mermaM3: seMide ? op.mermaVolM3 : null,
      mermaPct: seMide ? op.mermaPct : null,
      mermaVeredicto: seMide ? op.mermaVeredicto : null,
      etapas: op.stagesReached,
      diasTalaSalida: op.diasTalaSalida,
      diasParado: op.diasParado,
      tardias: op.tardias,
      gtfs: op.gtfs,
      flags,
      motivos,
      nivel,
    };
  });

  // Los censados que nunca se talaron: no tienen operación, pero sí autorización.
  const trazados = new Set(ops.map((o) => o.tree));
  for (const f of fichas) {
    if (trazados.has(f.treeCode) || !f.enPie) continue;
    filas.push({
      tree: f.treeCode,
      especie: f.especie,
      op: null,
      ficha: f,
      enPie: true,
      cites: false,
      censoM3: f.volumenCensoM3,
      dapCm: f.dapCm,
      dmcCm: f.dmcCm,
      precisionCensoPct: null,
      taladoM3: null,
      trozadoM3: 0,
      movilizadoM3: 0,
      patioM3: 0,
      sinCodigoM3: 0,
      rendimientoPct: null,
      mermaM3: null,
      mermaPct: null,
      mermaVeredicto: null,
      etapas: 0,
      diasTalaSalida: null,
      diasParado: null,
      tardias: 0,
      gtfs: [],
      flags: f.flags,
      motivos: f.flags.filter((x) => FLAG_TONE[x] !== "info").map((x) => FLAG_LABEL[x]),
      nivel: f.flags.some((x) => FLAG_TONE[x] === "error") ? "error" : f.flags.some((x) => FLAG_TONE[x] === "warning") ? "warn" : null,
    });
  }

  return filas;
}

/** CSV de la pantalla: una fila por árbol con censo, operación y veredicto. */
export function filasToCsv(filas: TraceFila[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Árbol", "Especie", "CITES", "Estado",
    "Censo m³", "DAP cm", "DMC cm", "Talado m³", "Precisión censo %",
    "Trozado m³", "Rendimiento %", "Merma m³", "Merma %", "Veredicto merma",
    "Movilizado m³", "En patio m³", "Etapas", "Días tala→salida", "Días parado", "Líneas fuera de plazo",
    "GTFs", "Observaciones",
  ];
  const rows = filas.map((f) => [
    f.tree, f.especie ?? "", f.cites ? "Sí" : "No", f.enPie ? "En pie" : (f.op?.chain ?? ""),
    f.censoM3?.toFixed(4) ?? "", f.dapCm?.toFixed(1) ?? "", f.dmcCm?.toFixed(0) ?? "",
    f.taladoM3?.toFixed(4) ?? "", f.precisionCensoPct?.toFixed(1) ?? "",
    f.trozadoM3 > 0 ? f.trozadoM3.toFixed(4) : "", f.rendimientoPct?.toFixed(1) ?? "",
    f.mermaM3?.toFixed(4) ?? "", f.mermaPct?.toFixed(1) ?? "", f.mermaVeredicto ?? "",
    f.movilizadoM3 > 0 ? f.movilizadoM3.toFixed(4) : "", f.patioM3 > 0 ? f.patioM3.toFixed(4) : "",
    f.op ? `${f.etapas}/6` : "", f.diasTalaSalida ?? "", f.diasParado ?? "", f.tardias,
    f.gtfs.join(" | "), f.motivos.join(" | "),
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// ─── el embudo de la vista ────────────────────────────────────────────────────

/**
 * Del censo al despacho, contado sobre las MISMAS filas que la tabla.
 *
 * Cada etapa es un subconjunto de la anterior y las cuentas cierran por
 * construcción (si alguna vez no cierran, el bug está acá y lo agarra el test):
 *
 *   árboles            = talados + en pie
 *   talados            = trozados + sin trozar
 *   talado + exceso    = trozado + merma + sin trozar        (m³)
 *   trozado            = movilizado + en patio + sin código  (m³)
 *
 * `exceso` es el trozado que supera a su tala (la alerta T4): sin él, un árbol
 * mal medido rompería la segunda igualdad y la pantalla parecería sumar mal.
 */
export interface ResumenTrace {
  arboles: number;
  enPie: number;
  /** Árboles del censo, talados o no. 0 = no hay censo cargado. */
  censados: number;
  taladosDelCenso: number;
  talados: number;
  taladosSinCenso: number;
  /** Talas asentadas sin volumen: cuentan como árbol, no suman m³. */
  taladosSinVolumen: number;
  trozados: number;
  sinTrozar: number;
  /** Con al menos una troza despachada o consumida. */
  conSalida: number;
  /** Cadena completa: la madera salió con guía (troza o producto). */
  completas: number;
  conPatio: number;
  m3: {
    censo: number;
    talado: number;
    trozado: number;
    merma: number;
    exceso: number;
    sinTrozar: number;
    movilizado: number;
    patio: number;
    sinCodigo: number;
  };
  /** Merma sobre lo talado de los árboles YA trozados. null = ninguno trozado. */
  mermaPct: number | null;
  mermaAviso: number;
  mermaGrave: number;
  conGps: number;
  conTardias: number;
  cites: number;
  /** Mediana de días entre la tala y la primera salida (sólo los que salieron). */
  medianaTalaSalida: number | null;
}

export function resumirFilas(filas: TraceFila[]): ResumenTrace {
  const conOp = filas.filter((f) => f.op != null);
  const trozados = conOp.filter((f) => f.trozadoM3 > 0);
  const sinTrozar = conOp.filter((f) => !(f.trozadoM3 > 0));
  const censado = (f: TraceFila) => f.ficha != null && !f.flags.includes("no_censado");
  const suma = (xs: TraceFila[], v: (f: TraceFila) => number) => xs.reduce((a, f) => a + v(f), 0);
  const talado = (f: TraceFila) => f.op?.talaVolM3 ?? 0;
  const taladoTrozados = suma(trozados, talado);
  const merma = suma(trozados, (f) => Math.max(0, talado(f) - f.trozadoM3));
  const tiempos = conOp
    .map((f) => f.diasTalaSalida)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);

  return {
    arboles: filas.length,
    enPie: filas.filter((f) => f.enPie).length,
    censados: filas.filter(censado).length,
    taladosDelCenso: conOp.filter(censado).length,
    talados: conOp.length,
    taladosSinCenso: conOp.filter((f) => !censado(f)).length,
    taladosSinVolumen: conOp.filter((f) => f.taladoM3 == null).length,
    trozados: trozados.length,
    sinTrozar: sinTrozar.length,
    conSalida: trozados.filter((f) => Object.values(f.op?.trozaEstado ?? {}).some((e) => e !== "patio")).length,
    completas: conOp.filter((f) => f.op?.chain === "completa").length,
    conPatio: conOp.filter((f) => (f.op?.trozasEnPatio ?? 0) > 0).length,
    m3: {
      censo: suma(filas, (f) => f.censoM3 ?? 0),
      talado: suma(conOp, talado),
      trozado: suma(conOp, (f) => f.trozadoM3),
      merma,
      exceso: suma(trozados, (f) => Math.max(0, f.trozadoM3 - talado(f))),
      sinTrozar: suma(sinTrozar, talado),
      movilizado: suma(conOp, (f) => f.movilizadoM3),
      patio: suma(conOp, (f) => f.patioM3),
      sinCodigo: suma(conOp, (f) => f.sinCodigoM3),
    },
    mermaPct: taladoTrozados > 0 ? Math.round((merma / taladoTrozados) * 1000) / 10 : null,
    mermaAviso: filas.filter((f) => f.mermaVeredicto === "aviso").length,
    mermaGrave: filas.filter((f) => f.mermaVeredicto === "grave").length,
    conGps: conOp.filter((f) => f.op?.gps != null).length,
    conTardias: filas.filter((f) => f.tardias > 0).length,
    cites: filas.filter((f) => f.cites).length,
    medianaTalaSalida: tiempos.length > 0 ? tiempos[Math.floor((tiempos.length - 1) / 2)] : null,
  };
}
