/**
 * plantacion-libro — el trámite de ACTUALIZACIÓN del registro (RNPF) toma lo
 * que el Libro TH ya sabe de esa plantación (ADR-459, ronda 3).
 *
 * Hoy la actualización pide la producción por especie a mano, y el libro ya
 * tiene, por especie del plan de plantación, cuánto se taló y cuánto salió con
 * guía. Acá viven las tres reglas, puras (sin fetch ni React):
 *
 *  1. **Qué plantación del libro es la del trámite.** Por código: el «Código de
 *     Plantación / N° de Registro» del trámite contra el N° del plan
 *     (`planNumber`) o su título habilitante, tramo a tramo —«19-SEC/REG-PLT-
 *     2025-096» y «019-SEC-REG-PLT-2025-96» son el mismo papel (memoria
 *     «N° de guía tramo a tramo»: compararlo exacto duplicaba la madera)—. Dos
 *     candidatas = ambigua: se elige, nunca la primera.
 *  2. **Qué especie del trámite es cuál del libro.** `resolverEspecie`: por la
 *     clave del nombre común o, si los dos lo traen, por el científico — la
 *     MISMA regla con la que T6/T7 y el saldo reconocen la especie del registro.
 *  3. **Qué se llena y qué no.** La producción de una plantación es lo que dio
 *     al cosecharla: lo TALADO, en m³ de madera rolliza. Lo despachado con guía
 *     es una parte de eso (lo que ya salió del predio) y se muestra al lado;
 *     tomarlo dejaría fuera la madera talada que sigue en el patio. Nunca se
 *     pisa lo que la persona escribió (mismo criterio que `copiarDePlanPrevio`):
 *     se devuelve qué se completó y qué se dejó como estaba, y por qué.
 */

import { claveEspecie, resolverEspecie } from "./loth-constants";
import { esPlanDePlantacion } from "./loth-poa";
import { cascadaDelPlan, type FilaBalanceCascada } from "./loth-saldo-cascada";
import { buscarEnCatalogo } from "./plantacion-catalogo";
import type { BloqueInput, EspecieBloqueInput } from "./plantacion-tramite";

/** 0,0005 m³ = medio litro: por debajo, el libro «no tiene tala» de esa especie. */
const TOLERANCIA_M3 = 0.0005;
/** La unidad con la que se llena la producción (la misma que ofrece el formulario). */
export const UNIDAD_M3 = "m³";

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── 1. Qué plantación del libro ─────────────────────────────────────────────

/** Lo que hace falta de un plan del Libro TH (`GET /api/admin/forestal/plan`). */
export interface PlanDelLibro {
  id: string;
  planType?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  titularName?: string | null;
  alias?: string | null;
  estado?: string | null;
}

/**
 * La llave de un código de registro: sus tramos (separados por guion, barra,
 * punto o espacio), en mayúsculas y los numéricos por su valor. `null` = no hay
 * código. «19-SEC/REG-PLT-2025-096» y «019 sec reg plt 2025 96» dan la misma.
 */
export function claveCodigoPlantacion(texto: string | null | undefined): string | null {
  const tramos = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[\s\-/._]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t));
  return tramos.length ? tramos.join("-") : null;
}

/** ¿Es el mismo código de registro? Tramo a tramo (`claveCodigoPlantacion`). */
export function mismoCodigoPlantacion(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = claveCodigoPlantacion(a);
  return ka != null && ka === claveCodigoPlantacion(b);
}

/** Sólo las plantaciones del libro (por tipo o por el «REG-PLT» de su código). */
export function plantacionesDelLibro<T extends PlanDelLibro>(planes: readonly T[]): T[] {
  return planes.filter((p) => esPlanDePlantacion(p));
}

export type SugerenciaPlan =
  | { planId: string; motivo: "codigo" | "unica" }
  | { planId: null; motivo: "ambigua" | "ninguna" };

/**
 * La plantación del libro que corresponde al trámite. Por código si coincide
 * con UNA; si el trámite todavía NO tiene código y el libro tiene una sola
 * plantación, ésa (se dice que es por ser la única). Con código que no coincide
 * con ninguna → `ninguna`. Dos que coinciden → `ambigua`.
 */
