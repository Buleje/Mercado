/**
 * ficha-texto-troza — la ficha de una troza escrita DENTRO del QR, en texto.
 *
 * Brandon (2026-09-26): «el primero va a trabajar sin internet mostrando
 * información así en texto». El QR de siempre lleva `/admin/q/<id>`: sin señal
 * y sin sesión no muestra nada. Éste lleva la ficha misma —código, especie,
 * m³, medidas, N° de registro, GTF, titular y permiso—, así que cualquier
 * celular la lee con la cámara en medio del patio o del camino, sin
 * aplicación ni cuenta. La etiqueta lleva además un QR chico con la dirección,
 * para trabajar en el sistema (`ctp-troza-etiquetas.ts`).
 *
 * Qué NO lleva, a propósito:
 *   · DNI/RUC de nadie: la etiqueta queda pegada en la madera a la vista de
 *     cualquiera. Lo que sí lleva (titular, permiso, GTF) es lo mismo que
 *     viaja impreso en la guía de transporte.
 *   · Nombre científico, resolución, parcela: están en la ficha del sistema.
 *     Cada línea agrega módulos al QR, y el QR de un sticker de 20 mm tiene
 *     que leerse con la etiqueta sucia. Medido con el codificador real: la
 *     troza típica de Blas sale en versión 8 (49 módulos, 0,39 mm en 20 mm) y
 *     la más larga posible en versión 10 (57 módulos, 0,34 mm). Un test lo
 *     vigila: si una línea nueva la pasa de ahí, falla.
 *
 * La primera línea es `TROZA <código>`: así el escáner del sistema, si la
 * cámara agarra este QR en vez del chico, igual sabe qué pieza es
 * (`codigoDeFichaTexto`, que usa `leer-escaneo-troza.ts`).
 *
 * PURO y client-safe (sin "use client": lo usan la impresión y el lector).
 */

import { formatNumber } from "@/lib/format";
import { fmtM3 } from "./cubicacion-formato";
import { esSinCodigo, type TrozaConsumible } from "./consumo-trozas";

/** La primera palabra de la ficha: marca que el texto es una ficha de troza. */
export const ENCABEZADO_FICHA = "TROZA";

/** «-» o «...» en el libro es «sin código» (49 de 160 trozas en Blas). */
const esSinMarca = (v: string) => esSinCodigo({ codificacion: v });

/** Lo que se lee grande en la etiqueta: la marca de planta, si no la del bosque. */
export function codigoDeEtiqueta(t: Pick<TrozaConsumible, "codigoPlanta" | "codificacion">): string {
  const planta = (t.codigoPlanta ?? "").trim();
  if (planta) return planta;
  const bosque = (t.codificacion ?? "").trim();
  return bosque && !esSinMarca(bosque) ? bosque : "—";
}

const cm = (v: number | null | undefined) =>
  v != null && Number.isFinite(Number(v)) ? formatNumber(Number(v), { max: 1 }) : null;

/**
 * Las tres medidas de la troza SIEMPRE, con su nombre: D1, D2 y largo
 * (Brandon, 2026-09-26: «en la troza tienen que estar las dimensiones de d1,
 * d2 y largo»). La que falta sale «—»: en Blas 77 de 84 trozas del patio no
 * traen D1/D2 (26-09), y esconderlas hacía creer que la etiqueta las omitía
 * cuando lo que falta es medirlas. Si sólo hay el diámetro declarado como un
 * número, va entre paréntesis.
 */
export function partesDeMedidas(t: Pick<TrozaConsumible, "d1Cm" | "d2Cm" | "diametroCm" | "largoM">): {
  diametros: string;
  largo: string;
} {
  const d1 = cm(t.d1Cm);
  const d2 = cm(t.d2Cm);
  const unico = !d1 && !d2 ? cm(t.diametroCm) : null;
  const diametros = `D1 ${d1 ?? "—"} · D2 ${d2 ?? "—"}${d1 || d2 ? " cm" : ""}${unico ? ` (Ø ${unico} cm)` : ""}`;
  const largo = t.largoM != null && Number.isFinite(Number(t.largoM)) ? `L ${formatNumber(Number(t.largoM), 2)} m` : "L —";
  return { diametros, largo };
}

/** «D1 45 · D2 48 cm · L 4.20 m» — las tres, siempre (ver `partesDeMedidas`). */
export function medidasDeFicha(t: Pick<TrozaConsumible, "d1Cm" | "d2Cm" | "diametroCm" | "largoM">): string {
  const { diametros, largo } = partesDeMedidas(t);
  return `${diametros} · ${largo}`;
}

