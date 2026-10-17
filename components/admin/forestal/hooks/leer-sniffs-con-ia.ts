"use client";

/**
 * Leer una FOTO del SNIFFS con el modelo de visión (ADR-398).
 *
 * Segundo intento, nunca el primero: para una captura de pantalla alcanza el
 * OCR del navegador, que es gratis y no sube nada. Esta puerta existe para la
 * foto de un monitor o de un papel, donde el OCR local se rinde.
 *
 * Lo que vuelve pasa por `detalleDesdeIA`, que lo lleva a la MISMA forma que el
 * parser local: el producto se re-mapea contra el catálogo del LO-CTP acá, sin
 * confiar en cómo lo escribió el modelo.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import {
  detalleDesdeIA,
  type DetalleProduccionSniffs,
  type DetalleSniffsDeIA,
} from "@/lib/forestal/sniffs-produccion-parse";

/** La imagen como data URL, que es lo que la ruta espera. */
function aDataUrl(imagen: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No pude leer el archivo de imagen."));
    fr.readAsDataURL(imagen);
  });
}

export async function leerDetalleConIA(
  imagen: Blob,
  consumidoM3?: number | null,
): Promise<DetalleProduccionSniffs> {
  const image = await aDataUrl(imagen);
  const r = await fetch("/api/admin/forestal/sniffs-ocr", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ image }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message ?? j?.error ?? `El servidor respondió ${r.status}`);
  return detalleDesdeIA(j as DetalleSniffsDeIA, { consumidoM3 });
}
