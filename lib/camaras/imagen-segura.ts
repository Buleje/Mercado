import "server-only";
import sharp from "sharp";

/**
 * Abrir con sharp una imagen que llega de afuera (webhook de cámaras), con
 * techo de píxeles y formato REAL verificado (revisión de seguridad 03-10,
 * ADR-466): una WebP de 680 bytes puede declarar 16 383 × 16 383 y ocupar
 * ~1 GB al decodificarse, y sharp detecta el formato por su cuenta (un SVG
 * mandado como `image/jpeg` se decodificaba como SVG). El `content-type` que
 * declara el cliente no alcanza.
 */
export const MAX_PIXELES_CAMARA = 40_000_000; // ~ 7 300 × 5 500: sobra para una cámara de 4K

export type FormatoCamara = "jpeg" | "png" | "webp";

export class ImagenNoPermitida extends Error {
  constructor(readonly motivo: "formato" | "ilegible") {
    super(motivo === "formato" ? "formato_no_permitido" : "imagen_ilegible");
  }
}

/** Una instancia de sharp con el techo de píxeles y que falla ante archivos corruptos. */
export const sharpSeguro = (bytes: Buffer) => sharp(bytes, { limitInputPixels: MAX_PIXELES_CAMARA, failOn: "error" });

/** Verifica que el formato real esté entre los permitidos y devuelve sus medidas. */
export async function verificarImagen(
  bytes: Buffer,
  permitidos: ReadonlySet<FormatoCamara>,
): Promise<sharp.Metadata> {
  let meta: sharp.Metadata;
  try {
    meta = await sharpSeguro(bytes).metadata();
  } catch {
    throw new ImagenNoPermitida("ilegible");
  }
  if (!meta.format || !permitidos.has(meta.format as FormatoCamara)) throw new ImagenNoPermitida("formato");
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELES_CAMARA) throw new ImagenNoPermitida("ilegible");
  return meta;
}
