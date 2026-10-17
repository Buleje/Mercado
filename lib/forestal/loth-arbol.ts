/**
 * loth-arbol — el ÁRBOL como unidad de análisis. El libro razona por línea y por
 * troza; el regente y OSINFOR razonan por árbol: "el 85-TOR que el censo decía
 * 4,2 m³, ¿cuánto dio de verdad y dónde terminó?".
 *
 * Cruza el CENSO (volumen estimado antes de tumbar) con la TALA (volumen real
 * medido en el tocón), el TROZADO y lo MOVILIZADO, y saca los dos rendimientos
 * que nadie estaba mirando:
 *
 *   · **precisión del censo** = talado / estimado → un censo inflado es
 *     autorización inflada, que es el fraude que fiscaliza OSINFOR;
 *   · **rendimiento de trozado** = trozado / talado → merma real del monte.
 *
 * También levanta las banderas que sólo se ven a nivel árbol: talado sin figurar
 * en el censo (origen sin respaldo), tumbado hace semanas sin trozar (madera
 * parada), trozas sin movilizar.
 *
 * PURO y client-safe. Sin `Date.now`: la fecha de referencia entra por parámetro.
 */

import type { LothEntryDTO } from "./loth-constants";
import { dmcParaEspecie, normEspecie } from "./loth-poa";

/** Desvío tolerado entre lo que estimó el censo y lo que dio la tala. */
export const DESVIO_CENSO_PCT = 25;
/** Días tumbado sin trozar a partir de los cuales se avisa (madera parada). */
export const DIAS_SIN_TROZAR = 30;

export interface ArbolCensoInput {
  treeCode: string;
  speciesCommon: string;
  dapM: number | null;
  volumenEstimadoM3: number | null;
  estado: string;
}

export type ArbolFlag =
  | "no_censado"
  | "censo_sobreestimado"
  | "censo_subestimado"
  | "sin_trozar"
  | "sin_movilizar"
  | "bajo_dmc"
  | "censado_sin_talar";

export const FLAG_LABEL: Record<ArbolFlag, string> = {
  no_censado: "Talado sin censo",
  censo_sobreestimado: "Censo sobreestimado",
  censo_subestimado: "Censo subestimado",
  sin_trozar: "Tumbado sin trozar",
  sin_movilizar: "Trozas sin movilizar",
  bajo_dmc: "Talado bajo DMC",
  censado_sin_talar: "En pie",
};

export const FLAG_TONE: Record<ArbolFlag, "error" | "warning" | "info"> = {
  no_censado: "error",
  censo_sobreestimado: "warning",
  censo_subestimado: "warning",
  sin_trozar: "warning",
  sin_movilizar: "info",
  bajo_dmc: "error",
  censado_sin_talar: "info",
};

export interface ArbolFicha {
  treeCode: string;
  especie: string;
  /** Estimado por el censo (m³). */
  volumenCensoM3: number | null;
  /** Medido al tumbar (m³). */
  volumenTaladoM3: number | null;
  /** Σ de las trozas obtenidas (m³). */
  volumenTrozadoM3: number;
  /** Σ de las trozas despachadas o consumidas (m³). */
  volumenMovilizadoM3: number;
  trozas: string[];
  trozasMovilizadas: string[];
  fechaTala: string | null;
  diasDesdeTala: number | null;
  dapCm: number | null;
  dmcCm: number;
  /** talado / estimado × 100 (null si falta alguno). */
  precisionCensoPct: number | null;
  /** trozado / talado × 100. */
  rendimientoTrozadoPct: number | null;
  /** movilizado / trozado × 100. */
  avanceMovilizacionPct: number | null;
  enPie: boolean;
  flags: ArbolFlag[];
}

export interface ArbolResumen {
  arboles: number;
  talados: number;
  enPie: number;
  volumenCensoM3: number;
  volumenTaladoM3: number;
  volumenTrozadoM3: number;
  volumenMovilizadoM3: number;
  /** Promedio ponderado talado/estimado sobre los árboles con ambos datos. */
  precisionCensoPct: number | null;
  rendimientoTrozadoPct: number | null;
  conBandera: number;
}