export function sugerirPlanDelTramite(codigo: string | null | undefined, planes: readonly PlanDelLibro[]): SugerenciaPlan {
  const plantas = plantacionesDelLibro(planes);
  if (claveCodigoPlantacion(codigo)) {
    const coinciden = plantas.filter((p) => mismoCodigoPlantacion(codigo, p.planNumber) || mismoCodigoPlantacion(codigo, p.tituloHabilitante));
    if (coinciden.length === 1) return { planId: coinciden[0].id, motivo: "codigo" };
    if (coinciden.length > 1) return { planId: null, motivo: "ambigua" };
    /* El trámite TIENE código y ninguna plantación lo lleva: proponer «la única»
       llenaría la producción con lo talado de OTRA plantación (revisión ADR-459). */
    return { planId: null, motivo: "ninguna" };
  }
  if (plantas.length === 1) return { planId: plantas[0].id, motivo: "unica" };
  return { planId: null, motivo: "ninguna" };
}

/** «19-SEC/REG-PLT-2025-096 · Comunidad X (Bolainal)» — cómo se reconoce en la lista. */
export function etiquetaPlanDelLibro(p: PlanDelLibro): string {
  const codigo = p.planNumber?.trim() || p.tituloHabilitante?.trim() || "Sin código";
  const titular = p.titularName?.trim();
  const alias = p.alias?.trim();
  return [codigo, titular].filter(Boolean).join(" · ") + (alias ? ` (${alias})` : "");
}

// ─── 2. Las especies del libro ───────────────────────────────────────────────

/** Una especie del registro, como la devuelve `GET /plan?planId=`. */
export interface EspecieDelRegistroLibro {
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean;
  volumenAutorizadoM3?: string | number | null;
  arbolesAutorizados?: number | null;
  anioInstalacion?: number | null;
}

/** El saldo del plan (`GET /plan?balance=`): por especie del registro + lo que no está en él. */
export interface BalanceDelLibro {
  rows: FilaBalanceCascada[];
  sinRegistrar?: { species: string; taladoM3: number; trozadoM3: number; movilizadoM3: number }[];
}

/** Una especie que el Libro TH conoce en ese plan, con lo que hizo con ella. */
export interface EspecieDelLibro {
  /** Nombre común sin el científico entre paréntesis. */
  comun: string;
  cientifico: string | null;
  cites: boolean;
  anioInstalacion: number | null;
  arboles: number | null;
  /** `false` = el libro la taló o movió pero el registro no la tiene. */
  registrada: boolean;
  registradoM3: number;
  taladoM3: number;
  despachadoM3: number;
  /** registrado − talado; `null` si no está en el registro (no hay base). */
  enPieM3: number | null;
}

/** «Tornillo (Cedrelinga catenaeformis)» → común «Tornillo», científico «Cedrelinga catenaeformis». */
function partirNombre(nombre: string): { comun: string; cientifico: string | null } {
  const dentro = /\(([^)]+)\)/.exec(nombre)?.[1]?.trim() || null;
  const comun = nombre.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim() || nombre.trim();
  return { comun, cientifico: dentro };
}

/**
 * Las especies del plan con su cascada (la MISMA cuenta que «Registro y saldo»)
 * y, después, las que el libro movió sin estar registradas.
 */
export function especiesDelLibro(
  species: readonly EspecieDelRegistroLibro[],
  balance: BalanceDelLibro | null,
): EspecieDelLibro[] {
  const cascada = cascadaDelPlan(balance?.rows ?? []);
  const porClave = new Map(cascada.especies.map((c) => [claveEspecie(c.especie), c]));
  const registradas: EspecieDelLibro[] = species.map((s) => {
    const c = porClave.get(claveEspecie(s.speciesCommon));
    const { comun, cientifico } = partirNombre(s.speciesCommon);
    const registradoM3 = c ? c.baseM3 : r4(num(s.volumenAutorizadoM3));
    const taladoM3 = c?.taladoM3 ?? 0;
    return {
      comun,
      cientifico: s.speciesScientific?.trim() || cientifico,
      cites: Boolean(s.cites),
      anioInstalacion: s.anioInstalacion ?? null,
      arboles: s.arbolesAutorizados ?? null,
      registrada: true,
      registradoM3,
      taladoM3,
      despachadoM3: c?.despachadoM3 ?? 0,
      enPieM3: r4(registradoM3 - taladoM3),
    };
  });
  const sueltas: EspecieDelLibro[] = (balance?.sinRegistrar ?? [])
    .filter((s) => s.taladoM3 + s.movilizadoM3 > TOLERANCIA_M3)
    .map((s) => {
      const { comun, cientifico } = partirNombre(s.species);
      return {
        comun,
        cientifico,
        cites: false,
        anioInstalacion: null,
        arboles: null,
        registrada: false,
        registradoM3: 0,
        taladoM3: r4(s.taladoM3),
        despachadoM3: r4(s.movilizadoM3),
        enPieM3: null,
      };
    });
  return [...registradas, ...sueltas];
}

