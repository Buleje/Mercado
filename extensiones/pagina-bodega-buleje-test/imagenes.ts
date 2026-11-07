/**
 * Las fotos de ambiente del salón (Unsplash) al tamaño de la pantalla.
 *
 * Por qué no basta `next/image`: en desarrollo (`images.unoptimized`, next.config.ts) dibuja
 * la URL tal cual —la portada pedía `w=1400` (80 KB) aunque la pantalla midiera 400 px— y en
 * producción pasa cada foto por `/_next/image`, que la baja de Unsplash y la recodifica. El
 * CDN de Unsplash ya entrega el ancho pedido en AVIF (`auto=format`): pidiéndole el ancho
 * justo, la foto llega igual en desarrollo y en producción, sin ese paso. Medido 08-10 con la
 * foto de la portada en AVIF: 480 → 13 KB · 640 → 19 · 828 → 28 · 1080 → 47 · 1400 → 80.
 *
 * Uso en un `<img>` (sirve en componentes de servidor y de cliente):
 *   <img {...fotoResponsiva(foto, TAMANOS_PORTADA, { prioridad: i === 0 })} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
 * y, para la foto que mide el LCP, además `precargarFoto(foto, TAMANOS_PORTADA)` en el render:
 * la precarga y el `<img>` DEBEN usar los mismos `sizes` o el navegador baja dos fotos.
 * Una URL que no es de Unsplash (las SVG de `/demo/salon/`, una foto subida) pasa igual.
 */
import type { ImgHTMLAttributes } from "react";
import { preload } from "react-dom";

/** Anchos que se le piden a Unsplash: 400 px ×2 → 828 · 27rem = 432 px → 480 · 432 ×2 → 1080 · banners a pantalla entera → 1600. */
export const ANCHOS_FOTO = [480, 640, 828, 1080, 1280, 1600] as const;

/** El `sizes` de la foto de la portada (el del rediseño del 08-10: 27rem en escritorio, 92vw en el
 *  celular). Portada.tsx y `precargarFoto` deben leer ESTA constante, no repetir el texto. */
export const TAMANOS_PORTADA = "(min-width: 1024px) 27rem, (min-width: 768px) 25rem, 92vw";

const UNSPLASH = "https://images.unsplash.com/";

export function esFotoUnsplash(src: string): boolean {
  return src.startsWith(UNSPLASH);
}

/** La misma foto de Unsplash con otro ancho (y calidad); cualquier otra URL vuelve igual. */
export function urlFoto(src: string, ancho: number, calidad?: number): string {
  if (!esFotoUnsplash(src)) return src;
  const u = new URL(src);
  u.searchParams.set("w", String(Math.round(ancho)));
  if (calidad !== undefined) u.searchParams.set("q", String(calidad));
  else if (!u.searchParams.has("q")) u.searchParams.set("q", "70");
  if (!u.searchParams.has("auto")) u.searchParams.set("auto", "format");
  if (!u.searchParams.has("fit")) u.searchParams.set("fit", "crop");
  return u.toString();
}

/** `srcset` con los anchos de `ANCHOS_FOTO`; undefined si la foto no es de Unsplash. */
export function srcsetFoto(src: string, anchos: readonly number[] = ANCHOS_FOTO): string | undefined {
  if (!esFotoUnsplash(src)) return undefined;
  return anchos.map((w) => `${urlFoto(src, w)} ${w}w`).join(", ");
}

/**
 * Los atributos de un `<img>` que se baja al tamaño justo. Con `prioridad` (la foto del
 * LCP): carga ya y con prioridad alta; sin ella, perezosa. `decoding="async"` siempre.
 * El contenedor pone el tamaño (aspect-ratio o alto fijo + `absolute inset-0`): así el CLS
 * sigue en 0 sin width/height.
 */
export function fotoResponsiva(
  src: string,
  sizes: string,
  { prioridad = false }: { prioridad?: boolean } = {},
): Pick<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes" | "loading" | "decoding" | "fetchPriority"> {
  const srcSet = srcsetFoto(src);
  return {
    src: srcSet ? urlFoto(src, 1080) : src,
    ...(srcSet ? { srcSet, sizes } : {}),
    loading: prioridad ? "eager" : "lazy",
    decoding: "async",
    fetchPriority: prioridad ? "high" : "auto",
  };
}

/**
 * Precarga (`<link rel="preload" imagesrcset … fetchpriority="high">`) con los mismos
 * candidatos que `fotoResponsiva`: el navegador empieza a bajar la foto antes de llegar al
 * `<img>`. Llamarla en el render (React la sube al `<head>` y no la repite).
 */
export function precargarFoto(src: string, sizes: string): void {
  const imageSrcSet = srcsetFoto(src);
  const href = imageSrcSet ? urlFoto(src, 1080) : src;
  preload(href, { as: "image", fetchPriority: "high", ...(imageSrcSet ? { imageSrcSet, imageSizes: sizes } : {}) });
}
