/**
 * Cómo se anotan las medidas del fuste (Tala) y de la troza (Trozado) en el
 * LO-TH: el estado del bloque de medición y lo que se deriva de él.
 *
 * Dos FORMAS de anotar el diámetro (Brandon 28-09: «hazlo en dos formas para
 * escoger… usar una y la otra y fijarlas»):
 *
 *  · **«Varias medidas por diámetro»** (`cruzadas`, ADR-422): dos o más
 *    medidas cruzadas por sección; el libro consigna el promedio. Es lo que
 *    pide la RDE 264-2019 (items 6 y 7) cuando se mide con forcípula al lado
 *    del árbol.
 *  · **«D1 y D2 promediados»** (`promedio`): la cuadrilla trae de la libreta el
 *    Ø de cada sección ya promediado. Se tipean dos números y listo.
 *
 * Las columnas del formato son las mismas en las dos (Ø mayor, Ø menor,
 * longitud, volumen). Lo que cambia es la medición cruda que se guarda con la
 * línea: con `promedio` NO se inventan medidas cruzadas que nadie tomó — los
 * arreglos van vacíos y la forma queda escrita, así se sabe que el Ø del libro
 * vino promediado de campo.
 *
 * Puro a propósito: el formulario lo usa y los tests lo prueban sin montar nada.
 */

import {
  calcularLongitud,
  promedioCruzado,
  volumenDeMedidas,
  type DescuentoLongitud,
  type ModoAprovechamiento,
} from "./loth-tala";

// ─── La forma de anotar el diámetro ─────────────────────────────────────────

export type FormaMedicion = "cruzadas" | "promedio";

export const FORMAS_MEDICION = [
  { key: "promedio", label: "D1 y D2 promediados" },
  { key: "cruzadas", label: "Varias medidas por Ø" },
] as const satisfies readonly { key: FormaMedicion; label: string }[];

/** La de siempre (ADR-422): nadie ve cambiar su pantalla hasta que elige. */
export const FORMA_MEDICION_POR_DEFECTO: FormaMedicion = "cruzadas";

export function esFormaMedicion(v: unknown): v is FormaMedicion {
  return v === "cruzadas" || v === "promedio";
}

// ─── El estado del bloque ────────────────────────────────────────────────────

export interface MedidasTala {
  modo: ModoAprovechamiento | null;
  /** «Varias medidas»: las dos (o más) medidas cruzadas de la sección mayor. */
  mayor: string[];
  /** Ídem sección menor. */
  menor: string[];
  /** «D1 y D2 promediados»: el Ø de la sección mayor, ya promediado en campo. */
  d1: string;
  /** Ídem sección menor. */
  d2: string;
  /** Longitud total del fuste (tala) o de la troza (trozado), antes de descuentos. */
  totalM: string;
  descuentos: DescuentoLongitud[];
  /**
   * Los números vinieron del censo, no de la forcípula. El DAP es del árbol EN
   * PIE y la altura comercial es una estimación: sirven para arrancar, pero el
   * libro consigna lo que se midió en el tocón. Mientras esté en true, la
   * pantalla lo dice en vez de disfrazar un estimado de medición.
   */
  origenCenso?: boolean;
}

export interface DerivadosTala {
  diamMayorM: number | null;
  diamMenorM: number | null;
  longitudM: number | null;
  volumenM3: number | null;
  excedeDescuento: boolean;
}

