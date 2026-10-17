/**
 * El comprobante de Adelantos del lado del navegador (10-10, Ley 29733).
 *
 * Nada de Adelantos sube ya a `/api/upload` (bucket público `media`): la foto
 * o el PDF se lee en el navegador como data URL (la CSP deja leer `data:` y no
 * `blob:` con fetch) y se manda al servidor recién cuando hay a qué colgarlo:
 *  - el alta: con el adelanto creado, `POST /api/adelantos/<id>/voucher`;
 *  - una entrega o abono: `POST /api/adelantos/<id>/adjunto` → `priv:<ruta>`
 *    que va en el JSON de la entrega.
 * El servidor decide por el CONTENIDO (foto → WebP, PDF verificado); acá sólo
 * se corta temprano lo que seguro no pasa, para decirlo sin esperar la subida.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";

/** El mismo tope del servidor (`MAX_BYTES_ADJUNTO`). */
export const MAX_BYTES_ADJUNTO_LOCAL = 4 * 1024 * 1024;
/** Lo que el selector de archivos ofrece. */
export const ACEPTA_ADJUNTO = "image/jpeg,image/png,image/webp,application/pdf,.pdf";

/** Una foto o un PDF que todavía está sólo en el navegador. */
export const esAdjuntoLocal = (u: unknown): u is string =>
  typeof u === "string" && (u.startsWith("data:image/") || u.startsWith("data:application/pdf"));

export const esPdfLocal = (u: unknown): boolean => typeof u === "string" && u.startsWith("data:application/pdf");

const esPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Lee el archivo elegido como data URL. Un PDF sin `type` (pasa en Windows) sale igual como PDF. */
export function leerAdjuntoLocal(file: File): Promise<{ ok: true; dataUrl: string; pdf: boolean } | { ok: false; error: string }> {
  const pdf = esPdf(file);
  if (!pdf && !file.type.startsWith("image/")) return Promise.resolve({ ok: false, error: "Elige una foto (JPG, PNG, WebP) o un PDF." });
  if (file.size > MAX_BYTES_ADJUNTO_LOCAL) return Promise.resolve({ ok: false, error: "El archivo pesa más de 4 MB." });
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const crudo = String(r.result ?? "");
      const coma = crudo.indexOf(",");
      if (coma < 0) return resolve({ ok: false, error: "No se pudo leer el archivo." });
      /* El tipo lo fija el caso, no lo que dijo el navegador (un PDF puede llegar como `octet-stream`). */
      const dataUrl = pdf ? `data:application/pdf;base64,${crudo.slice(coma + 1)}` : crudo;
      resolve({ ok: true, dataUrl, pdf });
    };
    r.onerror = () => resolve({ ok: false, error: "No se pudo leer el archivo." });
    r.readAsDataURL(file);
  });
}

/** El data URL vuelto archivo, con el nombre que corresponde. */
export async function archivoDeLocal(local: string, base: string): Promise<File> {
  const blob = await (await fetch(local)).blob();
  const pdf = esPdfLocal(local);
  return new File([blob], `${base}.${pdf ? "pdf" : "jpg"}`, { type: pdf ? "application/pdf" : blob.type || "image/jpeg" });
}

/**
 * Sube el comprobante de una entrega o abono a la carpeta PRIVADA del adelanto.
 * Devuelve `priv:<ruta>` (va en `comprobanteUrl` de la entrega) o el error.
 */
export async function subirAdjuntoPrivado(
  adelantoId: string,
  archivo: File,
): Promise<{ ok: true; comprobanteUrl: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", archivo);
  const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/adjunto`, {
    method: "POST",
    headers: csrfHeaders(),
    credentials: "include",
    body: fd,
  });
  const j = await leerJson<{ comprobanteUrl?: string; error?: string }>(res);
  if (res.ok && j?.comprobanteUrl) return { ok: true, comprobanteUrl: j.comprobanteUrl };
  return { ok: false, error: j?.error ?? "No se pudo guardar el comprobante." };
}
