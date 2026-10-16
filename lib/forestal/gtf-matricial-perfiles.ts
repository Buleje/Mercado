/**
 * gtf-matricial-perfiles — la calibración de CADA impresora (16-10).
 *
 * Brandon prepara la guía en la oficina y la imprime en el monte: dos
 * matriciales que corren el papel distinto. Un perfil = una impresora (o un
 * camino: «Monte (directo)» por ESC/P no corre igual que el PDF por un driver).
 *
 *   · «Oficina» (`PERFIL_OFICINA_ID`) es lo que ya existía: su corrimiento es
 *     el de CADA hoja (`hoja.offsetXMm/offsetYMm`, por titular y por hoja), así
 *     que lo guardado antes imprime igual. De su perfil sólo cuenta la escala.
 *   · Los demás llevan su corrimiento y su escala, que van EN LUGAR de los de
 *     la hoja: la impresora del monte es la misma para la guía y la lista.
 *
 * Transformación (mm, origen arriba a la izquierda del papel):
 *   X = x · escalaX + corrimientoX,  Y = y · escalaY + corrimientoY.
 * La letra no se escala: la matricial imprime su paso fijo.
 *
 * Guardado: dentro del almacén del talonario (`gtf-talonario:<tenantId>`,
 * campo `perfiles`). Sin `perfiles` (lo guardado antes) = Oficina + Monte
 * de fábrica: «Monte» es el perfil por defecto de la cola del monte.
 * Funciones puras: la DB class las corre dentro del bloqueo de la clave.
 */

import { z } from "zod";
import { PERFIL_OFICINA_ID, type PerfilImpresora } from "./gtf-salida-tipos";

export { PERFIL_OFICINA_ID };

/** El que usa la cola del monte cuando nadie eligió otro. */
export const PERFIL_MONTE_ID = "monte";
/** Tope de impresoras por tenant: el KV no es una tabla. */
export const MAX_PERFILES = 20;
/** Lo mismo que acepta el corrimiento de la hoja. */
export const CORRIMIENTO_MAX_MM = 50;
/** Una matricial que estira más de un 10 % está rota, no descalibrada. */
export const ESCALA_MIN = 0.9;
export const ESCALA_MAX = 1.1;
const NOMBRE_MAX = 60;

export type PerfilesTalonario = Record<string, PerfilImpresora>;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const acotar = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

export const perfilOficina = (): PerfilImpresora => ({
  id: PERFIL_OFICINA_ID, nombre: "Oficina", corrimientoXmm: 0, corrimientoYmm: 0, escalaX: 1, escalaY: 1,
});
export const perfilMonte = (): PerfilImpresora => ({
  id: PERFIL_MONTE_ID, nombre: "Monte", corrimientoXmm: 0, corrimientoYmm: 0, escalaX: 1, escalaY: 1,
});

/** Sin prototipo: un id «__proto__» guardado es una impresora más, no un atajo al objeto. */
const vacio = (): PerfilesTalonario => Object.create(null) as PerfilesTalonario;

export function perfilesDeFabrica(): PerfilesTalonario {
  const p = vacio();
  p[PERFIL_OFICINA_ID] = perfilOficina();
  p[PERFIL_MONTE_ID] = perfilMonte();
  return p;
}

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/;

function normalizarPerfil(id: string, raw: unknown): PerfilImpresora | null {
  if (!ID_VALIDO.test(id) || !esObjeto(raw)) return null;
  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().slice(0, NOMBRE_MAX) : "";
  if (!nombre) return null;
  const oficina = id === PERFIL_OFICINA_ID;
  const a = raw.actualizado;
  return {
    id,
    nombre,
    corrimientoXmm: oficina ? 0 : r2(acotar(raw.corrimientoXmm, -CORRIMIENTO_MAX_MM, CORRIMIENTO_MAX_MM, 0)),
    corrimientoYmm: oficina ? 0 : r2(acotar(raw.corrimientoYmm, -CORRIMIENTO_MAX_MM, CORRIMIENTO_MAX_MM, 0)),
    escalaX: r4(acotar(raw.escalaX, ESCALA_MIN, ESCALA_MAX, 1)),
    escalaY: r4(acotar(raw.escalaY, ESCALA_MIN, ESCALA_MAX, 1)),
    ...(esObjeto(a) && typeof a.en === "string" && typeof a.por === "string" ? { actualizado: { en: a.en, por: a.por } } : {}),
  };
}

