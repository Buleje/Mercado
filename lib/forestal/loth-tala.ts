/**
 * Sección 1 · TALA del LO-TH — las reglas que la RDE 264-2019 describe en prosa
 * y que el formulario le pedía al motosierrista resolver de cabeza.
 *
 * Fuente primaria verificada 2026-09-20 (PDF oficial, no de memoria):
 * **RDE N° 264-2019-MINAGRI-SERFOR-DE**, Anexo 02 «Instrucciones para el
 * registro de información», Sección 1: Tala, items 1-10.
 * `https://faolex.fao.org/docs/pdf/per213939.pdf`
 *
 * Tres cosas que la norma dice y el libro no reflejaba:
 *
 *  1. **El diámetro que se consigna es un PROMEDIO** de dos o más medidas
 *     tomadas de forma cruzada (item 6/7, con ejemplo textual: «1.30 m y
 *     1.10 m ⇒ 1.20 m»). El campo pedía el resultado; quien mide con forcípula
 *     en el monte tiene dos números, no uno.
 *  2. **La longitud es la APROVECHABLE**, no la total (item 8): se descuentan
 *     aletas de la base, secciones con defecto y el despunte de copa. El
 *     ejemplo de la norma es literal: 15 m totales − 1 m de aletas = 14 m.
 *  3. **Los diámetros y el volumen son obligatorios SÓLO si el aserrío se hace
 *     dentro del área de aprovechamiento** (nota al pie de los items 6, 7 y 9,
 *     y considerando iii de la RDE: «la medición de los diámetros del fuste en
 *     la sección tala es opcional, mientras la medición de la longitud del
 *     fuste debe registrarse en todos los casos»). El formulario los exigía
 *     siempre: era más estricto que la norma, que es otra forma de estar mal.
 *
 * Nada de esto agrega columnas al libro: lo que se guarda sigue siendo el
 * diámetro promedio y la longitud aprovechable, que es exactamente lo que pide
 * el formato oficial. Acá vive cómo se llega a esos números sin calculadora.
 */

import { smalianVolume } from "./loth-constants";

// ─── Modo de aprovechamiento (Art. 4 de la RDE) ────────────────────────────

/**
 * Qué hace el titular con la troza, que es lo que decide qué columnas son
 * obligatorias. Art. 4: quien despacha trozas usa las secciones 1-2-3; quien
 * asierra dentro del área usa 1-2-4-5-6.
 */
export type ModoAprovechamiento = "despacho_trozas" | "aserrio_en_area";

/** Los dos modos, como se eligen en pantalla. */
export const MODOS_UI = [
  { key: "despacho_trozas", label: "Despacho trozas", ayuda: "La troza sale del área hacia un CTP" },
  { key: "aserrio_en_area", label: "Aserrío en área", ayuda: "Se asierra dentro del área de aprovechamiento" },
] as const satisfies readonly { key: ModoAprovechamiento; label: string; ayuda: string }[];

export interface ObligatoriedadTala {
  /** Ø mayor y Ø menor (items 6 y 7). */
  diametros: boolean;
  /** Volumen por Smalian (item 9). */
  volumen: boolean;
  /** Longitud aprovechable (item 8) — siempre, en los dos modos. */
  longitud: true;
  /** Por qué, en una línea, para mostrarlo en pantalla. */
  razon: string;
}

/**
 * Qué tiene que llenar sí o sí esta línea de tala.
 *
 * Ojo con el default: cuando no se sabe el modo, se pide todo. Un libro con un
 * campo de más se corrige; uno con un campo de menos, en fiscalización, no.
 */
export function obligatoriedadTala(modo: ModoAprovechamiento | null | undefined): ObligatoriedadTala {
  if (modo === "despacho_trozas") {
    return {
      diametros: false,
      volumen: false,
      longitud: true,
      razon: "Despachas trozas del área: la norma sólo exige la longitud aprovechable en Tala (los diámetros y el volumen se registran en Trozado).",
    };
  }
  if (modo === "aserrio_en_area") {
    return {
      diametros: true,
      volumen: true,
      longitud: true,
      razon: "Asierras dentro del área: la RDE 264-2019 exige también los diámetros y el volumen en la sección Tala.",
    };
  }
  return {
    diametros: true,
    volumen: true,
    longitud: true,
    razon: "Elige qué haces con la troza. Mientras tanto se piden todos los campos, que es lo más exigente.",
  };
}

// ─── Item 6 y 7 · el diámetro es un promedio de medidas cruzadas ───────────