// ─── 3. Qué se llena en el trámite ───────────────────────────────────────────

/** Número del bloque como lo ve la persona («Bloque 2»), aunque falte `numero`. */
const numeroDe = (b: BloqueInput, i: number): number => b.numero || i + 1;

/** ¿La unidad escrita es m³? Vacía cuenta como «todavía no eligió». */
export function esUnidadM3(unidad: string | null | undefined): boolean {
  return /^m\s*(3|³)$/i.test((unidad ?? "").trim());
}

/** Qué se va a hacer (o se hizo) con cada especie del libro en el trámite. */
export type Destino =
  | { tipo: "completar"; bloque: number; m3: number }
  | { tipo: "coincide"; bloque: number }
  | { tipo: "ya_tiene"; bloque: number; cantidad: number; unidad: string | null }
  | { tipo: "otra_unidad"; bloque: number; unidad: string }
  | { tipo: "repartir"; bloques: number[] }
  | { tipo: "sin_tala" }
  | { tipo: "falta" };

export interface PlanDeLlenado {
  /** Una entrada por especie del libro, en el mismo orden. */
  destinos: { especie: EspecieDelLibro; destino: Destino }[];
  /** Cuántas producciones se completarían. */
  aCompletar: number;
}

interface Ubicacion {
  bi: number;
  ei: number;
}

/** Dónde aparece cada especie del libro en los bloques del trámite. */
function ubicar(bloques: readonly BloqueInput[], libro: readonly EspecieDelLibro[]): Map<EspecieDelLibro, Ubicacion[]> {
  const reconocibles = libro.map((l) => ({ speciesCommon: l.comun, speciesScientific: l.cientifico, ref: l }));
  const donde = new Map<EspecieDelLibro, Ubicacion[]>();
  bloques.forEach((b, bi) =>
    b.especies.forEach((e, ei) => {
      const hit = resolverEspecie(reconocibles, e.nombreComun, e.nombreCientifico);
      if (!hit) return;
      donde.set(hit.ref, [...(donde.get(hit.ref) ?? []), { bi, ei }]);
    }),
  );
  return donde;
}

/**
 * Qué haría «Traer lo del Libro TH» con cada especie, sin tocar nada todavía:
 * la vista lo muestra antes y el botón lo aplica con `aplicarLlenado`.
 *
 *  · En UN bloque, vacía, con tala → se completa con lo talado (m³).
 *  · Con producción ya escrita → no se toca (igual al libro: «coincide»).
 *  · Con otra unidad escrita (árboles, kg…) → no se toca: serían m³ con rótulo de otra cosa.
 *  · En VARIOS bloques → no se llena: el libro no sabe de qué bloque salió cada m³.
 *  · Sin tala en el libro → queda vacía (vacío = no se sabe; nunca un 0 inventado).
 *  · Que el trámite no tiene → `falta`, para agregarla con un clic.
 */
export function planDeLlenado(bloques: readonly BloqueInput[], libro: readonly EspecieDelLibro[]): PlanDeLlenado {
  const donde = ubicar(bloques, libro);
  let aCompletar = 0;
  const destinos = libro.map((especie) => {
    const lugares = donde.get(especie) ?? [];
    const destino = destinoDe(bloques, especie, lugares);
    if (destino.tipo === "completar") aCompletar += 1;
    return { especie, destino };
  });
  return { destinos, aCompletar };
}