/** Lo guardado; sin nada guardado, Oficina + Monte. Oficina está siempre. */
export function normalizarPerfiles(raw: unknown): PerfilesTalonario {
  if (!esObjeto(raw)) return perfilesDeFabrica();
  const out = vacio();
  out[PERFIL_OFICINA_ID] = (Object.hasOwn(raw, PERFIL_OFICINA_ID) && normalizarPerfil(PERFIL_OFICINA_ID, raw[PERFIL_OFICINA_ID])) || perfilOficina();
  for (const [id, v] of Object.entries(raw)) {
    if (id === PERFIL_OFICINA_ID || Object.keys(out).length >= MAX_PERFILES) continue;
    const p = normalizarPerfil(id, v);
    if (p) out[id] = p;
  }
  return out;
}

/** Oficina primero; las demás por nombre. */
export function listaPerfiles(perfiles: PerfilesTalonario): PerfilImpresora[] {
  const otros = Object.values(perfiles)
    .filter((p) => p.id !== PERFIL_OFICINA_ID)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const oficina = Object.hasOwn(perfiles, PERFIL_OFICINA_ID) ? perfiles[PERFIL_OFICINA_ID] : perfilOficina();
  return [oficina, ...otros];
}

export function buscarPerfil(perfiles: PerfilesTalonario, id: string): PerfilImpresora | null {
  return Object.hasOwn(perfiles, id) ? perfiles[id] : null;
}

// ── Lo que manda el modal ───────────────────────────────────────────────────
const mm = z.number().finite().min(-CORRIMIENTO_MAX_MM).max(CORRIMIENTO_MAX_MM);
const escala = z.number().finite().min(ESCALA_MIN).max(ESCALA_MAX);
const nombre = z.string().trim().min(1).max(NOMBRE_MAX);
const id = z.string().trim().min(1).max(64);

export const perfilAltaSchema = z
  .object({ nombre, corrimientoXmm: mm.optional(), corrimientoYmm: mm.optional(), escalaX: escala.optional(), escalaY: escala.optional() })
  .strict();
export const perfilCambioSchema = z
  .object({ id, nombre: nombre.optional(), corrimientoXmm: mm.optional(), corrimientoYmm: mm.optional(), escalaX: escala.optional(), escalaY: escala.optional() })
  .strict();
export const perfilBajaSchema = z.object({ id }).strict();

export type PerfilAlta = z.infer<typeof perfilAltaSchema>;
export type PerfilCambio = z.infer<typeof perfilCambioSchema>;

export type ErrorPerfil = "no-existe" | "repetido" | "tope" | "oficina";
export type ResultadoPerfil = { ok: true; perfiles: PerfilesTalonario; perfil: PerfilImpresora | null } | { ok: false; error: ErrorPerfil };

/** Lo que lee quien lo pidió (tuteo, sin código). */
export const MENSAJE_ERROR_PERFIL: Record<ErrorPerfil, string> = {
  "no-existe": "Esa impresora ya no está: elige otra.",
  repetido: "Ya hay una impresora con ese nombre.",
  tope: `Ya hay ${MAX_PERFILES} impresoras: borra una que no uses.`,
  oficina: "Oficina no se borra, y su corrimiento es el de cada hoja (X/Y de la hoja).",
};

const mismoNombre = (a: string, b: string): boolean => a.trim().localeCompare(b.trim(), "es", { sensitivity: "base" }) === 0;

/** «Monte – Epson LX-350» → «monte-epson-lx-350»; si ya existe, «-2», «-3»… */
export function idParaNombre(perfiles: PerfilesTalonario, n: string): string {
  const base =
    n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "impresora";
  let candidato = base;
  for (let i = 2; Object.hasOwn(perfiles, candidato); i++) candidato = `${base}-${i}`;
  return candidato;
}

const copia = (perfiles: PerfilesTalonario): PerfilesTalonario => Object.assign(vacio(), perfiles);

