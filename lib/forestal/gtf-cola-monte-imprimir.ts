/**
 * Entregar la guía a la impresora del monte, desde el celular (16-10) — sólo
 * navegador. La salida (PDF a la medida del talonario y ESC/P para la
 * matricial) la arma el carril «salida» en
 * `/api/admin/forestal/loth/gtf-matricial/salida`; acá sólo se baja y se
 * entrega.
 *
 * PUNTO DE INTEGRACIÓN: `imprimirDirecto(url, nombre)` es el ÚNICO lugar que
 * sabe cómo llega el `.prn` a la matricial: por WebUSB (Chrome de Android +
 * OTG + cable USB A-B, `gtf-impresion-usb.ts`). Recibe la URL y no el archivo
 * porque el permiso del USB se pide ANTES de bajarlo, dentro del toque. Si no
 * se puede, devuelve el porqué y las salidas: bajar el `.prn` o `abrirEnRawbt`.
 */

import { imprimirPorUsb, urlIntentRawbt, type ArchivoSalida, type ResultadoDirecto, type UsbLike } from "./gtf-impresion-usb";

/** `recortados`: los valores que el servidor tuvo que cortar porque no entran en su casillero (cabecera `X-Recortados`). */
export type ResultadoBajada = { ok: true; blob: Blob; nombre: string; recortados: number } | { ok: false; mensaje: string };

/** El aviso de los valores cortados, o null si entró todo. */
export function avisoRecortados(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n === 1 ? "1 valor no entra en su casillero: revisa la disposición." : `${n} valores no entran en su casillero: revisa la disposición.`;
}

const recortadosDe = (res: Response): number => {
  const n = Number.parseInt(res.headers.get("x-recortados") ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** El nombre que manda el servidor en `Content-Disposition`, o uno armado. */
function nombreDe(res: Response, porDefecto: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : porDefecto;
}

/** Baja un archivo de la salida (con la sesión). Nunca tira: devuelve el porqué en palabras del monte. */
export async function bajarSalida(url: string, nombrePorDefecto: string): Promise<ResultadoBajada> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (j?.message) return { ok: false, mensaje: j.message };
      if (res.status === 404) return { ok: false, mensaje: "Todavía no se puede sacar esta hoja: avisa a la oficina." };
      if (res.status === 401 || res.status === 403) return { ok: false, mensaje: "Tu sesión no tiene permiso: entra con tu usuario." };
      return { ok: false, mensaje: `No se pudo bajar la hoja (HTTP ${res.status}).` };
    }
    return { ok: true, blob: await res.blob(), nombre: nombreDe(res, nombrePorDefecto), recortados: recortadosDe(res) };
  } catch {
    return { ok: false, mensaje: "Sin señal: no se pudo bajar la hoja. Prueba de nuevo." };
  }
}

/** Descarga un blob con su nombre (la app de impresión lo abre desde Descargas). */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** ¿Este navegador comparte estos archivos? (Chrome de Android sí con PDF; la PC casi nunca.) */
export function puedeCompartir(files: File[]): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function" && !!navigator.canShare?.({ files });
}

export type ResultadoEntrega = "compartido" | "descargado" | "cancelado";

/** Comparte los archivos; si el navegador no deja, los descarga. Cancelar la hoja de compartir no descarga. */
export async function compartirODescargar(files: File[], texto?: string): Promise<ResultadoEntrega> {
  if (puedeCompartir(files)) {
    try {
      await navigator.share({ files, ...(texto ? { text: texto } : {}) });
      return "compartido";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
      /* NotAllowedError (se venció el toque del usuario) u otro: se descarga. */
    }
  }
  for (const f of files) descargarBlob(f, f.name);
  return "descargado";
}

/** «Imprimir directo»: el `.prn` ESC/P por el cable USB a la matricial. Ver la cabecera. */
export async function imprimirDirecto(url: string, nombre: string): Promise<ResultadoDirecto> {
  const usb = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { usb?: UsbLike }).usb;
  return imprimirPorUsb(
    async () => {
      const r = await bajarSalida(url, nombre);
      return r.ok ? { blob: r.blob, nombre: r.nombre, recortados: r.recortados } : r.mensaje;
    },
    { usb, ua: typeof navigator === "undefined" ? "" : navigator.userAgent },
  );
}

/** La alternativa: el `.prn` a la app RawBT (si no está instalada, Chrome abre su ficha en Play). */
export async function abrirEnRawbt(archivo: ArchivoSalida): Promise<void> {
  window.location.href = urlIntentRawbt(new Uint8Array(await archivo.blob.arrayBuffer()));
}
