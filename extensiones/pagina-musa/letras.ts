/**
 * Las letras de Musa (rediseño minimalista del 16-10): UNA sans para todo
 * —títulos, textos, precios y botones—, auto-alojada en `public/fonts/musa/`
 * (subconjunto latín de Google Fonts, licencia OFL, variable 400-700: una sola
 * cara para todos los pesos). La jerarquía la dan el tamaño y el peso, no la
 * familia ni el color.
 *
 * · A (la de la tienda): Plus Jakarta Sans, 27 KB. Ojo grande y aberturas
 *   abiertas: se lee bien a 14-16 px y a 60 px sigue limpia; más suave que una
 *   grotesca (va con belleza).
 * · B: Inter, 48 KB: la más neutra, la familia de MiSans (mi.com).
 * · C: Manrope, 25 KB: geométrica, más redonda en los títulos.
 * Para comparar en el navegador: `/t/<negocio>?letras=b` (o `c`); sin el
 * parámetro, A.
 *
 * La serif (Cormorant Garamond 600) queda SÓLO para el sello completo del logo
 * (`Sello.tsx` sin `simple`): se declara y el navegador la baja únicamente si
 * ese sello se pinta. Antes iban Cormorant + su itálica + Jost + Great Vibes
 * (la script): títulos que no se entendían y cuatro archivos por página.
 *
 * ¿Por qué no `next/font`? En «Buleje Beauty» su hoja de @font-face se colaba
 * en TODAS las tiendas `/t/<negocio>` (medido 01-10 en /t/mi-pollo). Acá el
 * @font-face vive dentro del `<style>` de la página (`tema.ts`).
 */
export type ParLetras = "a" | "b" | "c";

interface Par {
  nombre: string;
  /** La familia (el primer nombre del `font-family`). */
  familia: string;
  caras: string;
  /** Tamaños propios: cada sans rinde distinto al mismo tamaño. */
  tamanos: string;
  /** El archivo de la cara: el título del héroe es el LCP, se precarga. */
  archivo: string;
}

const cara = (familia: string, archivo: string, peso: string, estilo = "normal", mostrar = "swap") =>
  `@font-face{font-family:"${familia}";src:url(/fonts/musa/${archivo}) format("woff2");font-weight:${peso};font-style:${estilo};font-display:${mostrar}}`;

const sans = (familia: string, archivo: string) => cara(familia, archivo, "400 700");

export const PARES: Readonly<Record<ParLetras, Par>> = {
  a: {
    nombre: "Plus Jakarta Sans",
    familia: "Musa Jakarta",
    caras: sans("Musa Jakarta", "PlusJakartaSans.woff2"),
    tamanos: "--mu-t-heroe:clamp(2.25rem,1.5rem + 3vw,3.75rem);--mu-t-bloque:clamp(1.625rem,1.35rem + 1.1vw,2.25rem);",
    archivo: "PlusJakartaSans.woff2",
  },
  b: {
    nombre: "Inter",
    familia: "Musa Inter",
    caras: sans("Musa Inter", "Inter.woff2"),
    tamanos: "--mu-t-heroe:clamp(2.25rem,1.5rem + 3vw,3.75rem);--mu-t-bloque:clamp(1.625rem,1.35rem + 1.1vw,2.25rem);",
    archivo: "Inter.woff2",
  },
  c: {
    nombre: "Manrope",
    familia: "Musa Manrope",
    caras: sans("Musa Manrope", "Manrope.woff2"),
    tamanos: "--mu-t-heroe:clamp(2.25rem,1.5rem + 3vw,3.75rem);--mu-t-bloque:clamp(1.625rem,1.35rem + 1.1vw,2.25rem);",
    archivo: "Manrope.woff2",
  },
};

/** La serif del sello completo (sólo se baja si se pinta). */
const LOGO_CARA = cara("Musa Cormorant", "CormorantGaramond-600.woff2", "500 700");

/** La URL de la cara del par, para `preload()` (sólo la portada). */
export const precargasDe = (par: ParLetras): string[] => [`/fonts/musa/${PARES[par].archivo}`];

/** Los `@font-face` del par (y la del logo, que se baja sólo si se pinta). */
export const carasDe = (par: ParLetras): string => PARES[par].caras + LOGO_CARA;

const PILA = `var(--font-geist-sans),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;

/** Títulos y textos: la misma familia (los títulos se distinguen por tamaño y peso). */
export const familiaDisplay = (par: ParLetras): string => `"${PARES[par].familia}",${PILA}`;
export const familiaTexto = (par: ParLetras): string => `"${PARES[par].familia}",${PILA}`;

/** `?letras=b` → "b". Cualquier otra cosa (o nada) → "a", el de la tienda. */
export function leerLetras(valor: string | string[] | undefined): ParLetras {
  const v = (Array.isArray(valor) ? valor[0] : valor)?.trim().toLowerCase();
  return v === "b" || v === "c" ? v : "a";
}

