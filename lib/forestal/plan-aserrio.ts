/**
 * plan-aserrio — qué trozas mandar HOY a la sierra, en una hoja que se imprime.
 *
 * Hasta acá el operador elegía a ojo parado frente a la cancha (Brandon 05-10:
 * «lunes 7 am imprimes "Hoy: 6 de tornillo, ≈1.900 pt"»). Este plan contesta
 * lo mismo con las reglas del patio:
 *
 *   1. Entran SOLO las libres (`estadoDeTroza === "libre"`): la apartada ya
 *      tiene corrida, la aserrada ya se fue y la de una guía en bandeja todavía
 *      no bajó del camión. Como el plan se recalcula con el patio en vivo, una
 *      troza que una corrida consume sale sola de la lista («se marcan solas»).
 *   2. Orden = la que más días lleva parada primero (se mancha y se raja);
 *      empate → la de más volumen; después el código. Sin fecha → al final.
 *   3. Por especie: una corrida suele ser de una sola. La sugerida es la de la
 *      libre más vieja del patio.
 *   4. La meta de la jornada recorre esa fila en orden hasta cumplirse: N
 *      piezas, m³ o pies tablares (se toma hasta llegar o pasar), o «todas las
 *      de N días o más».
 *   5. A mano: QUITAR una troza deja entrar a la siguiente (la meta se sigue
 *      cumpliendo); AGREGAR suma por encima de la meta y no saca a nadie.
 *
 * Honestidad (rule `verificacion-de-verdad`): los pies tablares son una
 * ESTIMACIÓN con el rendimiento REAL del libro (`ptEstimados`, 424 pt/m³). Sin
 * rendimiento no hay pt —ni por troza, ni total, ni meta en pt— y se dice.
 *
 * PURO y client-safe.
 */

import { fmtM3, fmtPt } from "./cubicacion-formato";
import { TRAMOS_DIAS_PATIO, diasEnPatio } from "./patio-dias";
import { estadoDeTroza } from "./trozas-patio";
import { ptEstimados } from "./trozas-patio-kpis";
import { medidasDePieza, type FuenteMedida, type PiezaDelPatio } from "./trozas-patio-medidas";

/** Lo que el plan necesita de una pieza (un subconjunto de `/trozas/patio`). */
export interface PiezaPlan extends PiezaDelPatio {
  woodEntryId?: string;
  /** Cancha de la troza separada o de su pila (Mapa de Planta). */
  zonaId?: string | null;
}

/** La cancha de una carga, como la da `usePlantaUbicacion` (`woodEntryId → cancha`). */
export interface CanchaPlan {
  zonaId: string;
  nombre: string;
}

export type TipoObjetivo = "piezas" | "m3" | "pt" | "dias";
export interface ObjetivoPlan {
  tipo: TipoObjetivo;
  valor: number;
}

/** «Todas las de 15 días o más»: el primer corte de la escala única del patio. */
export const DIAS_PLAN = TRAMOS_DIAS_PATIO[0];
export const SIN_ESPECIE = "Sin especie";

export const OBJETIVO_META: Record<TipoObjetivo, { label: string; unidad: string; inicial: number; paso: number }> = {
  piezas: { label: "Piezas", unidad: "piezas", inicial: 6, paso: 1 },
  m3: { label: "m³", unidad: "m³", inicial: 5, paso: 0.5 },
  pt: { label: "Pies tablares", unidad: "pt", inicial: 2000, paso: 100 },
  dias: { label: "Días parada", unidad: "días o más", inicial: DIAS_PLAN, paso: 1 },
};

export interface FilaPlan {
  id: string;
  codigo: string | null;
  especie: string;
  d1: number | null;
  d2: number | null;
  fuente: FuenteMedida | null;
  largoM: number | null;
  m3: number | null;
  dias: number | null;
  /** Nombre de la cancha; `null` = sin ubicar en el Mapa de Planta. */
  cancha: string | null;
  /** ESTIMADO; `null` sin rendimiento del libro o sin volumen. */
  pt: number | null;
  /** Entró a mano, por encima de la meta. */
  aMano: boolean;
}

export interface GrupoPlan {
  especie: string;
  filas: FilaPlan[];
  piezas: number;
  m3: number;
  pt: number | null;
}

export interface PlanAserrio {
  grupos: GrupoPlan[];
  total: { piezas: number; m3: number; pt: number | null; sinVolumen: number };
  /** Libres de las especies elegidas, antes de quitar a mano. */
  disponibles: { piezas: number; m3: number };
  /** Libres que no entraron (de cualquier especie), más viejas primero: para agregar a mano. */
  fuera: FilaPlan[];
  /** ¿Se llegó a la meta? `false` = el patio no alcanza. */
  alcanza: boolean;
  rendimientoPct: number | null;
  avisos: string[];
}

