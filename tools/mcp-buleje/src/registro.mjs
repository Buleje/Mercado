// Registro jsonl de llamadas (contrato §3.5): una línea por llamada, rotación mensual, con redacción.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DIR_ESTADO = join(homedir(), ".local", "state", "buleje-mcp");
const CLAVE_SECRETA = /clave|password|passwd|token|cookie|authorization|secret|dni|telefono|phone|celular/i;
const DIGITOS_PERSONALES = /\b\d{8,11}\b/g; // DNI (8) y celular (9) metidos en rutas o textos

/** @param {unknown} v @param {string} [clave] */
export function redactar(v, clave = "") {
  if (clave && CLAVE_SECRETA.test(clave)) return "***";
  if (typeof v === "string") return v.replace(DIGITOS_PERSONALES, "***");
  if (Array.isArray(v)) return v.map((x) => redactar(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactar(x, k)]));
  return v;
}

/** @param {Date} d */
export const archivoDelMes = (d, dir = DIR_ESTADO) => join(dir, `llamadas-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.jsonl`);

/**
 * Anota un evento. Nunca lanza: el registro no puede tumbar una herramienta.
 * El `token` de una propuesta se guarda recortado a 6 caracteres.
 * @param {Record<string, unknown>} evento
 * @param {{ dir?: string, ahora?: () => Date }} [op]
 */
export function anotar(evento, op = {}) {
  try {
    const ahora = (op.ahora ?? (() => new Date()))();
    const dir = op.dir ?? DIR_ESTADO;
    const { token, ...resto } = evento;
    const linea = { ts: ahora.toISOString(), ...redactar(resto) /** @type {object} */, ...(typeof token === "string" ? { token: token.slice(0, 6) } : {}) };
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(archivoDelMes(ahora, dir), JSON.stringify(linea) + "\n", { mode: 0o600 });
    return linea;
  } catch {
    return null;
  }
}

/** Últimas N llamadas del mes en curso (recurso buleje://registro/hoy). */
export function ultimas(n = 50, op = {}) {
  const ahora = (op.ahora ?? (() => new Date()))();
  const f = archivoDelMes(ahora, op.dir ?? DIR_ESTADO);
  if (!existsSync(f)) return [];
  const lineas = readFileSync(f, "utf8").split("\n").filter(Boolean).slice(-n);
  return lineas.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