const round = (n: number, d = 4): number => Number(n.toFixed(d));
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dias = (desde: string | null, hasta: Date): number | null => {
  if (!desde) return null;
  const d = new Date(desde);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((hasta.getTime() - d.getTime()) / 86_400_000));
};

/**
 * Arma la ficha de cada árbol cruzando censo y libro.
 *
 * La unión es por `treeCode`: los árboles censados que nunca se talaron quedan
 * "en pie", y una tala cuyo código no está en el censo levanta bandera roja
 * (madera sin origen documentado).
 */
export function construirFichasArbol(opts: {
  censo: ArbolCensoInput[];
  entries: LothEntryDTO[];
  dmcOverrides?: Record<string, number>;
  hoy: Date;
}): ArbolFicha[] {
  const vivos = opts.entries.filter((e) => e.status !== "anulado");
  const talas = vivos.filter((e) => e.section === "tala" && e.treeCode);
  const trozados = vivos.filter((e) => e.section === "trozado" && e.treeCode);
  const salidas = vivos.filter((e) => e.section === "despacho_troza" || e.section === "consumo_troza");

  // Troza → volumen (del trozado) y troza → movilizada.
  const volPorTroza = new Map<string, number>();
  for (const t of trozados) {
    if (t.trozaCode) volPorTroza.set(t.trozaCode, num(t.volumeM3) ?? 0);
  }
  const movilizadas = new Set(salidas.map((s) => s.trozaCode).filter(Boolean) as string[]);

  const censoPorCodigo = new Map(opts.censo.map((c) => [c.treeCode, c]));
  const codigos = new Set<string>([...censoPorCodigo.keys(), ...talas.map((t) => t.treeCode as string)]);

  const fichas: ArbolFicha[] = [];
  for (const code of codigos) {
    const c = censoPorCodigo.get(code);
    const tala = talas.find((t) => t.treeCode === code);
    const misTrozas = trozados.filter((t) => t.treeCode === code);
    const trozasCodes = misTrozas.map((t) => t.trozaCode).filter(Boolean) as string[];
    const movidas = trozasCodes.filter((tc) => movilizadas.has(tc));

    const volumenCensoM3 = c ? num(c.volumenEstimadoM3) : null;
    const volumenTaladoM3 = tala ? num(tala.volumeM3) : null;
    const volumenTrozadoM3 = round(misTrozas.reduce((a, t) => a + (num(t.volumeM3) ?? 0), 0));
    const volumenMovilizadoM3 = round(movidas.reduce((a, tc) => a + (volPorTroza.get(tc) ?? 0), 0));

    const especie = c?.speciesCommon ?? tala?.speciesCommon ?? "—";
    const dapCm = c?.dapM != null ? round(c.dapM * 100, 1) : null;
    const { cm: dmcCm } = dmcParaEspecie(especie, opts.dmcOverrides ?? {});

    const fechaTala = tala?.entryDate ?? null;
    const diasDesdeTala = dias(fechaTala, opts.hoy);

    const precisionCensoPct =
      volumenCensoM3 && volumenCensoM3 > 0 && volumenTaladoM3 != null ? round((volumenTaladoM3 / volumenCensoM3) * 100, 1) : null;
    const rendimientoTrozadoPct =
      volumenTaladoM3 && volumenTaladoM3 > 0 && volumenTrozadoM3 > 0 ? round((volumenTrozadoM3 / volumenTaladoM3) * 100, 1) : null;
    const avanceMovilizacionPct = volumenTrozadoM3 > 0 ? round((volumenMovilizadoM3 / volumenTrozadoM3) * 100, 1) : null;

    const flags: ArbolFlag[] = [];
    if (!c && tala) flags.push("no_censado");
    if (precisionCensoPct != null) {
      if (precisionCensoPct < 100 - DESVIO_CENSO_PCT) flags.push("censo_sobreestimado");
      else if (precisionCensoPct > 100 + DESVIO_CENSO_PCT) flags.push("censo_subestimado");
    }
    if (tala && trozasCodes.length === 0 && (diasDesdeTala ?? 0) >= DIAS_SIN_TROZAR) flags.push("sin_trozar");
    if (trozasCodes.length > 0 && movidas.length < trozasCodes.length) flags.push("sin_movilizar");
    if (tala && dapCm != null && dapCm < dmcCm) flags.push("bajo_dmc");
    if (!tala) flags.push("censado_sin_talar");

    fichas.push({
      treeCode: code,
      especie,
      volumenCensoM3,
      volumenTaladoM3,
      volumenTrozadoM3,
      volumenMovilizadoM3,
      trozas: trozasCodes,
      trozasMovilizadas: movidas,
      fechaTala,
      diasDesdeTala,
      dapCm,
      dmcCm,
      precisionCensoPct,
      rendimientoTrozadoPct,
      avanceMovilizacionPct,
      enPie: !tala,
      flags,
    });
  }

  // Primero lo que hay que mirar: banderas rojas, después las amarillas.
  const peso = (f: ArbolFicha) => {
    if (f.flags.some((x) => FLAG_TONE[x] === "error")) return 0;
    if (f.flags.some((x) => FLAG_TONE[x] === "warning")) return 1;
    return f.enPie ? 3 : 2;
  };
  return fichas.sort((a, b) => peso(a) - peso(b) || a.treeCode.localeCompare(b.treeCode));
}

