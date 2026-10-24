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
 * Presentación «tipo imagen» (Brandon, 26-09: «quiero el texto sea tipo
 * formato imagen bien presentado»): un QR sin internet sólo puede traer texto,
 * así que cada línea arranca con un ícono de texto (emoji) que el celular pinta
 * en color —Google Lens y la cámara de Android lo muestran como una tarjeta—, y
 * una raya separa lo físico de la madera (arriba) de sus papeles (abajo). La
 * regla del panel «sin emojis» es para la interfaz, donde hay íconos Lucide;
 * acá no existe otra forma de dibujar. El ícono además ahorra bytes frente a
 * «Especie: » (4 contra 9).
 *
 * PURO y client-safe (sin "use client": lo usan la impresión y el lector).
 */

import { formatNumber } from "@/lib/format";
import { fmtM3, fmtPt } from "./cubicacion-formato";
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

/** El ícono de cada línea: también sirve para reconocer una línea suelta. */
export const ICONOS_FICHA = {
  especie: "🌳",
  volumen: "📦",
  medidas: "📏",
  pt: "🪚",
  registro: "🧾",
  gtf: "🚚",
  sniffs: "🔎",
  titular: "👤",
  permiso: "📜",
  /* Sumados para la ficha del Libro TH (28-09): mismo encabezado/formato que
     la de arriba, así la pistola de recepción del CTP lee las dos igual. */
  cientifico: "🔬",
  arbol: "🌲",
  plan: "📋",
} as const;

/** La raya entre la madera y sus papeles. */
export const RAYA_FICHA = "──────";

/**
 * La ficha como tarjeta de texto: `TROZA <código>`, lo físico (especie, m³,
 * D1·D2·largo, PT Oxapampa si ya se cubicó), una raya y los papeles (registro,
 * GTF, SNIFFS, titular, permiso). Lo que falta no se
 * escribe, salvo las medidas: D1, D2 y largo van siempre («—» si falta).
 */
