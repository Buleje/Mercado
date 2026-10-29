// Lee ~/.config/buleje-mcp/credenciales.json (contrato §2). Validación manual, sin dependencias.
// Nunca devuelve la clave en un mensaje de error.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const RUTA_CREDENCIALES = join(homedir(), ".config", "buleje-mcp", "credenciales.json");
export const BASE_POR_DEFECTO = "http://localhost:3000";

/** @typedef {{ slug: string, usuario: string, clave: string, tenantId?: string }} CredencialNegocio */
/** @typedef {{ base: string, porDefecto: string, seco: boolean, negocios: Record<string, CredencialNegocio> }} Config */

export class ErrorCredenciales extends Error {}

const texto = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Valida un objeto ya parseado. Devuelve {ok, config} o {ok:false, errores}.
 * @param {unknown} crudo
 */
export function validarConfig(crudo) {
  const errores = [];
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return { ok: false, errores: ["el archivo no es un objeto"] };
  const c = /** @type {Record<string, any>} */ (crudo);
  const base = c.base === undefined ? BASE_POR_DEFECTO : c.base;
  if (!texto(base) || !/^https?:\/\/[^/\s]+$/.test(base.replace(/\/+$/, ""))) errores.push("base: debe ser http(s)://host[:puerto]");
  const negocios = c.negocios;
  if (!negocios || typeof negocios !== "object" || Array.isArray(negocios) || Object.keys(negocios).length === 0) {
    errores.push("negocios: falta al menos uno");
  } else {
    for (const [k, v] of Object.entries(negocios)) {
      if (!v || typeof v !== "object") { errores.push(`negocios.${k}: no es un objeto`); continue; }
      for (const campo of ["slug", "usuario", "clave"]) if (!texto(/** @type {any} */ (v)[campo])) errores.push(`negocios.${k}.${campo}: falta`);
    }
  }
  const nombres = negocios && typeof negocios === "object" ? Object.keys(negocios) : [];
  const porDefecto = c.porDefecto ?? nombres[0];
  if (nombres.length && !nombres.includes(porDefecto)) errores.push(`porDefecto: «${porDefecto}» no está en negocios`);
  if (errores.length) return { ok: false, errores };
  return {
    ok: true,
    config: { base: String(base).replace(/\/+$/, ""), porDefecto, seco: c.seco === undefined ? true : c.seco !== false, negocios },
  };
}

/**
 * @param {{ ruta?: string, leer?: (ruta: string) => string }} [op]
 * @returns {Config}
 */
export function leerCredenciales(op = {}) {
  const ruta = op.ruta ?? RUTA_CREDENCIALES;
  let crudo;
  try { crudo = JSON.parse((op.leer ?? ((r) => readFileSync(r, "utf8")))(ruta)); }
  catch (e) {
    const falta = /** @type {any} */ (e)?.code === "ENOENT";
    throw new ErrorCredenciales(falta ? `No hay credenciales en ${ruta}. Correr: node tools/mcp-buleje/configurar.mjs` : `No se pudo leer ${ruta} (¿JSON roto?)`);
  }
  const r = validarConfig(crudo);
  if (!r.ok) throw new ErrorCredenciales(`Credenciales inválidas en ${ruta}: ${r.errores.join("; ")}`);
  return /** @type {Config} */ (r.config);
}

/** @param {Config} config @param {string} [negocio] */
export function credencialDe(config, negocio) {
  const nombre = negocio || config.porDefecto;
  const cred = config.negocios[nombre];
  if (!cred) throw new ErrorCredenciales(`Negocio «${nombre}» desconocido. Disponibles: ${Object.keys(config.negocios).join(", ")}`);
  return { nombre, cred };
}
