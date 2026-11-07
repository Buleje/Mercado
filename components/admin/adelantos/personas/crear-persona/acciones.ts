/**
 * Lo que el alta de persona hace contra el servidor DESPUÉS de guardarla: la
 * foto del DNI (ruta propia, privada, Ley 29733) y el pedido de «dar
 * adelanto» a la persona recién creada.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { ACCION_ENTREGAR } from "@/lib/adelantos/entregar-tipos";
import { PARAM_ACCION, PARAM_PERSONA } from "../../cuentas/liquidar-por-url";

/** La foto elegida, todavía sin subir. `vista` = data URL para la miniatura. */
export type FotoElegida = { blob: Blob; nombre: string; vista: string | null };

export const MAX_FOTO_BYTES = 8 * 1024 * 1024;
export const TIPOS_FOTO = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export const urlFotoDocumento = (id: string) =>
  `/api/adelantos/beneficiarios/${encodeURIComponent(id)}/foto-documento`;

/** La cámara devuelve un data URL; la subida necesita el archivo. Sin `fetch(data:)`: la CSP lo puede cortar. */
export function blobDeDataUrl(dataUrl: string): Blob {
  const [cabecera, datos = ""] = dataUrl.split(",", 2);
  const tipo = /data:([^;]+)/.exec(cabecera ?? "")?.[1] ?? "image/jpeg";
  const binario = atob(datos);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** Por qué no se pudo, en palabras de quien atiende. */
async function motivo(res: Response): Promise<string> {
  if (res.status === 404 || res.status === 405) return "el servidor todavía no recibe la foto del DNI";
  if (res.status === 413) return "la foto pesa demasiado";
  const j = await leerJson<{ error?: string }>(res);
  return j?.error ?? `el servidor respondió ${res.status}`;
}

/** `null` = subida; si no, el motivo. Nunca tira: la persona ya quedó guardada. */
export async function subirFotoDocumento(id: string, foto: FotoElegida): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("archivo", foto.blob, foto.nombre);
    const res = await fetch(urlFotoDocumento(id), {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: fd,
    });
    return res.ok ? null : await motivo(res);
  } catch (e) {
    logger.error("[adelantos] no se pudo subir la foto del DNI", { error: String(e) });
    return "no hubo conexión";
  }
}

export async function borrarFotoDocumento(id: string): Promise<string | null> {
  try {
    const res = await fetch(urlFotoDocumento(id), { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
    return res.ok ? null : await motivo(res);
  } catch (e) {
    logger.error("[adelantos] no se pudo quitar la foto del DNI", { error: String(e) });
    return "no hubo conexión";
  }
}

/**
 * «Crear y dar adelanto»: deja en la URL `?accion=nuevo&persona=<id>` (ADR-491).
 * `AdelantosModule` lo atiende cuando la lista de personas se vuelve a cargar
 * —la recarga que dispara `onCreated`— y abre «Entregar» con ella ya elegida.
 * Va ANTES de `onCreated`: si la lista llegara primero, el pedido no la vería.
 */
export function pedirAdelantoPara(id: string): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set(PARAM_ACCION, ACCION_ENTREGAR);
    u.searchParams.set(PARAM_PERSONA, id);
    window.history.replaceState(window.history.state, "", u.toString());
  } catch (e) {
    logger.warn("[adelantos] no se pudo pedir el adelanto de la persona nueva", { error: String(e) });
  }
}
