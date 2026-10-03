import "server-only";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { asegurarFuentesPdf } from "@/lib/documents/miniatura-doc";
import { proponerCroquisDesdePdf, type PropuestaCroquisPdf, type TextoPdf } from "./croquis-desde-pdf";

/**
 * croquis-pdf-servidor — leer el PDF del plano en el servidor (ADR-465).
 *
 * Una sola apertura del PDF (página 1) para las dos cosas:
 *  1. Los textos con su posición (pdf.js `getTextContent`) llevados a puntos de
 *     la hoja (origen arriba a la izquierda) → `proponerCroquisDesdePdf`, que
 *     decide escala, medidas, recorte y componentes.
 *  2. La página dibujada (unpdf + @napi-rs/canvas, la misma tubería de las
 *     miniaturas del drive) y recortada al terreno → WebP del fondo.
 *
 * En el servidor y no en el navegador: pdf.js pesa 1,6 MB y el recorte depende
 * de los ejes que lee esta misma pasada.
 */

/** El lado largo del terreno recortado: el mismo tope que la imagen subida a mano. */
const LADO_OBJETIVO = 3200;
/** Tope de la hoja dibujada (RAM de la función): un A0 baja la escala sola. */
const MAX_PIXELES_HOJA = 50_000_000;

export type CroquisPdfProcesado =
  | { ok: true; webp: Buffer; ancho: number; alto: number; propuesta: PropuestaCroquisPdf }
  | { ok: false; error: string };

type Matriz = [number, number, number, number, number, number];
const por = (m: number[], t: number[]): Matriz => [
  m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1],
  m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5],
];
const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export async function procesarCroquisPdf(
  datos: Buffer,
  pista: { anchoM: number; altoM: number } | null,
): Promise<CroquisPdfProcesado> {
  const { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const canvasImport = () => import("@napi-rs/canvas");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // El documento nace con la fábrica de lienzos de @napi-rs/canvas: sin ella,
    // pdf.js usa la suya de Node (que no existe) para los lienzos internos y
    // dibujar el MISMO documento revienta con «@napi-rs/canvas is not available».
    const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
    pdf = await getDocumentProxy(new Uint8Array(datos), { CanvasFactory });
  } catch (e) {
    logger.warn("[croquis-pdf] no abre", { err: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: "No se pudo abrir el PDF: puede tener clave o estar dañado." };
  }
  try {
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const contenido = await page.getTextContent();
    const textos: TextoPdf[] = [];
    for (const it of contenido.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const m = por(vp.transform, it.transform as number[]);
      textos.push({ str: it.str, x: m[4], y: m[5], w: it.width, h: Math.hypot(m[2], m[3]), angulo: (Math.atan2(m[1], m[0]) * 180) / Math.PI });
    }
    const propuesta = proponerCroquisDesdePdf({ textos, hoja: { ancho: vp.width, alto: vp.height }, pista });
    if (pdf.numPages > 1) propuesta.avisos.push(`El PDF tiene ${pdf.numPages} páginas: usé la primera.`);

    const r = propuesta.recorte;
    const escala = entre(Math.min(LADO_OBJETIVO / Math.max(r.w, r.h), Math.sqrt(MAX_PIXELES_HOJA / (vp.width * vp.height))), 1, 6);
    // Sin las fuentes estándar registradas, pdf.js dibuja cuadraditos en vez de letras.
    await asegurarFuentesPdf(datos);
    const png = Buffer.from(await renderPageAsImage(pdf, 1, { canvasImport, scale: escala }));
    const meta = await sharp(png, { limitInputPixels: false }).metadata();
    const W = meta.width ?? 1, H = meta.height ?? 1;
    const left = entre(Math.round(r.x * escala), 0, W - 1), top = entre(Math.round(r.y * escala), 0, H - 1);
    const width = entre(Math.round(r.w * escala), 1, W - left), height = entre(Math.round(r.h * escala), 1, H - top);
    const { data, info } = await sharp(png, { limitInputPixels: false })
      .extract({ left, top, width, height })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: LADO_OBJETIVO, height: LADO_OBJETIVO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, webp: data, ancho: info.width, alto: info.height, propuesta };
  } catch (e) {
    logger.warn("[croquis-pdf] no se pudo leer o dibujar", { err: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: "No se pudo leer la primera página del PDF." };
  } finally {
    await pdf.destroy().catch((err: unknown) => logger.warn("[croquis-pdf] destroy", { err: String(err) }));
  }
}
