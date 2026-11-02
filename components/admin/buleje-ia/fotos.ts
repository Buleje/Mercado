/**
 * Fotos del chat de Buleje IA (ADR-528): se achican EN EL NAVEGADOR antes de
 * subir. Una foto de celular pesa 3-6 MB y 4000 px de lado; el modelo no lee
 * mejor un recibo a 4000 px que a 1600, y por datos móviles en Pucallpa la
 * diferencia es esperar 3 s o 40 s. Los límites salen de `tipos.ts` (los mismos
 * que valida la ruta).
 */
import { FOTO_MAX_BYTES, FOTO_MIMES, FOTOS_POR_MENSAJE } from "@/lib/ia-proveedores/tipos";

/** Lado más largo después de achicar. */
export const LADO_MAX = 1600;
/** Calidad JPEG: 0,82 deja legibles los números chicos de un recibo térmico. */
export const CALIDAD_JPEG = 0.82;
/** Una JPEG ya chica no se vuelve a comprimir (perdería nitidez sin ganar nada). */
const YA_LIVIANA = 900 * 1024;

export interface Medidas {
  ancho: number;
  alto: number;
}

/** Medidas finales: el lado más largo queda en `max`, sin agrandar nunca. */
export function medidasAchicadas(ancho: number, alto: number, max = LADO_MAX): Medidas {
  if (ancho <= 0 || alto <= 0) return { ancho: 0, alto: 0 };
  const lado = Math.max(ancho, alto);
  if (lado <= max) return { ancho, alto };
  const k = max / lado;
  return { ancho: Math.round(ancho * k), alto: Math.round(alto * k) };
}

/** null si se puede sumar; si no, la frase para la persona. */
export function revisarAntesDeSumar(file: { type: string }, yaHay: number): string | null {
  if (yaHay >= FOTOS_POR_MENSAJE) return `Hasta ${FOTOS_POR_MENSAJE} fotos por mensaje.`;
  if (!file.type.startsWith("image/")) return "Eso no es una foto. Elige una imagen (JPG, PNG o WEBP).";
  return null;
}

/** La foto ya lista para subir: tipo permitido y peso dentro del límite. */
export function revisarParaSubir(file: { type: string; size: number }): string | null {
  if (!(FOTO_MIMES as readonly string[]).includes(file.type)) return "Ese tipo de foto no se puede mandar. Usa JPG, PNG o WEBP.";
  if (file.size > FOTO_MAX_BYTES) return `La foto pesa más de ${Math.round(FOTO_MAX_BYTES / 1024 / 1024)} MB.`;
  return null;
}

/** Lo que hace falta del navegador para dibujar la foto chica (inyectable en tests). */
export interface Lienzo {
  leer: (file: Blob) => Promise<{ width: number; height: number; dibujable: CanvasImageSource; cerrar?: () => void }>;
  aJpeg: (img: CanvasImageSource, medidas: Medidas, calidad: number) => Promise<Blob | null>;
}

const lienzoDelNavegador: Lienzo = {
  async leer(file) {
    // `from-image` respeta la orientación EXIF: la foto vertical del celular no sale acostada.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bmp.width, height: bmp.height, dibujable: bmp, cerrar: () => bmp.close() };
  },
  aJpeg(img, { ancho, alto }, calidad) {
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    // Fondo blanco: un PNG con transparencia saldría negro en JPEG.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", calidad));
  },
};

const nombreJpeg = (nombre: string) => `${nombre.replace(/\.[^.]+$/, "") || "foto"}.jpg`;

/**
 * Devuelve la foto lista para subir (JPEG ≤ LADO_MAX) o lanza un Error con la
 * frase para la persona. Si el navegador no sabe leerla pero ya es de un tipo
 * permitido y liviana, se manda tal cual.
 */
export async function achicarFoto(file: File, lienzo: Lienzo = lienzoDelNavegador): Promise<File> {
  let img: Awaited<ReturnType<Lienzo["leer"]>>;
  try {
    img = await lienzo.leer(file);
  } catch {
    const motivo = revisarParaSubir(file);
    if (motivo) throw new Error(`No pude abrir esa foto. ${motivo}`);
    return file;
  }
  try {
    const medidas = medidasAchicadas(img.width, img.height);
    const sinCambio = medidas.ancho === img.width && medidas.alto === img.height;
    if (sinCambio && file.type === "image/jpeg" && file.size <= YA_LIVIANA) return file;
    const blob = await lienzo.aJpeg(img.dibujable, medidas, CALIDAD_JPEG);
    if (!blob) {
      const motivo = revisarParaSubir(file);
      if (motivo) throw new Error(`No pude achicar esa foto. ${motivo}`);
      return file;
    }
    const chica = new File([blob], nombreJpeg(file.name), { type: "image/jpeg", lastModified: file.lastModified });
    const motivo = revisarParaSubir(chica);
    if (motivo) throw new Error(motivo);
    return chica;
  } finally {
    img.cerrar?.();
  }
}

/** El cuerpo multipart de `POST /api/admin/ia/chat` (contrato, carril 3). */
export function armarFormData(texto: string, conversacionId: string | null, fotos: File[]): FormData {
  const fd = new FormData();
  fd.append("texto", texto);
  if (conversacionId) fd.append("conversacionId", conversacionId);
  for (const f of fotos.slice(0, FOTOS_POR_MENSAJE)) fd.append("fotos", f, f.name);
  return fd;
}
