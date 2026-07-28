import "server-only";
import { miniaturaConCache, ANCHO_MINIATURA } from "@/lib/documents/cache-miniatura";
import { downloadFromStorage } from "@/lib/documents/storage";
import { familiaDe } from "@/lib/documents/tipos-archivo";
import {
  asegurarFuentesPdf, dibujarDocumento, dibujarPlanilla, filasDePlanilla, lineasDeDocumento,
} from "@/lib/documents/miniatura-doc";
import { logger } from "@/lib/logger";

/**
 * Dibuja la miniatura apenas se sube el archivo, sin que nadie la pida.
 *
 * Con el guardado solo, la PRIMERA persona que abre la carpeta sigue pagando el
 * render completo de cada documento nuevo — y esa persona casi siempre es la
 * misma que acaba de subirlos. Haciéndolo acá, para cuando vuelve a la grilla
 * las miniaturas ya están hechas.
 *
 * Es best-effort a propósito: si falla, la tarjeta la pide como siempre.
 */

/** Tope para leer un archivo sólo para dibujar su miniatura. */
const MAX_BYTES_LECTURA = 8 * 1024 * 1024;

export function tieneMiniatura(name: string, mimeType: string): boolean {
  if (mimeType === "application/pdf") return true;
  if (mimeType.startsWith("image/") && !mimeType.includes("svg")) return true;
  const familia = familiaDe(name, mimeType);
  return familia === "planilla" || familia === "texto";
}

export async function precalcularMiniatura(
  storagePath: string,
  name: string,
  mimeType: string,
  size: number,
): Promise<void> {
  if (!tieneMiniatura(name, mimeType)) return;

  const esPdf = mimeType === "application/pdf";
  const esImagen = mimeType.startsWith("image/") && !mimeType.includes("svg");
  if (!esPdf && !esImagen && size > MAX_BYTES_LECTURA) return;

  const familia = familiaDe(name, mimeType);
  const variante = esPdf ? "pdf-p1-s1.2" : esImagen ? "imagen" : familia;

  await miniaturaConCache(
    storagePath,
    variante,
    async () => {
      const buf = await downloadFromStorage(storagePath);
      if (!buf) throw new Error("storage_unavailable");
      if (esImagen) return buf;
      if (esPdf) {
        await asegurarFuentesPdf(buf);
        const { renderPageAsImage } = await import("unpdf");
        return (await renderPageAsImage(new Uint8Array(buf), 1, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: 1.2,
        })) as ArrayBuffer;
      }
      if (familia === "planilla") {
        const filas = await filasDePlanilla(buf, name);
        if (!filas?.length) throw new Error("vacio");
        const dibujo = await dibujarPlanilla(filas);
        if (!dibujo) throw new Error("sin_fuente");
        return dibujo;
      }
      const lineas = await lineasDeDocumento(buf, name);
      if (!lineas?.length) throw new Error("vacio");
      const dibujo = await dibujarDocumento(lineas);
      if (!dibujo) throw new Error("sin_fuente");
      return dibujo;
    },
    ANCHO_MINIATURA,
  ).catch((err) =>
    // Un archivo roto o un formato que no se puede dibujar no es una falla de
    // la subida: la tarjeta cae al ícono, igual que siempre.
    logger.warn("[documents.miniatura] no se pudo precalcular", {
      name,
      err: String(err).slice(0, 160),
    }),
  );
}
