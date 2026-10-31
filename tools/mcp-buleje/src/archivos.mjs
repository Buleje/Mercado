// Qué archivos de la PC puede subir doc_subir (revisión de seguridad 29-10, hallazgo 2: leía cualquier ruta,
// ~/.ssh o ~/.config/buleje-mcp/credenciales.json incluidos). Solo «Semana actual», Descargas de Windows y
// ~/Descargas; realpath (un enlace no saca de ahí); nada oculto ni .env*; hasta 25 MB; se lee con O_NOFOLLOW y
// se sella con sha256 al proponer: si al mandarlo el archivo ya es otro, no sale.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, sep } from "node:path";

export const MAX_ARCHIVO_BYTES = 25 * 1024 * 1024;

/** Carpetas permitidas (sin resolver: se resuelven con realpath al revisar). */
export const RAICES_POR_DEFECTO = [
  "/mnt/c/Users/Usuario/OneDrive/Documentos/Escritorio/Semana actual",
  "/mnt/c/Users/Usuario/Downloads",
  `${homedir()}/Descargas`,
];

const dentro = (ruta, dir) => ruta === dir || ruta.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/**
 * @param {string} ruta absoluta
 * @param {{ raices?: string[], casa?: string }} [op]
 * @returns {Promise<{ ok: true, real: string, nombre: string, bytes: number, sha256: string } | { ok: false, motivo: string }>}
 */
export async function revisarArchivo(ruta, op = {}) {
  const no = (motivo) => ({ ok: /** @type {false} */ (false), motivo });
  if (typeof ruta !== "string" || !ruta || ruta.length > 500) return no("ruta vacía o demasiado larga");
  if (!isAbsolute(ruta)) return no("la ruta tiene que ser absoluta (/mnt/c/… o /home/…)");
  if (/[\u0000-\u001f]/.test(ruta)) return no("caracteres de control en la ruta");
  const casa = op.casa ?? homedir();
  let real;
  try { real = await realpath(ruta); } catch { return no("el archivo no existe o no se puede leer"); }
  /** @type {string[]} */ const raices = [];
  for (const r of op.raices ?? RAICES_POR_DEFECTO) { try { raices.push(await realpath(r)); } catch { /* esa carpeta no existe en esta PC */ } }
  if (!raices.some((r) => dentro(real, r))) return no("solo se suben archivos de «Semana actual», Descargas de Windows o ~/Descargas");
  for (const prohibida of [".config", ".local/state", ".ssh"].map((x) => `${casa}/${x}`)) {
    if (dentro(real, prohibida)) return no("esa carpeta es privada del sistema");
  }
  const raiz = raices.find((r) => dentro(real, r)) ?? "";
  const partes = real.slice(raiz.length).split(sep).filter(Boolean);
  if (partes.some((p) => p.startsWith("."))) return no("no se suben archivos ni carpetas ocultos (empiezan con «.»)");
  const nombre = basename(real);
  if (/^\.?env(\.|$)/i.test(nombre) || /\.env(\.|$)/i.test(nombre)) return no("no se suben archivos .env");
  return leerSellado(real, nombre);
}

/** Abre sin seguir enlaces, revisa que sea un archivo normal y ≤25 MB, y lo sella. */
async function leerSellado(real, nombre) {
  const no = (motivo) => ({ ok: /** @type {false} */ (false), motivo });
  let fh;
  try {
    fh = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = await fh.stat();
    if (!st.isFile()) return no("no es un archivo normal");
    if (st.size > MAX_ARCHIVO_BYTES) return no(`pesa ${Math.round(st.size / 1024 / 1024)} MB; el tope es 25 MB`);
    if (st.size === 0) return no("el archivo está vacío");
    const buf = await fh.readFile();
    return { ok: /** @type {true} */ (true), real, nombre, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), buf };
  } catch {
    return no("el archivo no se puede abrir");
  } finally {
    await fh?.close().catch((err) => process.stderr.write(`[buleje-mcp] cerrar archivo falló: ${String(err)}\n`));
  }
}
