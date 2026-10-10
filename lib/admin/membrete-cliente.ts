/**
 * lib/admin/membrete-cliente.ts — trae el membrete del negocio y prepara el
 * logo para jsPDF. Se llama al descargar un PDF, no en cada render.
 */

import { leerJson, sinDato } from "@/lib/errores/sin-dato";
import type { LogoPdf, Membrete } from "./membrete";

const SIN_MEMBRETE: Membrete = { nombre: null, logoUrl: null, telefono: null, direccion: null };

/** Si la ruta no responde, el PDF sale igual, sin nombre ni logo. */
export async function leerMembrete(): Promise<Membrete> {
  const res = await fetch("/api/admin/membrete", { credentials: "include" }).catch(sinDato("membrete del negocio"));
  if (!res?.ok) return SIN_MEMBRETE;
  return { ...SIN_MEMBRETE, ...(await leerJson<Membrete>(res)) };
}

/** El logo como PNG para jsPDF, con su proporción (lado mayor hasta 600 px). `null` si no hay o no carga. */
export async function logoParaPdf(url: string | null): Promise<LogoPdf | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const escala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), ancho: canvas.width, alto: canvas.height };
  } catch {
    // Sin CORS o imagen rota: el PDF sale con el nombre solo.
    return null;
  }
}
