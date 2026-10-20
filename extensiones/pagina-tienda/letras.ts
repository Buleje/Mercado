/**
 * Las 3 letras de la tienda de cada negocio (ADR-511), auto-alojadas: los
 * mismos subconjuntos latinos (OFL, variable 400-700) que usa Musa en
 * `public/fonts/musa/`. Nada de Google Fonts por `<link>`.
 *
 * ¿Por qué no `next/font`? Su hoja de @font-face se cuela en TODAS las tiendas
 * `/t/<negocio>` (medido 01-10 en /t/mi-pollo, memoria de Musa). El @font-face
 * vive dentro del `<style>` de la página (`cssTema` en `tema.ts`), así que sólo
 * lo baja quien dibuja esta plantilla.
 */
import type { TemaTienda } from "./contenido";

type Letra = TemaTienda["letra"];

const ARCHIVOS: Readonly<Record<Letra, { familia: string; archivo: string; nombre: string }>> = {
  jakarta: { familia: "Tienda Jakarta", archivo: "PlusJakartaSans.woff2", nombre: "Plus Jakarta Sans" },
  inter: { familia: "Tienda Inter", archivo: "Inter.woff2", nombre: "Inter" },
  manrope: { familia: "Tienda Manrope", archivo: "Manrope.woff2", nombre: "Manrope" },
};

const PILA = `var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;

/** `font-family` completo (la cara y, si aún no bajó, la del sistema). */
export const familiaDe = (letra: Letra): string => `"${ARCHIVOS[letra].familia}",${PILA}`;

/** El `@font-face` de la letra (variable 400-700, `swap`). */
export const carasDe = (letra: Letra): string => {
  const a = ARCHIVOS[letra];
  return `@font-face{font-family:"${a.familia}";src:url(/fonts/musa/${a.archivo}) format("woff2");font-weight:400 700;font-style:normal;font-display:swap}`;
};

/** La URL de la cara, para `preload()` en la portada (el título del héroe es el LCP). */
export const precargasDe = (letra: Letra): string[] => [`/fonts/musa/${ARCHIVOS[letra].archivo}`];

export const NOMBRE_LETRA = (letra: Letra): string => ARCHIVOS[letra].nombre;
