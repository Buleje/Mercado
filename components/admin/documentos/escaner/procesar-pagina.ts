/**
 * Convierte una página (original + recorte + rotación + filtro) en un JPEG
 * listo para el PDF. El enderezado de perspectiva lo hace OpenCV en el worker;
 * si no está disponible, degrada a recorte rectangular. El filtro corre sobre
 * canvas con los helpers puros de `filtros.ts`.
 */
import { aplicarFiltro, type FiltroId } from "@/lib/documentos/escaner/filtros";
import { cajaDe, esImagenCompleta, tamanoEnderezado, type Cuadrilatero } from "@/lib/documentos/escaner/geometria";
import { enderezarConOpenCv } from "./motor-escaner";

function lienzo(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sin canvas 2D");
  return { c, ctx };
}

/** Lee una imagen a su tamaño (o reducida a `maxLado`) como ImageData. */
async function aImageData(blob: Blob, maxLado?: number): Promise<{ data: ImageData; w: number; h: number }> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  let w = bmp.width;
  let h = bmp.height;
  if (maxLado && Math.max(w, h) > maxLado) {
    const k = maxLado / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  const { ctx } = lienzo(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { data: ctx.getImageData(0, 0, w, h), w, h };
}

/** Recorte rectangular (caja del cuadrilátero) cuando no hay perspectiva. */
function recorteSimple(fuente: ImageData, q: Cuadrilatero): ImageData {
  const caja = cajaDe(q);
  const sx = Math.round(caja.x * fuente.width);
  const sy = Math.round(caja.y * fuente.height);
  const sw = Math.max(1, Math.round(caja.ancho * fuente.width));
  const sh = Math.max(1, Math.round(caja.alto * fuente.height));
  const origen = lienzo(fuente.width, fuente.height);
  origen.ctx.putImageData(fuente, 0, 0);
  const destino = lienzo(sw, sh);
  destino.ctx.drawImage(origen.c, sx, sy, sw, sh, 0, 0, sw, sh);
  return destino.ctx.getImageData(0, 0, sw, sh);
}

/** Rota un ImageData 0/90/180/270 grados. */
function rotar(fuente: ImageData, grados: number): ImageData {
  const g = ((grados % 360) + 360) % 360;
  if (g === 0) return fuente;
  const origen = lienzo(fuente.width, fuente.height);
  origen.ctx.putImageData(fuente, 0, 0);
  const vertical = g === 90 || g === 270;
  const w = vertical ? fuente.height : fuente.width;
  const h = vertical ? fuente.width : fuente.height;
  const { ctx } = lienzo(w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((g * Math.PI) / 180);
  ctx.drawImage(origen.c, -fuente.width / 2, -fuente.height / 2);
  return ctx.getImageData(0, 0, w, h);
}

export interface EntradaProceso {
  origenBlob: Blob;
  quad: Cuadrilatero;
  rotacion: number;
  filtro: FiltroId;
}

/** Endereza/recorta y rota (SIN filtro). Es la base para la vista previa. */
export async function recortarYRotar(
  p: Pick<EntradaProceso, "origenBlob" | "quad" | "rotacion">,
  maxLado = 2200,
): Promise<ImageData> {
  const { data: fuente, w, h } = await aImageData(p.origenBlob, maxLado);
  let recortada: ImageData;
  if (esImagenCompleta(p.quad)) {
    recortada = fuente;
  } else {
    const { ancho, alto } = tamanoEnderezado(p.quad, w, h);
    const enderezada = await enderezarConOpenCv(fuente, p.quad, ancho, alto);
    recortada = enderezada ?? recorteSimple(fuente, p.quad);
  }
  return rotar(recortada, p.rotacion);
}

/** Aplica un filtro sobre una copia de la base y devuelve un ImageData nuevo. */
export function filtrar(base: ImageData, filtro: FiltroId): ImageData {
  const copia = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  aplicarFiltro(copia.data, copia.width, copia.height, filtro);
  return copia;
}

/** Exporta un ImageData a JPEG. */
export function aJpeg(img: ImageData, calidad = 0.9): Promise<Blob> {
  const { c, ctx } = lienzo(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return new Promise<Blob>((ok, mal) => {
    c.toBlob((b) => (b ? ok(b) : mal(new Error("no se pudo exportar la página"))), "image/jpeg", calidad);
  });
}

/**
 * Procesa una página entera: endereza/recorta, rota, aplica el filtro y
 * exporta JPEG. `maxLado` limita el tamaño (miniaturas chico; PDF grande).
 */
export async function procesarPagina(p: EntradaProceso, maxLado = 2200): Promise<Blob> {
  const base = await recortarYRotar(p, maxLado);
  aplicarFiltro(base.data, base.width, base.height, p.filtro);
  return aJpeg(base);
}
