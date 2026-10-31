"use client";

/**
 * loth-plano-ventana — lo que pasa DENTRO de la ventana del plano ya escrita:
 *
 *   · si la imagen de fondo no carga, prueba la siguiente de la cadena
 *     (Sentinel-2 → foto de Esri a resolución de impresión → foto de Esri al
 *     tamaño de siempre) y cambia con ella el texto de la fuente y la fecha
 *     en el cajetín, la escala y el pie: el papel nunca dice «Sentinel-2»
 *     sobre una foto de Esri;
 *   · una imagen que se CUELGA (el pedido no contesta) cuenta como caída a los
 *     {@link ESPERA_POR_IMAGEN_MS}: medido el 29-09, una de Esri quedó 45 s sin
 *     respuesta mientras el mismo pedido por curl tardaba 4 s;
 *   · cuando todas las imágenes terminaron, la barra dice qué imagen quedó.
 *
 * Todo se ata desde esta pestaña con `addEventListener`: la ventana lleva una
 * CSP sin scripts (como los reportes del CTP, `openCtpReport`), así que un
 * `onerror` en línea quedaría bloqueado.
 */

import type { CapaFondo, TextoFondo } from "./loth-plano-fondo";

const CAMPOS = ["celda", "nota", "corto"] as const;
/** Una imagen de 4 096 px de Sentinel-2 tarda 5-8 s y la de Esri hasta 20 s (medido): más que esto, se pasa a la siguiente. */
export const ESPERA_POR_IMAGEN_MS = 25_000;
/** Tope de la espera entera (la cadena tiene hasta tres imágenes). */
export const ESPERA_MAX_MS = 75_000;

/** Pone el texto de la imagen que quedó en todos los lugares que la nombran. */
export function ponerFuente(doc: Document, t: TextoFondo): void {
  for (const k of CAMPOS) {
    doc.querySelectorAll<HTMLElement>(`[data-fuente-${k}]`).forEach((el) => {
      el.textContent = t[k];
    });
  }
}

export function vigilarLamina(w: Window, principal: TextoFondo, respaldos: readonly CapaFondo[]): void {
  const doc = w.document;
  const fondo = doc.getElementById("fondo") as HTMLImageElement | null;
  const estado = doc.getElementById("estado-fondo");
  const cola = [...respaldos];
  let actual: TextoFondo = principal;
  let cayo = false;
  let desde = Date.now();

  const siguiente = () => {
    if (!fondo) return;
    // Los otros cuadros de la pasada van con la principal: si ella cae, se van.
    doc.querySelectorAll<HTMLElement>("img.s2x").forEach((x) => (x.style.display = "none"));
    const r = cola.shift();
    if (!r) {
      fondo.style.display = "none";
      actual = { celda: "Sin imagen de fondo", nota: "Imagen de fondo: no respondieron Sentinel-2 ni Esri", corto: "sin imagen" };
      ponerFuente(doc, actual);
      return;
    }
    cayo = cayo || r.celda !== principal.celda;
    actual = r;
    ponerFuente(doc, r);
    if (estado && cayo) estado.textContent = `No cargó ${principal.corto}: probando con la ${r.corto}…`;
    desde = Date.now();
    fondo.src = r.src;
  };
  fondo?.addEventListener("error", siguiente);
  // Capas oficiales, cuadros vecinos y el recuadro de ubicación: si no cargan, no se ve un ícono roto.
  doc.querySelectorAll<HTMLImageElement>("img:not(#fondo)").forEach((img) =>
    img.addEventListener("error", () => {
      img.style.display = "none";
    }),
  );
  doc.getElementById("imprimir")?.addEventListener("click", () => w.print());

  const t0 = Date.now();
  const mirar = () => {
    if (w.closed || !estado) return;
    // Colgada: se la da por caída y se prueba la siguiente (cambiar el src corta el pedido viejo).
    if (fondo && !fondo.complete && fondo.style.display !== "none" && Date.now() - desde > ESPERA_POR_IMAGEN_MS) siguiente();
    // Lo secundario (cuadros vecinos, capas oficiales, ubicación) no retiene el plano: colgado, se oculta.
    if (Date.now() - t0 > ESPERA_POR_IMAGEN_MS) {
      doc.querySelectorAll<HTMLImageElement>("img:not(#fondo)").forEach((i) => {
        if (!i.complete) i.style.display = "none";
      });
    }
    const listas = Array.from(doc.images).every((i) => i.complete || i.style.display === "none");
    if (!listas && Date.now() - t0 < ESPERA_MAX_MS) {
      window.setTimeout(mirar, 300);
      return;
    }
    const conImagen = !!fondo && fondo.style.display !== "none" && fondo.naturalWidth > 0;
    estado.textContent = !conImagen
      ? "La imagen de fondo no cargó: el plano sale con la cuadrícula y el dibujo, sin foto."
      : cayo
        ? `No cargó ${principal.corto}: va la ${actual.corto}. Ya puedes imprimir.`
        : `Imagen de fondo: ${actual.corto}. Ya puedes imprimir.`;
    estado.setAttribute("data-listo", "1");
  };
  mirar();
}
