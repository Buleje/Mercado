/**
 * loth-trace-grupos — en qué parte del permiso está cada árbol y qué falta hacer.
 *
 * La vista «Por árbol» listaba los 67 árboles del censo de Blas como 67
 * tarjetas y 61 decían sólo «Censado, en pie» (medido 30-09: 6 talados, 42,5 m³
 * de 569,6 censados). Lo que pedía trabajo —el 114 y el 100, talados y sin
 * trozar— quedaba enterrado entre los que nadie tocó. Acá se parte la MISMA
 * lista de filas (`construirFilasTrace`) en:
 *
 *   · en movimiento — talados con algo pendiente (sin trozar, trozas en patio,
 *                     trozas sin código que no se sabe dónde están);
 *   · terminados    — todas sus trozas salieron (despachadas o al aserrío);
 *   · en pie        — censados que no se talaron: se resumen por especie.
 *
 * Y se saca la lista accionable («Qué falta hacer») con su número real.
 *
 * PURO y client-safe: sin reloj propio (el «hoy» lo pasa quien llama).
 */

import { claveEspecie } from "./loth-constants";
import type { ResumenTrace, TraceFila } from "./loth-trace-tabla";

// ─── etapas de la lista ───────────────────────────────────────────────────────

export type GrupoArbol = "movimiento" | "terminado" | "en_pie";

/** Menos de medio litro no es madera sin código: es redondeo del libro. */
const TOL_M3 = 0.0005;

/**
 * ¿Salió toda su madera? Hace falta haber trozado, que ninguna troza siga en
 * patio y que no haya trozas sin código (de ésas no se sabe si salieron).
 */
export function grupoDe(f: TraceFila): GrupoArbol {
  if (!f.op) return "en_pie";
  const terminado = f.trozadoM3 > 0 && f.op.trozasEnPatio === 0 && f.sinCodigoM3 <= TOL_M3;
  return terminado ? "terminado" : "movimiento";
}

/** Orden de los grupos en la pantalla: lo que pide trabajo arriba. */
export const RANGO_GRUPO: Record<GrupoArbol, number> = { movimiento: 0, terminado: 1, en_pie: 2 };

export function agruparPorEtapa(filas: TraceFila[]): Record<GrupoArbol, TraceFila[]> {
  const out: Record<GrupoArbol, TraceFila[]> = { movimiento: [], terminado: [], en_pie: [] };
  for (const f of filas) out[grupoDe(f)].push(f);
  return out;
}

// ─── pasos del avance (cada uno filtra la lista) ─────────────────────────────

export type PasoAvance = "censo" | "talados" | "trozados" | "salieron";

/** Cuenta igual que `resumirFilas`: la lista filtrada tiene el número del paso. */
export const esCensado = (f: TraceFila) => f.ficha != null && !f.flags.includes("no_censado");
const salioAlgo = (f: TraceFila) => Object.values(f.op?.trozaEstado ?? {}).some((e) => e !== "patio");

export function pasaPaso(f: TraceFila, paso: PasoAvance | null): boolean {
  switch (paso) {
    case null:
      return true;
    case "censo":
      return esCensado(f);
    case "talados":
      return f.op != null;
    case "trozados":
      return f.op != null && f.trozadoM3 > 0;
    case "salieron":
      return f.op != null && f.trozadoM3 > 0 && salioAlgo(f);
  }
}

/** Trozas que dejaron el patio, contadas por pieza (no por árbol). */
export function trozasQueSalieron(filas: TraceFila[]): { despachadas: number; consumidas: number } {
  let despachadas = 0;
  let consumidas = 0;
  for (const f of filas) {
    for (const e of Object.values(f.op?.trozaEstado ?? {})) {
      if (e === "despachada") despachadas++;
      else if (e === "consumida") consumidas++;
    }
  }
  return { despachadas, consumidas };
}

/** Lo censado que ya se taló, en % del volumen del censo. null = sin censo. */
export function pctTaladoDelCenso(r: ResumenTrace): number | null {
  if (!(r.m3.censo > 0)) return null;
  return Math.round((r.m3.talado / r.m3.censo) * 1000) / 10;
}

export interface AvisoAvance {
  key: "fuera_censo" | "sin_volumen" | "sin_gps" | "merma_grave" | "merma_aviso" | "plazo" | "cites";
  n: number;
  label: string;
  nivel: "error" | "warn" | "info";
}

/** Los avisos de debajo del avance, SÓLO los que están en más de cero. */
export function avisosDelAvance(r: ResumenTrace): AvisoAvance[] {
  const hayCenso = r.censados > 0;
  const lista: AvisoAvance[] = [
    { key: "fuera_censo", n: hayCenso ? r.taladosSinCenso : 0, label: r.taladosSinCenso === 1 ? "talado fuera del censo" : "talados fuera del censo", nivel: "error" },
    { key: "sin_volumen", n: r.taladosSinVolumen, label: r.taladosSinVolumen === 1 ? "tala sin volumen" : "talas sin volumen", nivel: "warn" },
    { key: "sin_gps", n: r.talados - r.conGps, label: "sin GPS", nivel: "warn" },
    { key: "merma_grave", n: r.mermaGrave, label: r.mermaGrave === 1 ? "merma grave" : "mermas graves", nivel: "error" },
    { key: "merma_aviso", n: r.mermaAviso, label: "sobre el aviso de merma", nivel: "warn" },
    { key: "plazo", n: r.conTardias, label: "con registro fuera de plazo", nivel: "warn" },
    { key: "cites", n: r.cites, label: "CITES", nivel: "info" },
  ];
  return lista.filter((a) => a.n > 0);
}

// ─── qué falta hacer ─────────────────────────────────────────────────────────

