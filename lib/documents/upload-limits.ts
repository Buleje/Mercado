/**
 * Límites de subida del drive — client-safe.
 *
 * El servidor ya rechaza lo que no corresponde (413 / 415), pero enterarse
 * DESPUÉS de mandar 50 MB por datos móviles es la peor forma de enterarse.
 * Este módulo es la MISMA regla, disponible en el navegador para avisar antes
 * de gastar la subida. `lib/documents/storage.ts` (server-only) importa de acá
 * para que la lista no se bifurque.
 */

import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";

export { MAX_UPLOAD_SIZE };

export const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "text/markdown",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];

export function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) =>
    p.endsWith("/") ? mime.startsWith(p) : mime === p || mime.startsWith(p)
  );
}

/** Los mismos MB que muestra el servidor, escritos como los diría una persona. */
function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * Por qué este archivo NO se puede subir, en castellano. `null` = se puede.
 *
 * Mismo criterio que el endpoint: tamaño y tipo. Un archivo sin extensión llega
 * con `type` vacío y el navegador no puede adivinarlo — el servidor lo trataría
 * como `application/octet-stream` y lo rechazaría igual.
 */
export function motivoRechazo(file: File): string | null {
  if (file.size === 0) return "está vacío";
  if (file.size > MAX_UPLOAD_SIZE) {
    return `pesa ${mb(file.size)} y el máximo es ${mb(MAX_UPLOAD_SIZE)}`;
  }
  const mime = file.type || "application/octet-stream";
  if (!isMimeAllowed(mime)) {
    return file.type
      ? `el drive no acepta archivos de tipo ${file.type}`
      : "no se reconoce el tipo (¿le falta la extensión al nombre?)";
  }
  return null;
}
