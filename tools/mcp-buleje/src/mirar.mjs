// Ayudas de «doc_mirar» (31-10): bajar el archivo real de un documento a una carpeta privada para que Claude lo abra con Read.
// Puro salvo guardarBinario/limpiarViejos (disco). Nunca usa el nombre del usuario en la ruta (path traversal).
import { chmod, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CARPETA_MIRAR = join(homedir(), ".cache", "buleje-mcp", "mirar");
export const TOPE_BYTES_MIRAR = 30 * 1024 * 1024;
export const EDAD_MAX_MS = 2 * 60 * 60 * 1000;

const EXT = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "image/heic": "heic", "image/heif": "heif", "image/tiff": "tiff", "image/svg+xml": "svg", "image/avif": "avif",
};

/** Extensión segura según el Content-Type (nunca la del nombre que puso el usuario). */
export function extensionDeMime(contentType) {
  const m = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXT[m] ?? "bin";
}

/** Base del archivo local: solo letras, números, «_» y «-», máx. 60. Vacío = inválido. */
export function sanearBase(base) {
  return String(base ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
}

/** Borra de la carpeta lo que tenga más de `edadMax` ms. Devuelve cuántos borró. */
export async function limpiarViejos(carpeta = CARPETA_MIRAR, ahora = Date.now(), edadMax = EDAD_MAX_MS) {
  let n = 0;
  let nombres = [];
  try { nombres = await readdir(carpeta); } catch { return 0; }
  for (const f of nombres) {
    try {
      const p = join(carpeta, f);
      const s = await stat(p);
      if (s.isFile() && ahora - s.mtimeMs > edadMax) { await unlink(p); n++; }
    } catch { /* otro proceso lo borró */ }
  }
  return n;
}

/**
 * Guarda los bytes en `<carpeta>/<base>.<ext>` (carpeta 0700, archivo 0600). Si pasan el tope, no guarda.
 * @param {{ carpeta?: string, base: string, contentType?: string|null, bytes: Uint8Array, tope?: number, ahora?: number }} o
 * @returns {Promise<{ guardado: true, ruta: string, bytes: number, ext: string } | { guardado: false, motivo: "base_invalida" | "tamano", bytes: number }>}
 */
export async function guardarBinario(o) {
  const carpeta = o.carpeta ?? CARPETA_MIRAR;
  const base = sanearBase(o.base);
  const n = o.bytes.byteLength;
  if (!base) return { guardado: false, motivo: "base_invalida", bytes: n };
  if (n > (o.tope ?? TOPE_BYTES_MIRAR)) return { guardado: false, motivo: "tamano", bytes: n };
  await mkdir(carpeta, { recursive: true, mode: 0o700 });
  // mkdir no cambia el modo de una carpeta que ya existía: se fuerza (si falla, la carpeta ya era del usuario).
  try { await chmod(carpeta, 0o700); } catch { /* sin permiso para cambiarlo: queda como estaba */ }
  await limpiarViejos(carpeta, o.ahora);
  const ext = extensionDeMime(o.contentType);
  const ruta = join(carpeta, `${base}.${ext}`);
  await writeFile(ruta, o.bytes, { mode: 0o600 });
  try { await chmod(ruta, 0o600); } catch { /* writeFile ya lo creó con 0600 */ }
  return { guardado: true, ruta, bytes: n, ext };
}
