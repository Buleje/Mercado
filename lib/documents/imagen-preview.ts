import "server-only";
import sharp from "sharp";
import { extensionDe, resolverMime } from "./tipos-archivo";

/**
 * Convertir a PNG lo que el navegador NO sabe dibujar.
 *
 * Una foto de iPhone (HEIC), un escaneo (TIFF) o un AVIF viejo se guardan bien
 * pero en la pantalla eran un ícono gris: había que bajarlos para saber qué
 * eran. Acá se rasterizan del lado del servidor y el drive los muestra como
 * cualquier otra foto.
 *
 * El SVG entra por otro motivo: mostrarlo tal cual ejecuta scripts en nuestro
 * origen (por eso se sirve como descarga). Rasterizado deja de ser código y
 * pasa a ser un dibujo — se puede mostrar sin riesgo.
 */

/** Formatos que sharp sabe leer y el navegador no. */
const CONVERTIBLES = new Set([
  "image/heic", "image/heif", "image/heic-sequence",
  "image/tiff", "image/x-tiff",
  "image/svg+xml",
  "image/avif", // los Safari viejos no lo dibujan; convertirlo es barato
]);

const EXT_CONVERTIBLES = new Set(["heic", "heif", "tif", "tiff", "svg", "avif"]);

/** ¿Vale la pena pedirle al servidor que la convierta? */
export function esConvertibleAImagen(nombre: string, mime?: string | null): boolean {
  return CONVERTIBLES.has(resolverMime(nombre, mime).toLowerCase()) || EXT_CONVERTIBLES.has(extensionDe(nombre));
}

/**
 * Rasteriza a PNG con un techo de tamaño. `null` si sharp no puede con el
 * archivo (un HEIC corrupto, un SVG que no es SVG): el llamador cae al ícono.
 *
 * `limitInputPixels` frena la bomba de descompresión: una imagen de 50.000 ×
 * 50.000 px declara pocos bytes en disco y se come toda la RAM al abrirla.
 */
export async function rasterizarImagen(buf: Buffer, maxLado = 1600): Promise<Buffer | null> {
  try {
    return await sharp(buf, { limitInputPixels: 100_000_000, animated: false })
      .rotate() // respeta el EXIF: las fotos del celular vienen acostadas
      .resize({ width: maxLado, height: maxLado, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch {
    return null;
  }
}
