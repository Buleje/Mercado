/**
 * lib/tienda-cliente/compartir.ts — manda el pedido al WhatsApp del negocio,
 * con la IMAGEN cuando el aparato lo permite. Contrato en `./contrato.ts`.
 *
 * Tres caminos, del mejor al de respaldo:
 *   1. Celular con Web Share de archivos → menú de compartir con la imagen y el
 *      texto; el cliente elige WhatsApp y el chat del negocio.   → `compartir`
 *   2. Computadora → la imagen queda copiada y se abre el chat del negocio con
 *      el texto; el cliente pega con Ctrl+V.                      → `portapapeles`
 *   3. Nada de eso → se descarga la imagen (si hay) y se abre el chat con el
 *      texto.                                                      → `texto`
 *   Cerrar el menú de compartir sin elegir                         → `cancelado`
 *
 * CÓMO USARLO (activación transitoria): el navegador sólo deja abrir el menú
 * de compartir o una pestaña nueva DENTRO del clic. Por eso:
 *   · la imagen se genera ANTES (cuando los datos ya están completos) con
 *     `useImagenPedido`, y el clic llama directo a `enviarPedidoWhatsapp`
 *     con el blob listo — nunca `await dibujarImagenPedido()` dentro del clic;
 *   · en el clic no va ningún `await` antes de esta función.
 *
 * Cliente nuevo en el celular: si nunca le escribió al negocio, su chat no sale
 * en el menú de compartir. Tras `compartir`, muestra un enlace secundario
 * «¿No te sale <negocio>? Abre su chat» con `enlaceWhatsapp(numero, texto)`.
 */

import type { ResultadoEnvio } from "./contrato";

export type { ResultadoEnvio } from "./contrato";

export interface EnvioPedidoWhatsapp {
  /** PNG del pedido ya generado; `null` = sólo texto. */
  blob: Blob | null;
  /** Mensaje con el pedido completo (va siempre: es el respaldo de la imagen). */
  texto: string;
  /** WhatsApp del negocio, cualquier formato (se dejan sólo los dígitos; 9 dígitos → +51). */
  numero: string;
  /** Nombre del archivo, p. ej. `pedido-musa-1110.png`. */
  nombreArchivo?: string;
}

/** Dígitos para wa.me: «987 654 321» → «51987654321»; ya con país, tal cual. */
export function numeroParaWa(numero: string): string {
  const d = numero.replace(/\D/g, "").replace(/^00/, "");
  return d.length === 9 && d.startsWith("9") ? `51${d}` : d;
}

/** `https://wa.me/<numero>?text=<texto>` */
export function enlaceWhatsapp(numero: string, texto: string): string {
  const n = numeroParaWa(numero);
  const base = n ? `https://wa.me/${n}` : "https://wa.me/";
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** Celular o tableta (pantalla táctil como puntero principal). */
export function esCelular(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  // iPadOS se presenta como Mac: lo delata el toque.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

function abrirChat(url: string): void {
  const w = window.open(url, "_blank");
  if (w) {
    w.opener = null;
    return;
  }
  // Bloqueador de ventanas: el chat en la misma pestaña (el cliente vuelve con «atrás»).
  window.location.assign(url);
}

function descargar(blob: Blob, nombre: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

function esAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === "AbortError" : (err as { name?: string } | null)?.name === "AbortError";
}

/** Copia la imagen; `false` si el navegador no deja (sin ClipboardItem, sin foco, Firefox viejo). */
async function copiarImagen(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    const png = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
    // La promesa dentro de ClipboardItem es lo que Safari exige; Chrome ≥ 98 también la acepta.
    const escritura = navigator.clipboard.write([new ClipboardItem({ "image/png": Promise.resolve(png) })]);
    // Tope corto: la pestaña del chat debe abrirse mientras el clic siga vigente (~5 s en Chrome).
    const tope = new Promise<false>((r) => setTimeout(() => r(false), 2_000));
    return await Promise.race([escritura.then(() => true as const), tope]);
  } catch {
    return false;
  }
}

/**
 * Manda el pedido. Llamarla DIRECTO desde el `onClick` con el blob ya generado
 * (ver cabecera). Nunca lanza: cualquier fallo cae al camino siguiente.
 */
export async function enviarPedidoWhatsapp({
  blob,
  texto,
  numero,
  nombreArchivo = "pedido.png",
}: EnvioPedidoWhatsapp): Promise<ResultadoEnvio> {
  const chat = enlaceWhatsapp(numero, texto);

  // 1. Celular: menú de compartir con la imagen. Sin `await` antes de share().
  if (blob && esCelular() && typeof navigator.canShare === "function" && typeof File !== "undefined") {
    const archivo = new File([blob], nombreArchivo, { type: "image/png" });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto });
        return { via: "compartir" };
      } catch (err) {
        if (esAbort(err)) return { via: "cancelado" };
        // NotAllowedError (se venció el clic) u otro: sigue al respaldo de texto.
        const descargada = descargar(blob, nombreArchivo);
        abrirChat(chat);
        return { via: "texto", descargada };
      }
    }
  }

  // 2. Computadora: imagen al portapapeles + chat con el texto.
  if (blob && !esCelular() && (await copiarImagen(blob))) {
    abrirChat(chat);
    return { via: "portapapeles" };
  }

  // 3. Respaldo: descarga + chat con el texto.
  const descargada = blob ? descargar(blob, nombreArchivo) : false;
  abrirChat(chat);
  return { via: "texto", descargada };
}

/** Aviso corto para el cliente según cómo salió el envío (tuteo, ≤ 1 línea). */
export function avisoDelEnvio(r: ResultadoEnvio): string | null {
  switch (r.via) {
    case "compartir":
      return null;
    case "portapapeles":
      return "La imagen del pedido ya está copiada: pégala en el chat con Ctrl+V.";
    case "texto":
      return r.descargada
        ? "Te bajamos la imagen del pedido: adjúntala en el chat si quieres."
        : "Te abrimos el chat con tu pedido escrito.";
    case "cancelado":
      return "No se envió. Toca de nuevo cuando quieras.";
  }
}