/**
 * Promedio de las medidas cruzadas de una sección, redondeado a milímetros.
 *
 * La norma pide «2 o más medidas en dicha sección de forma cruzada». Se
 * aceptan N medidas y se ignoran las vacías, porque en campo a veces se toma
 * una tercera para desempatar un fuste ovalado.
 *
 * Devuelve `null` si no hay ninguna medida útil — nunca 0, que en un libro
 * forestal se lee como «midió y dio cero».
 */
export function promedioCruzado(medidas: readonly (number | null | undefined)[]): number | null {
  const validas = medidas.filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0);
  if (validas.length === 0) return null;
  const suma = validas.reduce((a, b) => a + b, 0);
  return Math.round((suma / validas.length) * 1000) / 1000;
}

/** ¿Las dos medidas cruzadas difieren tanto que conviene una tercera? */
export function fusteIrregular(medidas: readonly (number | null | undefined)[], toleranciaPct = 25): boolean {
  const validas = medidas.filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0);
  if (validas.length < 2) return false;
  const min = Math.min(...validas);
  const max = Math.max(...validas);
  if (min <= 0) return false;
  return ((max - min) / min) * 100 > toleranciaPct;
}

// ─── Item 8 · la longitud que se consigna es la aprovechable ───────────────

/**
 * Los descuentos que la norma nombra uno por uno en el item 8. Se listan con su
 * nombre de campo porque el motosierrista dice «tiene aletas», no «descuento
 * basal por irregularidad morfológica».
 */
export const TIPOS_DESCUENTO = [
  { key: "aletas", label: "Aletas en la base", ayuda: "Lo que se corta de la culata por las aletas o raíces tablares" },
  { key: "pudricion", label: "Pudrición", ayuda: "Sección con pudrición que no se va a aprovechar" },
  { key: "hueco", label: "Hueco", ayuda: "Tramo hueco del fuste" },
  { key: "rajadura", label: "Rajadura", ayuda: "Rajaduras que inutilizan el tramo" },
  { key: "dano", label: "Daño físico", ayuda: "Golpes de la tumba, daño de máquina" },
  { key: "despunte", label: "Despunte de copa", ayuda: "La parte de la copa que se separa" },
] as const;

export type TipoDescuento = (typeof TIPOS_DESCUENTO)[number]["key"];

export interface DescuentoLongitud {
  tipo: TipoDescuento;
  metros: number;
}

export interface CalculoLongitud {
  /** Longitud total del fuste medida en campo. */
  totalM: number | null;
  /** Suma de los descuentos declarados. */
  descontadoM: number;
  /** Lo que va al libro (item 8). */
  aprovechableM: number | null;
  /** El descuento se comió el fuste entero: hay un error de medición. */
  excede: boolean;
}

/**
 * Longitud aprovechable = total − descuentos (item 8).
 *
 * Si los descuentos igualan o superan el total, no se devuelve 0: se marca
 * `excede` y se deja `aprovechableM` en null. Un 0 en la columna de longitud
 * pasa el validador y produce un volumen 0 que nadie vuelve a mirar; el aviso,
 * en cambio, se corrige en el momento.
 */
export function calcularLongitud(
  totalM: number | null | undefined,
  descuentos: readonly DescuentoLongitud[],
): CalculoLongitud {
  const total = typeof totalM === "number" && Number.isFinite(totalM) && totalM > 0 ? totalM : null;
  const descontado =
    Math.round(
      descuentos.reduce((a, d) => a + (Number.isFinite(d.metros) && d.metros > 0 ? d.metros : 0), 0) * 100,
    ) / 100;

  if (total == null) return { totalM: null, descontadoM: descontado, aprovechableM: null, excede: false };

  const restante = Math.round((total - descontado) * 100) / 100;
  if (restante <= 0) return { totalM: total, descontadoM: descontado, aprovechableM: null, excede: true };
  return { totalM: total, descontadoM: descontado, aprovechableM: restante, excede: false };
}

// ─── Item 9 · volumen ──────────────────────────────────────────────────────

/**
 * Volumen del fuste por Smalian, a partir de las medidas crudas de campo.
 *
 * Reusa `smalianVolume` de `loth-constants` a propósito: la fórmula del libro
 * vive en un solo lugar (el formulario tenía una copia propia, que es como se
 * llega a que dos pantallas cubiquen distinto el mismo árbol).
 */
