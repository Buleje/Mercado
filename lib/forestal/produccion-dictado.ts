/**
 * Un paquete de producción dicho de un tirón: «20 de 1×7×5» = 20 piezas de
 * 1″ × 7″ × 5′ = 58,33 PT · 0,1376 m³ (Brandon 28-10, «Registrar producción»
 * por pasos). Reusa el parser del cubicador (`parseDictado`): mismas palabras,
 * mismos homófonos, mismas unidades por defecto (pulgadas, pulgadas, pies).
 *
 * Lo único nuevo es la forma corta de la planta: «20 de …» sin decir «piezas».
 * El cubicador no la necesita (allí cada pieza es una fila); en la producción
 * la cantidad va primero, así que el primer número seguido de otras tres
 * medidas es la cantidad.
 */
import { cubicarPieza, normalizeText, parseDictado, type Unidad } from "./cubicacion";

export interface PaqueteDictado {
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
  /** PT redondeado a 2 decimales, como en la plaza. */
  pieTablar: number;
  /** m³ derivado del PT ya redondeado (PT ÷ 424, a 4 decimales). */
  m3: number;
  /**
   * cm × cm × m: las mismas unidades del formulario dimensionado, así que el
   * paquete entra con sus medidas. En pulgadas y pies entra por volumen.
   */
  metrico: boolean;
}

const SIMBOLO: Record<Unidad, string> = { pulg: "″", pies: "′", cm: " cm", m: " m" };

/**
 * Lo ESCRITO que el parser de voz no entiende y leería mal sin avisar (revisión
 * 28-10: «2 x 20 x 3,20» salía 4,717 m³ en vez de 0,5031). Devuelve null cuando
 * la medida queda ambigua: mejor no cargar nada que cargar otra cosa.
 */
function prepararEscrito(texto: string): string | null {
  /* «1,5» escrito es decimal; `normalizeText` toma la coma por puntuación y lee «1 5». */
  let t = texto.replace(/(\d),(\d)/g, "$1.$2");
  /* Unidad pegada o abreviada («2cm», «3.20 m»): el parser sólo reconoce la palabra suelta. */
  t = t.replace(/(\d)\s*cm\b/gi, "$1 centimetros ").replace(/(\d)\s*m\b/gi, "$1 metros ");
  /* «20de1x7x5»: sin espacios el «de» no separa la cantidad. */
  t = t.replace(/(\d)\s*de\s*(?=\d)/gi, "$1 de ");
  /* «1 1/2» o «1/2» escritos: el parser no lee fracciones con barra («uno y medio» sí). */
  if (/\d\s*\/\s*\d/.test(t)) return null;
  /* cm o m junto con pulgadas o pies: no se sabe qué medida va en qué unidad. */
  const metrico = /centimetros?|\bmetros?\b|\bmts?\b/i.test(t);
  const imperial = /pulgadas?|\bpies?\b|["″'′]/i.test(t);
  return metrico && imperial ? null : t;
}

export function leerPaqueteDictado(texto: string): PaqueteDictado | null {
  const escrito = prepararEscrito(texto);
  if (escrito == null) return null;
  const s = normalizeText(escrito);
  const numeros = s.match(/\d+(?:\.\d+)?/g) ?? [];
  /* «20 de 1 por 7» dijo la cantidad y sólo dos medidas: falta una, no se adivina. */
  if (numeros.length < 4 && /^\s*\d+\s+de\s+(?=\d)/.test(s)) return null;
  /* Sólo con 4 números: «1 por 7 por 5» solo es UNA pieza, no 1 de 7 × 5.
     Con 4, el primero es la cantidad aunque vaya con «x» («20 x 1 x 7 x 5»). */
  const conCantidad =
    numeros.length >= 4 ? s.replace(/^\s*(\d+)\s+(?:de\s+|por\s+)?(?=\d)/, " $1 piezas de ") : s;
  const p = parseDictado(conCantidad);
  if (!p.ok || p.espesor == null || p.ancho == null || p.largo == null) return null;
  const { pieTablar, m3 } = cubicarPieza({
    cantidad: p.cantidad,
    espesor: p.espesor,
    ancho: p.ancho,
    largo: p.largo,
    uEspesor: p.uEspesor,
    uAncho: p.uAncho,
    uLargo: p.uLargo,
  });
  if (!(m3 > 0)) return null;
  return {
    cantidad: p.cantidad,
    espesor: p.espesor,
    ancho: p.ancho,
    largo: p.largo,
    uEspesor: p.uEspesor,
    uAncho: p.uAncho,
    uLargo: p.uLargo,
    pieTablar,
    m3,
    metrico: p.uEspesor === "cm" && p.uAncho === "cm" && p.uLargo === "m",
  };
}

/** «20 pza de 1″ × 7″ × 5′»: lo que se entendió, para confirmarlo de un vistazo. */
export function medidasDelDictado(d: PaqueteDictado): string {
  const n = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  return `${d.cantidad} pza de ${n(d.espesor)}${SIMBOLO[d.uEspesor]} × ${n(d.ancho)}${SIMBOLO[d.uAncho]} × ${n(d.largo)}${SIMBOLO[d.uLargo]}`;
}
