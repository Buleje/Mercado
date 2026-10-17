/**
 * loth-alcance-geo.ts — el área y la cartografía del Libro TH, POR PERMISO (ADR-462, 02-10-2026).
 *
 * El área (`loth-parcela:{tid}`) y la cartografía (`loth-cartografia:{tid}`) son un
 * documento JSON en `PlatformSetting`. Cada plan tiene el suyo en `…:{tid}:{planId}`;
 * la clave sin plan es «del negocio». Sin cambio de schema.
 *
 * Lectura con el MISMO criterio que las líneas del libro (`cumplePermiso`):
 *   · sin query            → la del negocio (los clientes viejos no cambian);
 *   · `planId=sin-plan`    → la del negocio;
 *   · `planId=X&solo=1`    → sólo la de X;
 *   · `planId=X`           → la de X; si X no tiene, la del negocio (heredada);
 *   · `todos=1`            → la del negocio + la de cada plan vivo.
 *
 * PURO e isomorfo.
 */

import { cumplePermiso, leerFiltroPermiso, type FiltroPermiso } from "./loth-filtro-permiso";

export const PLAN_ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/** El valor que significa «sin permiso» en la query: nunca es un id de plan. */
export const GEO_SIN_PLAN = "sin-plan";

/**
 * Clave del KV: sin plan → `{prefijo}{tid}`; con plan → `{prefijo}{tid}:{planId}`.
 * `prefijo` ya trae su separador final (`"loth-parcela:"`).
 */
export function claveGeo(prefijo: string, tenantId: string, planId?: string | null): string {
  if (!tenantId) throw new Error("tenantId is required");
  if (planId == null || planId === "") return `${prefijo}${tenantId}`;
  if (planId === GEO_SIN_PLAN || !PLAN_ID_VALIDO.test(planId)) throw new Error("planId no válido");
  return `${prefijo}${tenantId}:${planId}`;
}

export type AlcanceGeo =
  | { tipo: "negocio" }
  | { tipo: "todos" }
  /** `heredar`: si el plan no tiene la suya, se muestra la del negocio (marcada). */
  | { tipo: "plan"; planId: string; heredar: boolean };

/** El alcance de lectura que pide un filtro de permiso (el mismo del libro). */
export function alcanceDeLectura(filtro: FiltroPermiso | null, todos = false): AlcanceGeo {
  if (todos) return { tipo: "todos" };
  if (!filtro || filtro.tipo === "sin-plan") return { tipo: "negocio" };
  // Heredar la del negocio = «las líneas sin plan también entran» (cumplePermiso).
  return { tipo: "plan", planId: filtro.planId, heredar: cumplePermiso(null, filtro) };
}

export type LecturaAlcanceGeo = { ok: true; alcance: AlcanceGeo } | { ok: false; mensaje: string };

/** Lee `planId` / `solo` / `todos` de la query de una ruta. */
export function leerAlcanceGeo(sp: URLSearchParams): LecturaAlcanceGeo {
  const todos = sp.get("todos") === "1";
  const f = leerFiltroPermiso(sp);
  if (!f.ok) return { ok: false, mensaje: f.mensaje };
  return { ok: true, alcance: alcanceDeLectura(f.filtro, todos) };
}