const texto = (v: string | number | null | undefined) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
};

/**
 * La ficha en líneas `Clave: valor`. Lo que falta no se escribe (una etiqueta
 * llena de «—» no se lee); el código siempre va, aunque sea «—».
 */
export function textoFichaDeTroza(
  t: Pick<
    TrozaConsumible,
    | "codigoPlanta"
    | "codificacion"
    | "especieComun"
    | "volumenM3"
    | "d1Cm"
    | "d2Cm"
    | "diametroCm"
    | "largoM"
    | "libroNro"
    | "gtfNumber"
    | "constanciaSniffs"
    | "proveedor"
    | "permiso"
  >,
): string {
  const codigo = codigoDeEtiqueta(t);
  const bosque = texto(t.codificacion);
  const vol = t.volumenM3 != null && Number.isFinite(Number(t.volumenM3)) ? `${fmtM3(Number(t.volumenM3))} m³` : null;
  const lineas: [string, string | null][] = [
    ["Especie", texto(t.especieComun)],
    ["Volumen", vol],
    ["Medidas", medidasDeFicha(t)],
    ["N° registro", texto(t.libroNro)],
    ["GTF", texto(t.gtfNumber)],
    ["SNIFFS", texto(t.constanciaSniffs)],
    ["Titular", texto(t.proveedor)],
    ["Permiso", texto(t.permiso)],
    /* La marca del bosque sólo si no es la que ya va arriba. */
    ["Cód. bosque", bosque && !esSinMarca(bosque) && bosque !== codigo ? bosque : null],
  ];
  return [
    `${ENCABEZADO_FICHA} ${codigo}`,
    ...lineas.filter((l): l is [string, string] => l[1] != null).map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
}

/**
 * El código de una ficha leída: `TROZA 118\n…` → `118`. `null` si el texto no
 * es una ficha o la pieza no tenía código («—»).
 *
 * Acepta también la primera línea SOLA: una pistola 2D en modo teclado tipea
 * cada salto de línea como un Enter, así que la ficha llega partida en diez
 * lecturas y la primera es `TROZA 118`.
 */
export function codigoDeFichaTexto(leido: string | null | undefined): string | null {
  const primera = (leido ?? "").replace(/^\uFEFF/, "").trim().split(/\r?\n/, 1)[0] ?? "";
  const m = new RegExp(`^${ENCABEZADO_FICHA}\\s+(.+)$`, "i").exec(primera.trim());
  /* Una pistola configurada para tragarse los saltos de línea (o un campo de
     texto, que los borra) entrega `TROZA 118Especie: Tornillo…` pegado: el
     código termina donde empieza la primera clave de la ficha. */
  const codigo = m?.[1]?.split(CORTE_DE_CLAVE, 1)[0]?.trim();
  return codigo && !esSinMarca(codigo) ? codigo : null;
}

/**
 * ¿El texto es una ficha (empieza con `TROZA `), tenga o no código? Una pieza
 * sin código imprime `TROZA —`: eso no se busca como código, se avisa.
 */
export function esFichaDeTroza(leido: string | null | undefined): boolean {
  return new RegExp(`^${ENCABEZADO_FICHA}\\s`, "i").test((leido ?? "").replace(/^\uFEFF/, "").trim());
}

/** Las claves de las líneas de la ficha, para reconocer una línea suelta. */
const CLAVES_FICHA = ["Especie", "Volumen", "Medidas", "N° registro", "GTF", "SNIFFS", "Titular", "Permiso", "Cód. bosque"];

/** La primera clave de la ficha seguida de «:», dondequiera que aparezca. */
const CORTE_DE_CLAVE = new RegExp(`(?:${CLAVES_FICHA.map((k) => k.replace(".", "\\.")).join("|")}):`, "i");

/**
 * ¿Es una línea suelta de la ficha (`Titular: …`)? La pistola 2D manda la
 * ficha línea por línea: después de `TROZA 118` llegan nueve lecturas más que
 * no son códigos y no deben avisar «ninguna troza con ese código».
 */
export function esLineaDeFicha(leido: string | null | undefined): boolean {
  const s = (leido ?? "").trim();
  return CLAVES_FICHA.some((k) => s.toLowerCase().startsWith(`${k.toLowerCase()}:`));
}