export interface OpcionesPlan {
  hoy: Date;
  /** Vacío o `null` = todas las especies. */
  especies?: readonly string[] | null;
  objetivo: ObjetivoPlan;
  rendimientoPct?: number | null;
  canchas?: Readonly<Record<string, CanchaPlan>>;
  quitadas?: Iterable<string>;
  agregadas?: Iterable<string>;
}

export interface EspecieLibre {
  especie: string;
  piezas: number;
  m3: number;
  /** Días de la libre más vieja; `null` si ninguna tiene fecha. */
  diasMax: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const volumen = (t: { volumenM3: number | null }) =>
  typeof t.volumenM3 === "number" && Number.isFinite(t.volumenM3) && t.volumenM3 > 0 ? t.volumenM3 : null;
export const especieDe = (t: { especieComun: string | null }) => t.especieComun?.trim() || SIN_ESPECIE;
const rendimientoValido = (p: number | null | undefined): number | null =>
  p != null && Number.isFinite(p) && p > 0 && p <= 100 ? p : null;

/** Más días primero (sin fecha al final) → más volumen → código. */
export function compararFilas(a: FilaPlan, b: FilaPlan): number {
  if (a.dias !== b.dias) return a.dias == null ? 1 : b.dias == null ? -1 : b.dias - a.dias;
  if ((a.m3 ?? 0) !== (b.m3 ?? 0)) return (b.m3 ?? 0) - (a.m3 ?? 0);
  return (a.codigo ?? "").localeCompare(b.codigo ?? "", "es", { numeric: true });
}

function canchaDe(t: PiezaPlan, canchas: Readonly<Record<string, CanchaPlan>>, porZona: Map<string, string>) {
  if (t.zonaId && porZona.has(t.zonaId)) return porZona.get(t.zonaId) ?? null;
  return (t.woodEntryId && canchas[t.woodEntryId]?.nombre) || null;
}

/** Las libres del patio como filas del plan, ya ordenadas. */
export function filasLibres(
  trozas: readonly PiezaPlan[],
  hoy: Date,
  rendimientoPct?: number | null,
  canchas: Readonly<Record<string, CanchaPlan>> = {},
): FilaPlan[] {
  const rend = rendimientoValido(rendimientoPct);
  const porZona = new Map(Object.values(canchas).map((c) => [c.zonaId, c.nombre]));
  return trozas
    .filter((t) => estadoDeTroza(t) === "libre")
    .map((t): FilaPlan => {
      const md = medidasDePieza(t);
      const m3 = volumen(t);
      return {
        id: t.id,
        codigo: t.codificacion ?? t.codigoPlanta ?? null,
        especie: especieDe(t),
        d1: md.d1,
        d2: md.d2,
        fuente: md.fuente,
        largoM: typeof t.largoM === "number" && t.largoM > 0 ? t.largoM : null,
        m3,
        dias: diasEnPatio(t, hoy),
        cancha: canchaDe(t, canchas, porZona),
        pt: m3 == null ? null : ptEstimados(m3, rend),
        aMano: false,
      };
    })
    .sort(compararFilas);
}

/** Especies con libres, la de la troza más vieja primero (la sugerida es la 1.ª). */
export function especiesLibres(trozas: readonly PiezaPlan[], hoy: Date): EspecieLibre[] {
  const out = new Map<string, EspecieLibre>();
  for (const f of filasLibres(trozas, hoy)) {
    const g = out.get(f.especie) ?? { especie: f.especie, piezas: 0, m3: 0, diasMax: null };
    g.piezas += 1;
    g.m3 = r3(g.m3 + (f.m3 ?? 0));
    if (f.dias != null && (g.diasMax == null || f.dias > g.diasMax)) g.diasMax = f.dias;
    out.set(f.especie, g);
  }
  return [...out.values()].sort(
    (a, b) => (b.diasMax ?? -1) - (a.diasMax ?? -1) || b.m3 - a.m3 || a.especie.localeCompare(b.especie, "es"),
  );
}

/** Recorre la fila en orden hasta cumplir la meta. */
function tomarHastaMeta(candidatas: readonly FilaPlan[], objetivo: ObjetivoPlan): { filas: FilaPlan[]; alcanza: boolean } {
  const meta = Number.isFinite(objetivo.valor) ? Math.max(0, objetivo.valor) : 0;
  if (objetivo.tipo === "dias") return { filas: candidatas.filter((f) => f.dias != null && f.dias >= meta), alcanza: true };
  if (objetivo.tipo === "piezas") {
    const n = Math.floor(meta);
    return { filas: candidatas.slice(0, n), alcanza: candidatas.length >= n };
  }
  const medida = (f: FilaPlan) => (objetivo.tipo === "m3" ? f.m3 : f.pt) ?? 0;
  const filas: FilaPlan[] = [];
  let acumulado = 0;
  for (const f of candidatas) {
    if (acumulado >= meta) break;
    filas.push(f);
    acumulado += medida(f);
  }
  return { filas, alcanza: acumulado >= meta };
}

function agrupar(filas: readonly FilaPlan[], conPt: boolean): GrupoPlan[] {
  const grupos = new Map<string, GrupoPlan>();
  for (const f of filas) {
    const g = grupos.get(f.especie) ?? { especie: f.especie, filas: [], piezas: 0, m3: 0, pt: conPt ? 0 : null };
    g.filas.push(f);
    g.piezas += 1;
    g.m3 = r3(g.m3 + (f.m3 ?? 0));
    if (g.pt != null) g.pt += f.pt ?? 0;
    grupos.set(f.especie, g);
  }
  return [...grupos.values()];
}

/** El plan del día. */
export function planDeAserrio(trozas: readonly PiezaPlan[], o: OpcionesPlan): PlanAserrio {
  const rend = rendimientoValido(o.rendimientoPct);
  const libres = filasLibres(trozas, o.hoy, rend, o.canchas);
  const elegidas = new Set(o.especies ?? []);
  const quitadas = new Set(o.quitadas ?? []);
  const agregadas = new Set(o.agregadas ?? []);
  const deLaEspecie = libres.filter((f) => elegidas.size === 0 || elegidas.has(f.especie));
  const avisos: string[] = [];

  let auto: FilaPlan[] = [];
  let alcanza = true;
  if (o.objetivo.tipo === "pt" && rend == null) {
    alcanza = false;
    avisos.push("Sin rendimiento del libro no se puede armar por pies tablares: elige piezas, m³ o días.");
  } else {
    ({ filas: auto, alcanza } = tomarHastaMeta(deLaEspecie.filter((f) => !quitadas.has(f.id)), o.objetivo));
  }
  const enPlan = new Set(auto.map((f) => f.id));
  const aMano = libres.filter((f) => agregadas.has(f.id) && !enPlan.has(f.id)).map((f) => ({ ...f, aMano: true }));
  const filas = [...auto, ...aMano].sort(compararFilas);
  for (const f of filas) enPlan.add(f.id);

  const grupos = agrupar(filas, rend != null);
  const m3 = r3(filas.reduce((a, f) => a + (f.m3 ?? 0), 0));
  const sinVolumen = filas.filter((f) => f.m3 == null).length;
  const disponibles = { piezas: deLaEspecie.length, m3: r3(deLaEspecie.reduce((a, f) => a + (f.m3 ?? 0), 0)) };

  if (rend == null) avisos.push("Sin corridas con entrada en el libro no hay rendimiento real: los pies tablares no se estiman.");
  if (libres.length === 0) avisos.push("No hay trozas libres en el patio: lo apartado ya tiene corrida.");
  else if (deLaEspecie.length === 0) avisos.push("No quedan libres de esa especie.");
  else if (!alcanza && o.objetivo.tipo !== "pt") {
    const u = OBJETIVO_META[o.objetivo.tipo].unidad;
    avisos.push(`El patio no alcanza para ${fmtMeta(o.objetivo)} ${u}: entran todas las libres que hay (${disponibles.piezas}, ${fmtM3(disponibles.m3)} m³).`);
  }
  if (o.objetivo.tipo === "dias" && auto.length === 0 && deLaEspecie.length > 0) {
    const max = deLaEspecie[0].dias;
    avisos.push(`Ninguna libre lleva ${o.objetivo.valor} días o más${max == null ? "" : `: la más vieja tiene ${max}`}.`);
  }
  if (sinVolumen > 0) avisos.push(`${sinVolumen} sin volumen en su guía: entran por antigüedad pero no suman a la meta.`);
  const sinFecha = filas.filter((f) => f.dias == null).length;
  if (sinFecha > 0) avisos.push(`${sinFecha} sin fecha de ingreso: van al final de la fila.`);

  return {
    grupos,
    total: { piezas: filas.length, m3, pt: rend == null ? null : filas.reduce((a, f) => a + (f.pt ?? 0), 0), sinVolumen },
    disponibles,
    fuera: libres.filter((f) => !enPlan.has(f.id)),
    alcanza,
    rendimientoPct: rend,
    avisos,
  };
}

const fmtMeta = (o: ObjetivoPlan) => (o.tipo === "m3" ? fmtM3(o.valor) : fmtPt(o.valor));

/** «6 de Tornillo y 2 de Cumala · ≈1,874 pt» — la línea grande de la hoja. */
export function resumenDelPlan(plan: PlanAserrio): string {
  if (plan.total.piezas === 0) return "Sin trozas en el plan";
  const partes = plan.grupos.map((g) => `${g.piezas} de ${g.especie}`);
  const quien = partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  const cuanto = plan.total.pt == null ? `${fmtM3(plan.total.m3)} m³` : `≈${fmtPt(plan.total.pt)} pt`;
  return `${quien} · ${cuanto}`;
}
