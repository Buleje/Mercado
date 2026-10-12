/**
 * Los pares de letras de Musa (títulos + textos), auto-alojados en
 * `public/fonts/musa/` (subconjunto latín de Google Fonts, licencia OFL).
 *
 * Se usa UNO por página: su `@font-face` va dentro de la hoja de la marca
 * (`tema.ts`), así el navegador sólo baja los archivos del par elegido y sólo
 * cuando los pinta. Los componentes no nombran letras: usan las variables
 * `--mu-fuente-display` / `--mu-fuente-texto` / `--mu-fuente-script` o las
 * clases `.mu-*`.
 *
 * · A (el de la tienda): Cormorant Garamond 600 + Jost. 74 KB las tres caras
 *   (antes 141 KB: Cormorant variable recta e itálica, Poppins × 3 y Great Vibes
 *   precargada). Jost es variable: una sola cara para 400, 500 y 600.
 * · B: Playfair Display 600 + Poppins (lo que pide el manual, «Títulos:
 *   Cormorant o Playfair · Textos: Poppins»).
 * · C: Fraunces 600 + Plus Jakarta Sans.
 * Para comparar en el navegador: `/t/<negocio>?letras=b` (o `c`); sin el
 * parámetro, A. Cuando se elija uno, borrar los otros dos y sus archivos.
 *
 * Great Vibes (la script de los empaques) queda declarada en los tres, con
 * `font-display:block` (una cursiva de respaldo se ve rota): sólo se baja si
 * una página la pinta (catálogo, ficha, bolsa); la portada ya no la usa.
 */
export type ParLetras = "a" | "b" | "c";

interface Par {
  nombre: string;
  /** La familia de los títulos (el primer nombre del `font-family`). */
  display: string;
  texto: string;
  caras: string;
  /** Tamaños propios: cada serif rinde distinto al mismo tamaño (Cormorant es chica). */
  tamanos: string;
  /** Las caras del título del héroe (recta + cursiva): el LCP es ese texto, se precargan. */
  titulo: readonly [string, string];
}

const cara = (familia: string, archivo: string, peso: string, estilo = "normal", mostrar = "swap") =>
  `@font-face{font-family:"${familia}";src:url(/fonts/musa/${archivo}) format("woff2");font-weight:${peso};font-style:${estilo};font-display:${mostrar}}`;

/*
 * Las caras fijas (600) se declaran para 500-700: así un `font-semibold` o un
 * `font-bold` usan la misma cara sin «negrita falsa» del navegador.
 */
const POPPINS = [cara("Musa Poppins", "Poppins-400.woff2", "400"), cara("Musa Poppins", "Poppins-500.woff2", "500"), cara("Musa Poppins", "Poppins-600.woff2", "600 700")].join("");

export const PARES: Readonly<Record<ParLetras, Par>> = {
  a: {
    nombre: "Cormorant Garamond + Jost",
    display: "Musa Cormorant",
    texto: "Musa Jost",
    caras: [
      cara("Musa Cormorant", "CormorantGaramond-600.woff2", "500 700"),
      cara("Musa Cormorant", "CormorantGaramond-600-Italic.woff2", "500 700", "italic"),
      cara("Musa Jost", "Jost.woff2", "400 700"),
    ].join(""),
    tamanos: "--mu-t-heroe:clamp(2.75rem,1.6rem + 4.2vw,4.75rem);--mu-t-bloque:clamp(2rem,1.55rem + 1.4vw,2.875rem);",
    titulo: ["CormorantGaramond-600.woff2", "CormorantGaramond-600-Italic.woff2"],
  },
  b: {
    nombre: "Playfair Display + Poppins",
    display: "Musa Playfair",
    texto: "Musa Poppins",
    caras: [cara("Musa Playfair", "PlayfairDisplay.woff2", "500 700"), cara("Musa Playfair", "PlayfairDisplay-Italic.woff2", "500 700", "italic"), POPPINS].join(""),
    tamanos: "--mu-t-heroe:clamp(2.25rem,1.4rem + 3.4vw,4rem);--mu-t-bloque:clamp(2rem,1.6rem + 1.1vw,2.5rem);",
    titulo: ["PlayfairDisplay.woff2", "PlayfairDisplay-Italic.woff2"],
  },
  c: {
    nombre: "Fraunces + Plus Jakarta Sans",
    display: "Musa Fraunces",
    texto: "Musa Jakarta",
    caras: [
      cara("Musa Fraunces", "Fraunces.woff2", "500 700"),
      cara("Musa Fraunces", "Fraunces-Italic.woff2", "500 700", "italic"),
      cara("Musa Jakarta", "PlusJakartaSans.woff2", "400 700"),
    ].join(""),
    tamanos: "--mu-t-heroe:clamp(2.25rem,1.4rem + 3.4vw,4rem);--mu-t-bloque:clamp(2rem,1.6rem + 1.1vw,2.5rem);",
    titulo: ["Fraunces.woff2", "Fraunces-Italic.woff2"],
  },
};

const SCRIPT_CARA = cara("Musa Great Vibes", "GreatVibes-400.woff2", "400", "normal", "block");

/** Las URL de las caras del título del héroe, para `preload()` (sólo la portada). */
export const precargasDe = (par: ParLetras): string[] => PARES[par].titulo.map((f) => `/fonts/musa/${f}`);

/** Los `@font-face` del par (y la script, que se baja sólo si se pinta). */
export const carasDe = (par: ParLetras): string => PARES[par].caras + SCRIPT_CARA;

export const familiaDisplay = (par: ParLetras): string => `"${PARES[par].display}","Cormorant Garamond",Georgia,serif`;
export const familiaTexto = (par: ParLetras): string => `"${PARES[par].texto}",Poppins,var(--font-geist-sans),system-ui,sans-serif`;
export const FAMILIA_SCRIPT = `"Musa Great Vibes","Great Vibes","Segoe Script",cursive`;

/** `?letras=b` → "b". Cualquier otra cosa (o nada) → "a", el de la tienda. */
export function leerLetras(valor: string | string[] | undefined): ParLetras {
  const v = (Array.isArray(valor) ? valor[0] : valor)?.trim().toLowerCase();
  return v === "b" || v === "c" ? v : "a";
}