const num = (s: string | number | null | undefined): number | null => {
  const n = Number(s);
  return s != null && s !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/** Las medidas de cada sección que valen en ESTA forma. */
function seccionesDe(m: MedidasTala, forma: FormaMedicion): { mayor: (number | null)[]; menor: (number | null)[] } {
  if (forma === "promedio") return { mayor: [num(m.d1)], menor: [num(m.d2)] };
  return { mayor: m.mayor.map(num), menor: m.menor.map(num) };
}

/** Lo que va a las columnas del libro: Ø promedio, longitud aprovechable y volumen (Smalian). */
export function derivarTala(m: MedidasTala, forma: FormaMedicion = FORMA_MEDICION_POR_DEFECTO): DerivadosTala {
  const s = seccionesDe(m, forma);
  const largo = calcularLongitud(num(m.totalM), m.descuentos);
  return {
    diamMayorM: promedioCruzado(s.mayor),
    diamMenorM: promedioCruzado(s.menor),
    longitudM: largo.aprovechableM,
    volumenM3: volumenDeMedidas(s.mayor, s.menor, largo.aprovechableM),
    excedeDescuento: largo.excede,
  };
}

/**
 * Pasar de una forma a la otra sin perder lo tipeado: cada forma guarda sus
 * propios números. Al ir a «promediados» con D1/D2 vacíos, entra el promedio
 * de las cruzadas (ES el promedio: no se inventa nada). Al revés NO se
 * rellenan cruzadas con el promedio: serían dos medidas que nadie tomó.
 */
export function cambiarForma(m: MedidasTala, a: FormaMedicion): MedidasTala {
  if (a !== "promedio") return m;
  const texto = (v: number | null) => (v == null ? "" : String(v));
  return {
    ...m,
    d1: m.d1.trim() ? m.d1 : texto(promedioCruzado(m.mayor.map(num))),
    d2: m.d2.trim() ? m.d2 : texto(promedioCruzado(m.menor.map(num))),
  };
}

/**
 * El censo arranca la medición, no la reemplaza: el DAP entra como PRIMERA
 * medida (o como D1) y la pantalla avisa que hay que confirmarla en el tocón.
 * Antes se copiaba el DAP en Ø mayor y Ø menor a la vez —dos medidas cruzadas
 * que nadie tomó y un volumen cilíndrico—.
 */
export function conMedidasDelCenso(m: MedidasTala, dapM: number | null | undefined, hcM: number | null | undefined): MedidasTala {
  const dap = dapM ? String(dapM) : "";
  return {
    ...m,
    mayor: [dap, ""],
    menor: ["", ""],
    d1: dap,
    d2: "",
    totalM: hcM ? String(hcM) : m.totalM,
    origenCenso: true,
  };
}

/** Sin medidas, conservando lo que es de la operación y no de la pieza (el modo). */
export function medidasVacias(modo: ModoAprovechamiento | null = null): MedidasTala {
  return { modo, mayor: ["", ""], menor: ["", ""], d1: "", d2: "", totalM: "", descuentos: [] };
}

// ─── Lo que se guarda con la línea (ADR-422) ─────────────────────────────────

export interface MedicionCruda {
  /** Ausente en las líneas de antes del 28-09: esas son `cruzadas`. */
  forma?: FormaMedicion;
  mayor: number[];
  menor: number[];
  totalM: number | null;
  descuentos: { tipo: string; metros: number }[];
}

/**
 * De dónde salieron el Ø promedio y la longitud. `null` si no se midió nada
 * (no se guarda un respaldo vacío). Con `promedio` los arreglos van vacíos: el
 * Ø ya promediado vive en las columnas oficiales de la línea.
 */
export function medicionCrudaDe(m: MedidasTala, forma: FormaMedicion): MedicionCruda | null {
  const nums = (arr: string[]) => arr.map(num).filter((n): n is number => n != null);
  const cruzadas = forma === "cruzadas";
  const cruda: MedicionCruda = {
    forma,
    mayor: cruzadas ? nums(m.mayor) : [],
    menor: cruzadas ? nums(m.menor) : [],
    totalM: num(m.totalM),
    descuentos: m.descuentos.filter((d) => d.metros > 0),
  };
  const midioDiametro = cruzadas ? cruda.mayor.length > 0 || cruda.menor.length > 0 : num(m.d1) != null || num(m.d2) != null;
  return midioDiametro || cruda.totalM != null ? cruda : null;
}

/** La forma con la que se guardó una línea, si obliga a mostrarla así. */
export function formaDeLaLinea(cruda: { forma?: unknown } | null | undefined): FormaMedicion | null {
  /* Sólo «promediados» obliga: mostrada como cruzadas, el Ø promedio pasaría
     por una medida tomada. Una de cruzadas se ve bien en las dos formas. */
  return cruda?.forma === "promedio" ? "promedio" : null;
}

/** Lo que se necesita de la línea de la que se parte (duplicar o corregir). */
export interface LineaPlantilla {
  diamMayorM?: string | null;
  diamMenorM?: string | null;
  lengthM?: string | null;
  medicionCruda?: {
    forma?: unknown;
    mayor?: number[];
    menor?: number[];
    totalM?: number | null;
    descuentos?: { tipo: string; metros: number }[];
  } | null;
}

/**
 * Las medidas con las que arranca el formulario. Si la línea de la que se
 * parte guardó cómo se midió (ADR-422), se restaura tal cual: duplicar la
 * troza siguiente del mismo árbol no debería obligar a tipear todo de nuevo.
 */
export function medidasDePlantilla(p: LineaPlantilla | null | undefined): MedidasTala {
  const base = medidasVacias();
  if (!p) return base;
  const d1 = p.diamMayorM ?? "";
  const d2 = p.diamMenorM ?? "";
  const cruda = p.medicionCruda;
  if (cruda && formaDeLaLinea(cruda) === "promedio") {
    return {
      ...base,
      d1,
      d2,
      totalM: cruda.totalM != null ? String(cruda.totalM) : (p.lengthM ?? ""),
      descuentos: (cruda.descuentos ?? []) as DescuentoLongitud[],
    };
  }
  if (cruda && (cruda.mayor?.length || cruda.menor?.length || cruda.totalM != null)) {
    const aTexto = (ns: number[] | undefined) => {
      const t = (ns ?? []).map(String);
      while (t.length < 2) t.push("");
      return t;
    };
    return {
      ...base,
      mayor: aTexto(cruda.mayor),
      menor: aTexto(cruda.menor),
      d1,
      d2,
      totalM: cruda.totalM != null ? String(cruda.totalM) : "",
      descuentos: (cruda.descuentos ?? []) as DescuentoLongitud[],
    };
  }
  // Una línea vieja, sin cómo se midió: el Ø del libro entra en las dos formas.
  return { ...base, mayor: [d1, ""], menor: [d2, ""], d1, d2, totalM: p.lengthM ?? "" };
}
