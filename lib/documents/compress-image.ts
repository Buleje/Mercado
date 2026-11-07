/**
 * compress-image — achica fotos ANTES de subirlas (client-only).
 *
 * Una foto de celular pesa 3–8 MB. Achicarla en el navegador hace la subida
 * varias veces más rápida con datos móviles y no le cuesta nada al servidor.
 *
 * Dos medidas (`OpcionesCompresion`), según para qué es la foto:
 *   - `PARA_LEER` (2200 px, desde 1,5 MB): lo que se manda a la IA o a una vista
 *     previa; la IA igual la reduce, no hace falta más. Es el comportamiento de
 *     siempre de `comprimirImagen(file)`.
 *   - `PARA_ARCHIVO` (3264 px, desde 1 MB, calidad 0,85, solo si baja ≥ 25 %): el
 *     papel que se archiva (guías, comprobantes, Drive). Se conserva TODA la
 *     resolución de un celular de 8 MP (2448×3264): ahí se leen sellos y letra
 *     chica. Medido 05-11 con una foto del POCO C71: 2,49 MB → 1,20 MB, misma
 *     resolución, diferencia media 1,5/255 (invisible).
 *
 * Reglas honestas:
 *   - GIF (animación), SVG, PDF y todo lo que no sea imagen salen intactos.
 *   - PNG → WebP (conserva transparencia); el resto → JPEG.
 *   - La orientación EXIF se respeta (`imageOrientation: "from-image"`).
 *   - Nunca se agranda una foto: si no baja lo mínimo, se sube el ORIGINAL.
 */

export interface OpcionesCompresion {
  /** Peso (bytes) desde el cual se intenta achicar. */
  minBytes: number;
  /** Lado largo máximo en px; una foto más chica no se agranda. */
  maxLado: number;
  /** Calidad de la recompresión (0–1). */
  calidad: number;
  /** Fracción mínima que debe bajar el peso para que valga la pena (0,25 = 25 %). */
  ahorroMinimo: number;
}

export const PARA_LEER: OpcionesCompresion = {
  minBytes: 1.5 * 1024 * 1024,
  maxLado: 2200,
  calidad: 0.85,
  ahorroMinimo: 0,
};

export const PARA_ARCHIVO: OpcionesCompresion = {
  minBytes: 1024 * 1024,
  maxLado: 3264,
  calidad: 0.85,
  ahorroMinimo: 0.25,
};

/** ¿Vale la pena abrir esta imagen para achicarla? (sin tocar el navegador). */
export function debeIntentarse(tipo: string, bytes: number, o: OpcionesCompresion): boolean {
  if (!tipo.startsWith("image/")) return false;
  if (tipo === "image/gif" || tipo === "image/svg+xml") return false;
  return bytes >= o.minBytes;
}

/** Medidas finales: el lado largo no pasa de `maxLado` y nunca se agranda. */
export function medidasFinales(ancho: number, alto: number, maxLado: number): { w: number; h: number } {
  const escala = Math.min(1, maxLado / Math.max(ancho, alto));
  return { w: Math.max(1, Math.round(ancho * escala)), h: Math.max(1, Math.round(alto * escala)) };
}

/** ¿El resultado bajó lo suficiente como para reemplazar al original? */
export function alcanzaElAhorro(original: number, nuevo: number, ahorroMinimo: number): boolean {
  return nuevo < original && nuevo <= original * (1 - ahorroMinimo);
}

export async function comprimirImagen(file: File, o: OpcionesCompresion = PARA_LEER): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!debeIntentarse(file.type, file.size, o)) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { w, h } = medidasFinales(bitmap.width, bitmap.height, o.maxLado);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const esPng = file.type === "image/png";
    const tipo = esPng ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, tipo, o.calidad));
    if (!blob || !alcanzaElAhorro(file.size, blob.size, o.ahorroMinimo)) return file;

    // El nombre acompaña al formato real; si no, "foto.png" mentiría.
    const nombre = file.name.replace(/\.[^.]+$/, "") + (esPng ? ".webp" : ".jpg");
    return new File([blob], nombre, { type: tipo, lastModified: file.lastModified });
  } catch {
    return file; // ante cualquier duda, el original
  }
}

/**
 * Foto de un papel que se archiva (guía, comprobante, Drive): conserva la
 * resolución (`PARA_ARCHIVO`). Si el servidor tiene un tope de peso (`topeBytes`)
 * y la foto lo sigue pasando, reintenta con la medida de siempre (`PARA_LEER`,
 * 2200 px) para que no se rechace una foto que antes sí entraba.
 */
export async function comprimirParaArchivo(file: File, topeBytes?: number): Promise<File> {
  const archivo = await comprimirImagen(file, PARA_ARCHIVO);
  if (topeBytes === undefined || archivo.size <= topeBytes) return archivo;
  return comprimirImagen(file, PARA_LEER);
}