export function textoFichaDeTroza(
  t: { oxPt?: number | null } & Pick<
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
  const vol = t.volumenM3 != null && Number.isFinite(Number(t.volumenM3)) ? `${fmtM3(Number(t.volumenM3))} m³` : null;
  const pt = t.oxPt != null && Number.isFinite(Number(t.oxPt)) && Number(t.oxPt) > 0 ? `${fmtPt(Number(t.oxPt))} PT Oxapampa` : null;
  const linea = (icono: string, v: string | null) => (v == null ? null : `${icono} ${v}`);
  const madera = [
    linea(ICONOS_FICHA.especie, texto(t.especieComun)),
    linea(ICONOS_FICHA.volumen, vol),
    linea(ICONOS_FICHA.medidas, medidasDeFicha(t)),
    linea(ICONOS_FICHA.pt, pt),
  ];
  const papeles = [
    linea(ICONOS_FICHA.registro, t.libroNro != null ? `Reg. N° ${t.libroNro}` : null),
    linea(ICONOS_FICHA.gtf, texto(t.gtfNumber) && `GTF ${texto(t.gtfNumber)}`),
    linea(ICONOS_FICHA.sniffs, texto(t.constanciaSniffs) && `SNIFFS ${texto(t.constanciaSniffs)}`),
    linea(ICONOS_FICHA.titular, texto(t.proveedor)),
    linea(ICONOS_FICHA.permiso, texto(t.permiso) && `Permiso ${texto(t.permiso)}`),
    /* El código del bosque NO va: no estaba en lo pedido, ya sale impreso en
       la etiqueta y con él una troza real de Blas pasaba a la versión 11 del
       QR (289 bytes; módulo de 0,27 mm en el rollo de 17 mm). */
  ].filter((l): l is string => l != null);
  return [
    `${ENCABEZADO_FICHA} ${codigo}`,
    ...madera.filter((l): l is string => l != null),
    ...(papeles.length > 0 ? [RAYA_FICHA, ...papeles] : []),
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
 * D1/D2/largo del Libro TH: `LothEntryDTO` guarda los diámetros en METROS
 * (`diamMayorM`/`diamMenorM`), no en cm como la troza del CTP — se convierte
 * acá, una sola vez, para que la ficha impresa hable en la misma unidad que
 * lee cualquier celular (cm). Igual que `partesDeMedidas`: D1, D2 y largo
 * SIEMPRE, con «—» si falta.
 */
export function partesDeMedidasLoth(e: {
  diamMayorM: string | number | null;
  diamMenorM: string | number | null;
  lengthM: string | number | null;
}): { diametros: string; largo: string } {
  const num = (v: string | number | null | undefined) => {
    if (v == null) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const d1 = num(e.diamMayorM);
  const d2 = num(e.diamMenorM);
  const d1cm = d1 != null ? cm(d1 * 100) : null;
  const d2cm = d2 != null ? cm(d2 * 100) : null;
  const diametros = `D1 ${d1cm ?? "—"} · D2 ${d2cm ?? "—"}${d1cm || d2cm ? " cm" : ""}`;
  const largoV = num(e.lengthM);
  const largo = largoV != null ? `L ${formatNumber(largoV, 2)} m` : "L —";
  return { diametros, largo };
}

/** «D1 45 · D2 48 cm · L 4.20 m» del Libro TH (ver `partesDeMedidasLoth`). */
export function medidasDeFichaLoth(e: {
  diamMayorM: string | number | null;
  diamMenorM: string | number | null;
  lengthM: string | number | null;
}): string {
  const { diametros, largo } = partesDeMedidasLoth(e);
  return `${diametros} · ${largo}`;
}

/** El código grande de la etiqueta del Libro TH: la troza, o el árbol si no la tiene. */
export function codigoDeEtiquetaLoth(e: { trozaCode: string | null; treeCode: string | null }): string {
  const t = (e.trozaCode ?? "").trim();
  if (t) return t;
  const a = (e.treeCode ?? "").trim();
  return a || "—";
}

/**
 * La ficha de una línea del Libro TH, como texto dentro del QR — MISMO
 * encabezado (`TROZA <código>`), mismos íconos y misma raya que
 * `textoFichaDeTroza` del CTP: la pistola de recepción del CTP la reconoce
 * sin distinguir de qué libro salió (Brandon, 2026-09-28: «que la lea la
 * misma pistola»). Contenido pedido: especie común/científica, D1·D2·largo,
 * volumen, árbol de origen, permiso/título habilitante y plan de manejo.
 */
export function textoFichaDeTrozaLoth(
  e: {
    trozaCode: string | null;
    treeCode: string | null;
    speciesCommon: string | null;
    speciesScientific: string | null;
    volumeM3: string | number | null;
    diamMayorM: string | number | null;
    diamMenorM: string | number | null;
    lengthM: string | number | null;
    gtfNumber: string | null;
  },
  opts: { tituloHabilitante?: string | null; planNumber?: string | null } = {},
): string {
  const codigo = codigoDeEtiquetaLoth(e);
  const vol = e.volumeM3 != null && Number.isFinite(Number(e.volumeM3)) ? `${fmtM3(Number(e.volumeM3))} m³` : null;
  const linea = (icono: string, v: string | null) => (v == null ? null : `${icono} ${v}`);
  const madera = [
    linea(ICONOS_FICHA.especie, texto(e.speciesCommon)),
    linea(ICONOS_FICHA.cientifico, texto(e.speciesScientific)),
    linea(ICONOS_FICHA.medidas, medidasDeFichaLoth(e)),
    linea(ICONOS_FICHA.volumen, vol),
  ];
  const papeles = [
    linea(ICONOS_FICHA.arbol, texto(e.treeCode) && `Árbol ${texto(e.treeCode)}`),
    linea(ICONOS_FICHA.permiso, texto(opts.tituloHabilitante) && `Permiso ${texto(opts.tituloHabilitante)}`),
    linea(ICONOS_FICHA.plan, texto(opts.planNumber) && `Plan ${texto(opts.planNumber)}`),
    linea(ICONOS_FICHA.gtf, texto(e.gtfNumber) && `GTF ${texto(e.gtfNumber)}`),
  ].filter((l): l is string => l != null);
  return [
    `${ENCABEZADO_FICHA} ${codigo}`,
    ...madera.filter((l): l is string => l != null),
    ...(papeles.length > 0 ? [RAYA_FICHA, ...papeles] : []),
  ].join("\n");
}

/**
 * ¿El texto es una ficha (empieza con `TROZA `), tenga o no código? Una pieza
 * sin código imprime `TROZA —`: eso no se busca como código, se avisa.
 */
export function esFichaDeTroza(leido: string | null | undefined): boolean {
  return new RegExp(`^${ENCABEZADO_FICHA}\\s`, "i").test((leido ?? "").replace(/^\uFEFF/, "").trim());
}

/**
 * Cómo arranca una línea de la ficha: su ícono o la raya. También las claves
 * `Clave:` de la primera versión (26-09), por si alguna etiqueta ya impresa
 * las trae.
 */
const MARCAS_FICHA = [...Object.values(ICONOS_FICHA), RAYA_FICHA.charAt(0)];
const CLAVES_VIEJAS = ["Especie", "Volumen", "Medidas", "N° registro", "GTF", "SNIFFS", "Titular", "Permiso", "Cód. bosque"];

/** Donde empieza la primera línea de la ficha, dondequiera que aparezca (texto pegado). */
const CORTE_DE_CLAVE = new RegExp(
  `(?:${[...MARCAS_FICHA, ...CLAVES_VIEJAS.map((k) => `${k.replace(".", "\\.")}:`)].join("|")})`,
  "i",
);

/**
 * ¿Es una línea suelta de la ficha (`Titular: …`)? La pistola 2D manda la
 * ficha línea por línea: después de `TROZA 118` llegan nueve lecturas más que
 * no son códigos y no deben avisar «ninguna troza con ese código».
 */
export function esLineaDeFicha(leido: string | null | undefined): boolean {
  const s = (leido ?? "").trim();
  return (
    MARCAS_FICHA.some((m) => s.startsWith(m)) ||
    CLAVES_VIEJAS.some((k) => s.toLowerCase().startsWith(`${k.toLowerCase()}:`))
  );
}
