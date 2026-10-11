/**
 * Lo que se VE de cada cosa de la tienda, sin React (sirve en servidor y cliente):
 * · las ilustraciones de producto (`imagenDe`), el tinte de su categoría
 *   (`tinteDe`), su textura (`texturaDe`) y la frase «Ayuda a…» (`resumenDe`);
 * · las fotos de ambiente del salón (Unsplash) al tamaño de la pantalla (abajo).
 *
 * Ilustraciones (10-10): los productos de Musa todavía no tienen foto. Cada uno
 * tiene su envase ilustrado (como el catálogo de Navidad) en
 * `/musa/productos/<CÓDIGO>.webp`. Una foto real subida en el panel gana; sin
 * código conocido, la tarjeta dibuja el sello. Si el archivo no existe, el
 * componente cae al sello (`Ilustracion` en `TarjetaProducto.tsx`).
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

/** Donde viven los envases ilustrados (uno por código). */
export const CARPETA_ILUSTRACIONES = "/musa/productos/";
const CODIGO_MUSA = /^(MU\d{3}(-\d)?|KT\d{2})$/;

/**
 * La imagen de un producto: la foto del panel si es una foto real; si no, su
 * envase ilustrado por código. `ilustracion` = es dibujo (la ficha lo aclara:
 * «ilustración referencial»). Sin foto ni código de Musa → `src: null` (sello).
 */
export function imagenDe(p: { imagen: string; codigo: string | null }): { src: string | null; ilustracion: boolean } {
  if (p.imagen) return { src: p.imagen, ilustracion: p.imagen.startsWith(CARPETA_ILUSTRACIONES) };
  if (p.codigo && CODIGO_MUSA.test(p.codigo)) return { src: `${CARPETA_ILUSTRACIONES}${p.codigo}.webp`, ilustracion: true };
  return { src: null, ilustracion: false };
}

/**
 * Los envases vienen en 3 anchos: `/musa/productos/480/X.webp`, `/800/` y el
 * original de 1200. Medido 11-10 en la portada a 390 px: 14 envases pesaban
 * 386 KB con el de 1200 para un hueco de 170 px; los 27 en 480 suman 184 KB
 * (648 KB en 1200). Si se suma un envase, correr el recorte (LEEME.md, «Fotos»).
 * Una foto que no es un envase de la carpeta, sin `srcSet` (pasa igual).
 */
export function anchosIlustracion(src: string): string | undefined {
  const m = /^\/musa\/productos\/([A-Za-z0-9-]+\.webp)$/.exec(src);
  if (!m) return undefined;
  return `${CARPETA_ILUSTRACIONES}480/${m[1]} 480w, ${CARPETA_ILUSTRACIONES}800/${m[1]} 800w, ${src} 1200w`;
}

/** Lo que ocupa un envase en una tarjeta de la grilla (2 columnas en el celular, 3-4 en la compu). */
export const TAMANOS_TARJETA = "(min-width: 1024px) 18rem, (min-width: 640px) 33vw, 50vw";
/** El envase grande de la ficha. */
export const TAMANOS_FICHA = "(min-width: 1024px) 36rem, 92vw";

/** El fondo de la ilustración según la categoría (tokens de `tema.ts`); clases enteras para que Tailwind las vea. */
const TINTES: Readonly<Record<string, string>> = {
  Cabello: "bg-[var(--mu-tinte-cabello)]",
  Rostro: "bg-[var(--mu-tinte-rostro)]",
  Cuerpo: "bg-[var(--mu-tinte-cuerpo)]",
  "Kits y ofertas": "bg-[var(--mu-tinte-kits)]",
};
export const tinteDe = (categoria: string): string => TINTES[categoria] ?? "bg-[var(--mu-nude-claro)]";

export type Textura = "gel" | "crema" | "aceite" | "serum" | "bruma" | "lamina" | "granos";

export const NOMBRE_TEXTURA: Readonly<Record<Textura, string>> = {
  gel: "Gel suave",
  crema: "Crema",
  aceite: "Aceite ligero",
  serum: "Sérum en gotas",
  bruma: "Bruma en spray",
  lamina: "Lámina de tela",
  granos: "Exfoliante en granos",
};

/** La textura de cada producto suelto (la miniatura de la ficha); los kits no tienen una. */
const TEXTURAS: Readonly<Record<string, Textura>> = {
  MU001: "gel", MU002: "crema", MU003: "crema", MU004: "crema", MU005: "aceite",
  MU006: "bruma", MU007: "serum", MU008: "gel", MU009: "gel", MU010: "serum",
  MU011: "serum", MU012: "serum", MU013: "crema", MU014: "gel", MU015: "crema",
  MU016: "lamina", MU017: "crema", MU018: "granos", MU019: "aceite", MU020: "crema",
};

export const texturaDe = (codigo: string | null): Textura | null => (codigo && TEXTURAS[codigo]) || null;

/** La primera frase de la descripción («Ayuda a…»), para la línea de la tarjeta. */
export function resumenDe(descripcion: string | null): string | null {
  const t = descripcion?.trim();
  if (!t) return null;
  const fin = t.search(/\.(\s|$)/);
  return fin > 0 ? t.slice(0, fin + 1) : t;
}


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
