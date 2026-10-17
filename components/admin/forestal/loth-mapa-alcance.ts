/**
 * loth-mapa-alcance — de QUÉ permiso son el área y los puntos del mapa del
 * Libro TH (ADR-462, 02-10-2026: «escoger el permiso y aparecerse ahí el mapa…
 * o poner el permiso y crear los puntos»).
 *
 * El permiso de la banda decide el alcance:
 *   · un permiso → su área (o, si todavía no tiene, la del negocio, marcada
 *     «heredada») y SU cartografía; la del negocio se ve como contexto;
 *   · «Líneas sin permiso» → la del negocio, editable como siempre;
 *   · «Todos» → las áreas de todos, cada una con su nombre; no se escribe nada
 *     sin elegir antes en qué permiso.
 *
 * Puro: lo usan los hooks del mapa y su prueba.
 */

import { normalizeCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { buildEudrGeoJson, hasParcela, normalizeParcela, polygonAreaHa, type LothParcela } from "@/lib/forestal/loth-geo";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { formatNumber } from "@/lib/format";

export type AlcanceMapa = { tipo: "negocio" } | { tipo: "todos" } | { tipo: "plan"; planId: string };

/** Del permiso de la banda al alcance. Fuera del libro (`hayLibro` false), el del negocio, como siempre. */
export function alcanceDelPermiso(hayLibro: boolean, planSel: string | null | undefined): AlcanceMapa {
  if (!hayLibro) return { tipo: "negocio" };
  if (planSel == null) return { tipo: "todos" };
  if (planSel === PERMISO_SIN_PLAN) return { tipo: "negocio" };
  return { tipo: "plan", planId: planSel };
}

/** Una clave por alcance: el estado del mapa (borradores incluidos) se guarda bajo ella. */
export const claveAlcance = (a: AlcanceMapa): string => (a.tipo === "plan" ? `plan:${a.planId}` : a.tipo);

/** Lectura del ÁREA: con un permiso, la suya o —si no tiene— la del negocio, marcada `heredada`. */
export function queryParcela(a: AlcanceMapa): string {
  if (a.tipo === "todos") return "?todos=1";
  if (a.tipo === "plan") return `?planId=${encodeURIComponent(a.planId)}`;
  return "";
}

/**
 * Lectura de la CARTOGRAFÍA: con un permiso, SÓLO la suya. Heredar acá sería
 * peor que con el área: el PUT reemplaza el documento entero y copiaría las
 * vías del negocio al permiso con el primer «Guardar». La del negocio se pide
 * aparte y se pinta como contexto.
 */
export function queryCartografia(a: AlcanceMapa): string {
  if (a.tipo === "todos") return "?todos=1";
  if (a.tipo === "plan") return `?planId=${encodeURIComponent(a.planId)}&solo=1`;
  return "";
}

/** El `planId` del cuerpo del PUT; `undefined` = el del negocio (el cuerpo de siempre). */
export const planIdDelPut = (a: AlcanceMapa): string | undefined => (a.tipo === "plan" ? a.planId : undefined);

export interface AreaDePermiso {
  /** `null` = la del negocio. */
  planId: string | null;
  parcela: LothParcela;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const idDePlan = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** `GET …/loth/parcela`, leído sin confiar en la forma. */
export function leerRespuestaParcela(j: unknown): { parcela: LothParcela; heredada: boolean; porPermiso: AreaDePermiso[] } {
  const o = objeto(j);
  const porPermiso = (Array.isArray(o.porPermiso) ? o.porPermiso : []).map((x) => {
    const r = objeto(x);
    return { planId: idDePlan(r.planId), parcela: normalizeParcela(r.parcela) };
  });
  return { parcela: normalizeParcela(o.parcela), heredada: o.heredada === true, porPermiso };
}

/** Con «Todos»: la del negocio (la que se mide y se exporta como siempre) y las de cada permiso, aparte. */
export function areasDeTodos(r: ReturnType<typeof leerRespuestaParcela>): { negocio: LothParcela; otras: AreaDePermiso[] } {
  const delNegocio = r.porPermiso.find((a) => a.planId === null);
  return {
    negocio: delNegocio?.parcela ?? r.parcela,
    otras: r.porPermiso.filter((a) => a.planId !== null && hasParcela(a.parcela)),
  };
}

/** `GET …/loth/cartografia`: la principal y, con «Todos», la de cada permiso. */
export function leerRespuestaCartografia(j: unknown): { cartografia: LothCartografia; porPermiso: { planId: string | null; cartografia: LothCartografia }[] } {
  const o = objeto(j);
  const porPermiso = (Array.isArray(o.porPermiso) ? o.porPermiso : []).map((x) => {
    const r = objeto(x);
    return { planId: idDePlan(r.planId), cartografia: normalizeCartografia(r.cartografia) };
  });
  return { cartografia: normalizeCartografia(o.cartografia), porPermiso };
}

/**
 * Con «Todos», una sola cartografía para MIRAR: la del negocio (su predio, sus
 * accesos) más las referencias y vías de cada permiso. Si el servidor ya las
 * mandó juntas en la principal, no se duplican (se compara el ítem entero: los
 * ids `ref-1-0` se repiten entre permisos).
 */
export function cartografiaDeTodos(r: ReturnType<typeof leerRespuestaCartografia>): LothCartografia {
  const base = r.porPermiso.find((x) => x.planId === null)?.cartografia ?? r.cartografia;
  const otras = r.porPermiso.filter((x) => x.planId !== null).map((x) => x.cartografia);
  const unicos = <T>(lista: T[]): T[] => {
    const vistos = new Set<string>();
    return lista.filter((it) => {
      const k = JSON.stringify(it);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  };
  return {
    ...base,
    referencias: unicos([...base.referencias, ...otras.flatMap((c) => c.referencias)]),
    vias: unicos([...base.vias, ...otras.flatMap((c) => c.vias)]),
  };
}

/** Hay algo sin guardar: lo que se ve no es lo último que confirmó el servidor. */
export const cartoDifiere = (a: LothCartografia, b: LothCartografia): boolean => JSON.stringify(a) !== JSON.stringify(b);

const ha = (n: number, decimales?: number) =>
  `${formatNumber(n, decimales ?? (Math.abs(n) >= 100 ? 0 : { max: 2 }))} ha`;

/**
 * El área dibujada contra la que declara el plan (ADR-462 §6): «Dibujada
 * 812 ha · declarada 850 ha · −38 ha». `delta` = dibujada − declarada.
 */
export function areaVsDeclarada(
  dibujadaHa: number,
  declaradaHa: number | null | undefined,
  decimales?: number,
): { dibujada: string; declarada: string | null; diferencia: string | null; delta: number | null; texto: string } {
  const dibujada = ha(dibujadaHa, decimales);
  if (declaradaHa == null || !Number.isFinite(declaradaHa) || declaradaHa <= 0) {
    return { dibujada, declarada: null, diferencia: null, delta: null, texto: `Dibujada ${dibujada}` };
  }
  const delta = dibujadaHa - declaradaHa;
  const redondo = Number(delta.toFixed(decimales ?? (Math.abs(delta) >= 100 ? 0 : 2)));
  const diferencia = redondo === 0 ? "igual" : `${redondo > 0 ? "+" : "−"}${ha(Math.abs(delta), decimales)}`;
  const declarada = ha(declaradaHa, decimales);
  return { dibujada, declarada, diferencia, delta, texto: `Dibujada ${dibujada} · declarada ${declarada} · ${diferencia}` };
}

/** Un área por permiso con nombre, para el mapa, el GeoJSON y la DDS. */
export interface AreaNombrada {
  planId: string | null;
  nombre: string;
  parcela: LothParcela;
}

export function nombrarAreas(areas: AreaDePermiso[], nombres: Readonly<Record<string, string>>): AreaNombrada[] {
  return areas.map((a) => ({
    planId: a.planId,
    nombre: a.planId ? (nombres[a.planId] ?? "Permiso dado de baja") : "Del negocio (sin permiso)",
    parcela: a.parcela,
  }));
}

type FeatureGeo = ReturnType<typeof buildEudrGeoJson>["features"][number];

/** Las áreas de los permisos como polígonos del GeoJSON de la DDS (con «Todos»). */
export function featuresDeAreas(areas: AreaNombrada[]): FeatureGeo[] {
  return areas
    .filter((a) => hasParcela(a.parcela))
    .map((a) => {
      const ring = a.parcela.vertices.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      return {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: {
          tipo: "area_aprovechamiento",
          permiso: a.nombre,
          planId: a.planId,
          areaHa: Number(polygonAreaHa(a.parcela.vertices).toFixed(4)),
          deforestacionCero: a.parcela.deforestacionCero,
        },
      };
    });
}