/** Totales y promedios ponderados del conjunto. */
export function resumirArboles(fichas: ArbolFicha[]): ArbolResumen {
  const talados = fichas.filter((f) => !f.enPie);
  const conAmbos = talados.filter((f) => f.volumenCensoM3 && f.volumenTaladoM3 != null);
  const censoDeComparables = conAmbos.reduce((a, f) => a + (f.volumenCensoM3 ?? 0), 0);
  const taladoDeComparables = conAmbos.reduce((a, f) => a + (f.volumenTaladoM3 ?? 0), 0);
  const volumenTaladoM3 = round(talados.reduce((a, f) => a + (f.volumenTaladoM3 ?? 0), 0));
  const volumenTrozadoM3 = round(fichas.reduce((a, f) => a + f.volumenTrozadoM3, 0));

  return {
    arboles: fichas.length,
    talados: talados.length,
    enPie: fichas.filter((f) => f.enPie).length,
    volumenCensoM3: round(fichas.reduce((a, f) => a + (f.volumenCensoM3 ?? 0), 0)),
    volumenTaladoM3,
    volumenTrozadoM3,
    volumenMovilizadoM3: round(fichas.reduce((a, f) => a + f.volumenMovilizadoM3, 0)),
    precisionCensoPct: censoDeComparables > 0 ? round((taladoDeComparables / censoDeComparables) * 100, 1) : null,
    rendimientoTrozadoPct: volumenTaladoM3 > 0 ? round((volumenTrozadoM3 / volumenTaladoM3) * 100, 1) : null,
    conBandera: fichas.filter((f) => f.flags.some((x) => FLAG_TONE[x] !== "info")).length,
  };
}

/** CSV del cuadro por árbol — para pegarlo en el informe del regente. */
export function fichasToCsv(fichas: ArbolFicha[]): string {
  const cabecera = [
    "arbol",
    "especie",
    "dap_cm",
    "dmc_cm",
    "vol_censo_m3",
    "vol_talado_m3",
    "vol_trozado_m3",
    "vol_movilizado_m3",
    "precision_censo_pct",
    "rendimiento_trozado_pct",
    "trozas",
    "observaciones",
  ].join(",");
  const filas = fichas.map((f) =>
    [
      f.treeCode,
      f.especie,
      f.dapCm ?? "",
      f.dmcCm,
      f.volumenCensoM3 ?? "",
      f.volumenTaladoM3 ?? "",
      f.volumenTrozadoM3,
      f.volumenMovilizadoM3,
      f.precisionCensoPct ?? "",
      f.rendimientoTrozadoPct ?? "",
      f.trozas.join(" "),
      f.flags.map((x) => FLAG_LABEL[x]).join(" · "),
    ]
      .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v))
      .join(","),
  );
  return [cabecera, ...filas].join("\n");
}

/** Coincidencia para el buscador (código, especie o troza). */
export function fichaMatches(f: ArbolFicha, query: string): boolean {
  const q = normEspecie(query);
  if (!q) return true;
  return (
    normEspecie(f.treeCode).includes(q) ||
    normEspecie(f.especie).includes(q) ||
    f.trozas.some((t) => normEspecie(t).includes(q))
  );
}
