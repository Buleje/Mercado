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
  taladoM3: number | null;
  trozadoM3: number;
  movilizadoM3: number;
  patioM3: number;
  rendimientoPct: number | null;
  mermaM3: number;
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

const movilizadoDe = (op: TraceOperation): number => {
  let total = 0;
  for (const t of op.trozado) {
    const estado = t.trozaCode ? op.trozaEstado[t.trozaCode] : undefined;
    if (estado === "despachada" || estado === "consumida") total += Number(t.volumeM3 ?? 0) || 0;
  }
  return total;
};

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
      taladoM3: op.talaVolM3,
      trozadoM3: op.trozadoVolM3,
      movilizadoM3,
      patioM3: op.patioVolM3,
      rendimientoPct: op.talaVolM3 > 0 ? Math.round((op.trozadoVolM3 / op.talaVolM3) * 1000) / 10 : null,
      mermaM3: op.mermaVolM3,
      mermaPct: op.talaVolM3 > 0 ? op.mermaPct : null,
      mermaVeredicto: op.trozadoVolM3 > 0 ? op.mermaVeredicto : null,
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
      rendimientoPct: null,
      mermaM3: 0,
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
    f.mermaM3 > 0 ? f.mermaM3.toFixed(4) : "", f.mermaPct?.toFixed(1) ?? "", f.mermaVeredicto ?? "",
    f.movilizadoM3 > 0 ? f.movilizadoM3.toFixed(4) : "", f.patioM3 > 0 ? f.patioM3.toFixed(4) : "",
    f.op ? `${f.etapas}/6` : "", f.diasTalaSalida ?? "", f.diasParado ?? "", f.tardias,
    f.gtfs.join(" | "), f.motivos.join(" | "),
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