export function agregarPerfil(perfiles: PerfilesTalonario, datos: PerfilAlta, actualizado: { en: string; por: string }): ResultadoPerfil {
  if (Object.keys(perfiles).length >= MAX_PERFILES) return { ok: false, error: "tope" };
  if (Object.values(perfiles).some((p) => mismoNombre(p.nombre, datos.nombre))) return { ok: false, error: "repetido" };
  const perfil: PerfilImpresora = {
    id: idParaNombre(perfiles, datos.nombre),
    nombre: datos.nombre.trim(),
    corrimientoXmm: r2(datos.corrimientoXmm ?? 0),
    corrimientoYmm: r2(datos.corrimientoYmm ?? 0),
    escalaX: r4(datos.escalaX ?? 1),
    escalaY: r4(datos.escalaY ?? 1),
    actualizado,
  };
  const out = copia(perfiles);
  out[perfil.id] = perfil;
  return { ok: true, perfiles: out, perfil };
}

/** Renombrar o calibrar. Oficina se renombra y escala, pero su corrimiento es el de la hoja. */
export function cambiarPerfil(perfiles: PerfilesTalonario, c: PerfilCambio, actualizado: { en: string; por: string }): ResultadoPerfil {
  const previo = buscarPerfil(perfiles, c.id);
  if (!previo) return { ok: false, error: "no-existe" };
  if (c.id === PERFIL_OFICINA_ID && (c.corrimientoXmm !== undefined || c.corrimientoYmm !== undefined)) return { ok: false, error: "oficina" };
  if (c.nombre !== undefined && Object.values(perfiles).some((p) => p.id !== c.id && mismoNombre(p.nombre, c.nombre ?? ""))) {
    return { ok: false, error: "repetido" };
  }
  const perfil: PerfilImpresora = {
    ...previo,
    ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
    ...(c.corrimientoXmm !== undefined ? { corrimientoXmm: r2(c.corrimientoXmm) } : {}),
    ...(c.corrimientoYmm !== undefined ? { corrimientoYmm: r2(c.corrimientoYmm) } : {}),
    ...(c.escalaX !== undefined ? { escalaX: r4(c.escalaX) } : {}),
    ...(c.escalaY !== undefined ? { escalaY: r4(c.escalaY) } : {}),
    actualizado,
  };
  const out = copia(perfiles);
  out[c.id] = perfil;
  return { ok: true, perfiles: out, perfil };
}

export function borrarPerfil(perfiles: PerfilesTalonario, idBorrar: string): ResultadoPerfil {
  if (idBorrar === PERFIL_OFICINA_ID) return { ok: false, error: "oficina" };
  if (!buscarPerfil(perfiles, idBorrar)) return { ok: false, error: "no-existe" };
  const out = copia(perfiles);
  delete out[idBorrar];
  return { ok: true, perfiles: out, perfil: null };
}

// ── Del papel a la impresora ────────────────────────────────────────────────
export interface Transformacion {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  /** Para rotular la prueba: «Oficina · X 1,5 · Y −2». */
  perfil: { id: string; nombre: string };
}

/** Oficina (o sin perfil): el corrimiento de la hoja. Otra impresora: el suyo. */
export function transformacionDe(hoja: { offsetXMm: number; offsetYMm: number }, perfil: PerfilImpresora | null): Transformacion {
  const oficina = !perfil || perfil.id === PERFIL_OFICINA_ID;
  return {
    dx: oficina ? hoja.offsetXMm : perfil.corrimientoXmm,
    dy: oficina ? hoja.offsetYMm : perfil.corrimientoYmm,
    sx: perfil?.escalaX ?? 1,
    sy: perfil?.escalaY ?? 1,
    perfil: perfil ? { id: perfil.id, nombre: perfil.nombre } : { id: PERFIL_OFICINA_ID, nombre: "Oficina" },
  };
}

export const aplicarX = (t: Transformacion, x: number): number => x * t.sx + t.dx;
export const aplicarY = (t: Transformacion, y: number): number => y * t.sy + t.dy;

/**
 * La escala como la escribe la persona en Calibrar: 1,004 → «100,4 %». Con dos
 * decimales salía «escala 1 × 1» para un perfil en 100,4 % (16-10, curl en main).
 */
export const escalaPct = (v: number): string => `${String(Math.round(v * 1000) / 10).replace(".", ",")} %`;
