/**
 * compress-image — comprime fotos ANTES de subirlas al drive (client-only).
 *
 * Una foto de celular pesa 3–8 MB; para un documento archivado alcanza con
 * ~2200 px del lado largo. Comprimir en el navegador hace la subida varias
 * veces más rápida con datos móviles y no le cuesta nada al servidor.
 *
 * Reglas honestas:
 *   - Solo imágenes GRANDES (>1.5 MB). GIF (animación) y SVG salen intactos.
 *   - PNG → WebP (conserva transparencia); el resto → JPEG 0.85.
 *   - La orientación EXIF se respeta (`imageOrientation: "from-image"`).
 *   - Si el resultado no achica, se sube el ORIGINAL — nunca se empeora.
 */

const MIN_BYTES = 1.5 * 1024 * 1024;
const MAX_LADO_PX = 2200;
const CALIDAD = 0.85;

export async function comprimirImagen(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/") || file.size < MIN_BYTES) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, MAX_LADO_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const esPng = file.type === "image/png";
    const tipo = esPng ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, tipo, CALIDAD));
    if (!blob || blob.size >= file.size) return file;

    // El nombre acompaña al formato real; si no, "foto.png" mentiría.
    const nombre = file.name.replace(/\.[^.]+$/, "") + (esPng ? ".webp" : ".jpg");
    return new File([blob], nombre, { type: tipo, lastModified: file.lastModified });
  } catch {
    return file; // ante cualquier duda, el original
  }
}