/**
 * Una troza que lleva más de esto en patio pide destino. Mismo plazo que el
 * aviso «talado hace más de 30 días sin trozar» del censo (`DIAS_SIN_TROZAR`):
 * dos relojes del mismo patio no deberían contar distinto.
 */
export const DIAS_EN_PATIO_AVISO = 30;

const diaUtc = (iso: string | Date): number | null => {
  const d = new Date(typeof iso === "string" ? `${iso.slice(0, 10)}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
};
const diasDesde = (iso: string | null | undefined, hoy: Date): number | null => {
  if (!iso) return null;
  const a = diaUtc(iso);
  const b = diaUtc(hoy);
  return a == null || b == null ? null : b - a;
};

export interface PendienteSinTrozar {
  tree: string;
  especie: string | null;
  /** null = la tala se asentó sin volumen. */
  taladoM3: number | null;
  fechaTala: string | null;
  dias: number | null;
}

export interface PendientePatio {
  tree: string;
  especie: string | null;
  trozas: number;
  m3: number;
  /** La troza más vieja del árbol que sigue en patio. */
  desde: string;
  dias: number;
}

export interface PendienteMerma {
  tree: string;
  especie: string | null;
  mermaPct: number;
  mermaM3: number;
}

export interface Pendientes {
  sinTrozar: PendienteSinTrozar[];
  patio: PendientePatio[];
  mermaGrave: PendienteMerma[];
  total: number;
}

/**
 * Lo que pide una acción, con su número. Lo más viejo primero: el árbol que
 * lleva más días tumbado es el que se está rajando al sol.
 */
export function pendientesDe(filas: TraceFila[], hoy: Date): Pendientes {
  const sinTrozar: PendienteSinTrozar[] = [];
  const patio: PendientePatio[] = [];
  const mermaGrave: PendienteMerma[] = [];

  for (const f of filas) {
    const op = f.op;
    if (!op) continue;
    if (!(f.trozadoM3 > 0)) {
      const fechaTala = op.etapaFechas[0]?.slice(0, 10) ?? null;
      sinTrozar.push({ tree: f.tree, especie: f.especie, taladoM3: f.taladoM3, fechaTala, dias: diasDesde(fechaTala, hoy) });
    }
    const enPatio = op.trozado.filter((t) => t.trozaCode && op.trozaEstado[t.trozaCode] === "patio");
    if (enPatio.length > 0) {
      const desde = enPatio.map((t) => t.entryDate.slice(0, 10)).sort()[0];
      const dias = diasDesde(desde, hoy);
      if (dias != null && dias > DIAS_EN_PATIO_AVISO) {
        patio.push({
          tree: f.tree,
          especie: f.especie,
          trozas: enPatio.length,
          m3: enPatio.reduce((a, t) => a + (Number(t.volumeM3 ?? 0) || 0), 0),
          desde,
          dias,
        });
      }
    }
    if (f.mermaVeredicto === "grave" && f.mermaPct != null && f.mermaM3 != null) {
      mermaGrave.push({ tree: f.tree, especie: f.especie, mermaPct: f.mermaPct, mermaM3: f.mermaM3 });
    }
  }

  const porCodigo = (a: { tree: string }, b: { tree: string }) => a.tree.localeCompare(b.tree, "es", { numeric: true });
  sinTrozar.sort((a, b) => (a.fechaTala ?? "9999").localeCompare(b.fechaTala ?? "9999") || porCodigo(a, b));
  patio.sort((a, b) => b.dias - a.dias || porCodigo(a, b));
  mermaGrave.sort((a, b) => b.mermaPct - a.mermaPct || porCodigo(a, b));
  return { sinTrozar, patio, mermaGrave, total: sinTrozar.length + patio.length + mermaGrave.length };
}

// ─── en pie, por especie ─────────────────────────────────────────────────────

export interface EnPieEspecie {
  /** `claveEspecie`: «Tornillo» y «TORNILLO» son un solo grupo. */
  clave: string;
  /** El nombre como está escrito en el censo (el más frecuente). */
  especie: string;
  arboles: number;
  /** null = ningún árbol del grupo trae volumen estimado. */
  m3: number | null;
  codigos: string[];
}

export interface EnPieResumen {
  arboles: number;
  m3: number;
  especies: EnPieEspecie[];
}

/** Los censados sin talar, agrupados por especie; la de más volumen primero. */
export function enPiePorEspecie(filas: TraceFila[]): EnPieResumen {
  const grupos = new Map<string, { nombres: Map<string, number>; arboles: number; m3: number; conM3: boolean; codigos: string[] }>();
  for (const f of filas) {
    if (!f.enPie) continue;
    const nombre = f.especie?.trim() || "Sin especie";
    const clave = claveEspecie(f.especie) || "sin-especie";
    const g = grupos.get(clave) ?? { nombres: new Map<string, number>(), arboles: 0, m3: 0, conM3: false, codigos: [] as string[] };
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    g.arboles++;
    if (f.censoM3 != null) {
      g.m3 += f.censoM3;
      g.conM3 = true;
    }
    g.codigos.push(f.tree);
    grupos.set(clave, g);
  }
  const especies: EnPieEspecie[] = Array.from(grupos, ([clave, g]) => ({
    clave,
    especie: Array.from(g.nombres).sort((a, b) => b[1] - a[1])[0][0],
    arboles: g.arboles,
    m3: g.conM3 ? g.m3 : null,
    codigos: g.codigos.sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
  })).sort((a, b) => (b.m3 ?? -1) - (a.m3 ?? -1) || b.arboles - a.arboles || a.especie.localeCompare(b.especie, "es"));
  return {
    arboles: especies.reduce((a, e) => a + e.arboles, 0),
    m3: especies.reduce((a, e) => a + (e.m3 ?? 0), 0),
    especies,
  };
}