function destinoDe(bloques: readonly BloqueInput[], especie: EspecieDelLibro, lugares: Ubicacion[]): Destino {
  if (lugares.length === 0) return { tipo: "falta" };
  const vacias = lugares.filter(({ bi, ei }) => bloques[bi].especies[ei].produccionCantidad == null);
  if (lugares.length > 1) {
    if (vacias.length === 0) {
      const { bi, ei } = lugares[0];
      const e = bloques[bi].especies[ei];
      return { tipo: "ya_tiene", bloque: numeroDe(bloques[bi], bi), cantidad: num(e.produccionCantidad), unidad: e.produccionUnidad ?? null };
    }
    return especie.taladoM3 > TOLERANCIA_M3
      ? { tipo: "repartir", bloques: lugares.map(({ bi }) => numeroDe(bloques[bi], bi)) }
      : { tipo: "sin_tala" };
  }
  const { bi, ei } = lugares[0];
  const e = bloques[bi].especies[ei];
  const bloque = numeroDe(bloques[bi], bi);
  if (e.produccionCantidad != null) {
    return Math.abs(num(e.produccionCantidad) - especie.taladoM3) <= TOLERANCIA_M3 && esUnidadM3(e.produccionUnidad)
      ? { tipo: "coincide", bloque }
      : { tipo: "ya_tiene", bloque, cantidad: num(e.produccionCantidad), unidad: e.produccionUnidad ?? null };
  }
  if (especie.taladoM3 <= TOLERANCIA_M3) return { tipo: "sin_tala" };
  if (e.produccionUnidad?.trim() && !esUnidadM3(e.produccionUnidad)) return { tipo: "otra_unidad", bloque, unidad: e.produccionUnidad.trim() };
  return { tipo: "completar", bloque, m3: especie.taladoM3 };
}

/**
 * Los bloques con la producción completada donde `planDeLlenado` dijo
 * «completar». Lo demás queda idéntico (mismos objetos): nada que la persona
 * escribió cambia.
 */
export function aplicarLlenado(bloques: readonly BloqueInput[], libro: readonly EspecieDelLibro[]): BloqueInput[] {
  const donde = ubicar(bloques, libro);
  const cambios = new Map<string, number>();
  for (const especie of libro) {
    const lugares = donde.get(especie) ?? [];
    const d = destinoDe(bloques, especie, lugares);
    if (d.tipo === "completar") cambios.set(`${lugares[0].bi}:${lugares[0].ei}`, d.m3);
  }
  if (cambios.size === 0) return [...bloques];
  return bloques.map((b, bi) => {
    if (!b.especies.some((_, ei) => cambios.has(`${bi}:${ei}`))) return b;
    return {
      ...b,
      especies: b.especies.map((e, ei) => {
        const m3 = cambios.get(`${bi}:${ei}`);
        return m3 == null ? e : { ...e, produccionCantidad: m3, produccionUnidad: UNIDAD_M3 };
      }),
    };
  });
}

/**
 * La especie del libro como fila nueva del trámite: nombre, científico (o el
 * del catálogo), CITES, año de instalación y N° de plantas del registro, y lo
 * talado como producción. El mes de instalación no lo sabe el libro: queda
 * vacío y la revisión lo pide.
 */
export function especieNuevaDelLibro(l: EspecieDelLibro): EspecieBloqueInput {
  const catalogo = buscarEnCatalogo(l.comun);
  const conTala = l.taladoM3 > TOLERANCIA_M3;
  return {
    nombreComun: l.comun,
    nombreCientifico: l.cientifico ?? catalogo?.cientifico ?? null,
    cites: l.cites || catalogo?.cites === true,
    anioInstalacion: l.anioInstalacion,
    cantidad: l.arboles,
    produccionCantidad: conTala ? l.taladoM3 : null,
    produccionUnidad: conTala ? UNIDAD_M3 : null,
  };
}

/**
 * Agrega especies del libro al bloque elegido (por posición). Sin bloques,
 * crea el bloque 1: el libro no tiene vértices, los pide el paso del mapa.
 */
export function agregarDelLibro(bloques: readonly BloqueInput[], especies: readonly EspecieDelLibro[], bloque: number): BloqueInput[] {
  const nuevas = especies.map(especieNuevaDelLibro);
  if (nuevas.length === 0) return [...bloques];
  if (bloques.length === 0) return [{ numero: 1, vertices: [], especies: nuevas }];
  const destino = bloque >= 0 && bloque < bloques.length ? bloque : 0;
  return bloques.map((b, i) => (i === destino ? { ...b, especies: [...b.especies, ...nuevas] } : b));
}