export function volumenDeMedidas(
  mayorCruzados: readonly (number | null | undefined)[],
  menorCruzados: readonly (number | null | undefined)[],
  longitudAprovechableM: number | null,
): number | null {
  const mayor = promedioCruzado(mayorCruzados);
  const menor = promedioCruzado(menorCruzados);
  if (mayor == null || menor == null || longitudAprovechableM == null || longitudAprovechableM <= 0) return null;
  const v = smalianVolume(mayor, menor, longitudAprovechableM);
  return v > 0 ? v : null;
}

// ─── Item 10 · las observaciones que la norma tipifica ─────────────────────

/**
 * El item 10 no es un campo libre: nombra cuatro casos y **el término exacto**
 * que el fiscalizador busca («descartado», «consumo interno»). Escrito a mano
 * sale «se descartó», «descarte», «no sirve» — y entonces el filtro del
 * inspector no lo encuentra.
 */
export const MOTIVOS_TALA = [
  {
    key: "descartado",
    termino: "Descartado",
    label: "Descartado (no aprovechable)",
    pideDetalle: true,
    ayuda: "Item 10-i: hay que consignar el término y detallar el motivo",
  },
  {
    key: "consumo_interno",
    termino: "Consumo interno",
    label: "Consumo interno (campamento, puentes)",
    pideDetalle: true,
    ayuda: "Item 10-iv: el término exacto más el motivo",
  },
  {
    key: "especie_difiere",
    termino: "Nombre científico",
    label: "La especie difiere de la del plan",
    pideDetalle: false,
    ayuda: "Item 10-ii: se consigna el nombre científico en observaciones",
  },
  {
    key: "especie_ambigua",
    termino: "Nombre científico",
    label: "El nombre común abarca más de dos especies",
    pideDetalle: false,
    ayuda: "Item 10-iii: se consigna el nombre científico en observaciones",
  },
  {
    key: "caido_natural",
    termino: "Árbol caído de forma natural",
    label: "Árbol caído de forma natural (censado)",
    pideDetalle: false,
    ayuda: "Item 2: si está censado, la fecha es la del inicio de la actividad",
  },
] as const;

export type MotivoTala = (typeof MOTIVOS_TALA)[number]["key"];

/** ¿Este motivo obliga a escribir el nombre científico? */
export function motivoPideCientifico(motivos: readonly MotivoTala[]): boolean {
  return motivos.includes("especie_difiere") || motivos.includes("especie_ambigua");
}

/**
 * Arma el texto de la columna Observaciones con los términos que la norma
 * nombra, sin pisar lo que la persona ya escribió.
 *
 * El orden importa poco para el sistema y mucho para quien lee el libro: los
 * términos tipificados primero, el texto libre después.
 */
export function componerObservaciones(opts: {
  motivos: readonly MotivoTala[];
  detalle?: string | null;
  nombreCientifico?: string | null;
  textoLibre?: string | null;
}): string {
  const partes: string[] = [];
  const vistos = new Set<string>();

  for (const key of opts.motivos) {
    const m = MOTIVOS_TALA.find((x) => x.key === key);
    if (!m || vistos.has(m.termino)) continue;
    vistos.add(m.termino);
    if (m.termino === "Nombre científico") {
      const cient = (opts.nombreCientifico ?? "").trim();
      if (cient) partes.push(`Nombre científico: ${cient}`);
      continue;
    }
    partes.push(m.termino);
  }

  const detalle = (opts.detalle ?? "").trim();
  if (detalle) partes.push(detalle);

  const libre = (opts.textoLibre ?? "").trim();
  if (libre) partes.push(libre);

  return partes.join(" · ");
}

// ─── Item 3 · el código va en el fuste Y en el tocón ───────────────────────

/**
 * El item 3 pide que el código «sea colocado físicamente en el fuste y el
 * tocón con materiales durables (placa metálica o plástica, pintura esmalte)».
 * Es lo primero que un supervisor de OSINFOR busca en campo, y no vivía en
 * ninguna parte del libro.
 */
export const MARCAS_FISICAS = [
  { key: "fuste", label: "Código marcado en el fuste" },
  { key: "tocon", label: "Código marcado en el tocón" },
] as const;

export type MarcaFisica = (typeof MARCAS_FISICAS)[number]["key"];

export interface EstadoMarcado {
  completo: boolean;
  faltan: string[];
}

/** Qué marca física falta declarar. */
export function estadoMarcado(marcas: readonly MarcaFisica[]): EstadoMarcado {
  const faltan = MARCAS_FISICAS.filter((m) => !marcas.includes(m.key)).map((m) => m.label);
  return { completo: faltan.length === 0, faltan };
}
