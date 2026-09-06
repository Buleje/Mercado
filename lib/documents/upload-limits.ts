/**
 * Qué acepta el drive — client-safe.
 *
 * La regla es al revés de lo que parece intuitivo: **guardar es permisivo,
 * servir es estricto**. Un drive de bodega recibe de todo (fotos del celular en
 * HEIC, planillas de LibreOffice, un .rar del contador, un plano en DWG, un
 * archivo sin extensión que alguien renombró) y rebotarlos con "tipo no
 * admitido" convierte al drive en un problema. Lo que NO puede pasar es que el
 * drive se vuelva un repartidor de malware o ejecute algo en el navegador: eso
 * se ataja bloqueando ejecutables y sirviendo como descarga lo que no sea
 * seguro de mostrar (ver `esInlineSeguro`).
 *
 * `lib/documents/storage.ts` (server-only) reexporta de acá para que el
 * navegador avise ANTES de gastar la subida con la MISMA regla que el servidor.
 */

import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";

export { MAX_UPLOAD_SIZE };

/**
 * Ejecutables y scripts: lo único que se rechaza. Nadie archiva un .exe en el
 * drive de su bodega, y alojarlo convierte un link compartido en un vector de
 * distribución. Se compara por EXTENSIÓN porque el MIME de un ejecutable es
 * fácil de disfrazar; la extensión es la que decide qué hace el sistema
 * operativo al abrirlo.
 */
export const EXTENSIONES_BLOQUEADAS = new Set([
  "exe", "msi", "msix", "appx", "com", "scr", "pif", "cpl", "dll", "sys", "drv",
  "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta",
  "jar", "apk", "app", "dmg", "pkg", "deb", "rpm", "run", "bin", "sh", "bash",
  "reg", "lnk", "gadget", "scf", "inf",
]);

/** MIMEs que declaran un ejecutable aunque el nombre diga otra cosa. */
const MIMES_BLOQUEADOS = [
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-mach-binary",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "application/x-shellscript",
];

/**
 * Lo que el navegador puede MOSTRAR sin riesgo dentro de nuestro origen.
 *
 * Todo lo demás se sirve como descarga. El caso peligroso son SVG, HTML y XML:
 * son documentos legítimos que uno quiere guardar, pero mostrados inline
 * same-origin ejecutan scripts con nuestras cookies. Guardarlos: sí. Abrirlos
 * en una pestaña nuestra: no.
 */
const INLINE_SEGURO = [
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon",
  "video/mp4", "video/webm", "video/ogg",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac", "audio/flac",
  "text/plain", "text/csv", "text/markdown",
];

/** La extensión en minúscula, sin punto. "" si no tiene. */
export function extensionDe(nombre: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(nombre.trim());
  return m ? m[1].toLowerCase() : "";
}

/** ¿Se puede mostrar dentro de una pestaña nuestra, o hay que bajarlo? */
export function esInlineSeguro(mime: string, nombre = ""): boolean {
  const ext = extensionDe(nombre);
  // SVG es una imagen para el usuario y un documento con scripts para el
  // navegador: nunca inline, aunque venga como image/svg+xml.
  if (ext === "svg" || mime === "image/svg+xml") return false;
  if (ext === "html" || ext === "htm" || ext === "xhtml") return false;
  return INLINE_SEGURO.includes(mime.toLowerCase());
}

export function esMimePermitido(mime: string, nombre = ""): boolean {
  const m = mime.toLowerCase();
  if (MIMES_BLOQUEADOS.some((b) => m.startsWith(b))) return false;
  return !EXTENSIONES_BLOQUEADAS.has(extensionDe(nombre));
}

/**
 * Compat: el nombre viejo del predicado, cuando la política era una allowlist.
 * Se mantiene porque lo usan rutas y libs de documentos.
 */
export function isMimeAllowed(mime: string, nombre = ""): boolean {
  return esMimePermitido(mime, nombre);
}

/** Los mismos MB que muestra el servidor, escritos como los diría una persona. */
function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * Por qué este archivo NO se puede subir, en castellano. `null` = se puede.
 *
 * Sólo dos motivos: pesa demasiado o es un ejecutable. Un archivo sin extensión
 * reconocida ENTRA — se guarda tal cual y se ofrece para descargar.
 */
export function motivoRechazo(file: File): string | null {
  if (file.size === 0) return "está vacío";
  if (file.size > MAX_UPLOAD_SIZE) {
    return `pesa ${mb(file.size)} y el máximo es ${mb(MAX_UPLOAD_SIZE)}`;
  }
  if (!esMimePermitido(file.type || "application/octet-stream", file.name)) {
    return "es un programa ejecutable y el drive no los guarda";
  }
  return null;
}
