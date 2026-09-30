/**
 * Cuadre de guías — ¿lo que la GTF declara es lo que el libro despachó con ella?
 *
 * Dos fuentes que deben decir lo mismo:
 *  - **ForestGtf**: la guía emitida (m³ y piezas declarados ante SERFOR).
 *  - **Libro TH, sección Despacho de trozas**: las trozas que citan esa guía.
 *
 * Un inspector cruza justo eso. Si la guía declara 6,6102 m³ y las trozas que
 * la citan suman 6,610, cuadra; si suman 4,951, salió madera sin respaldo (o
 * quedó una troza sin asentar). Una guía citada en el libro que no existe en
 * ForestGtf es peor: el documento de origen no está.
 *
 * Pura: no lee nada, no muta. Relacionado: skill `serfor-osinfor-compliance`
 * (origen legal = GTF) y `loth-tablero-trozas.ts` (de dónde salen las trozas).
 */

import type { TrozaTablero } from "./loth-tablero-trozas";

/**
 * Tolerancia en m³. Se mide con cinta y el libro lleva 3 decimales: una
 * diferencia de 10 litros es redondeo, no un hueco (regla `verificacion-de-verdad` §4).
 */
export const TOLERANCIA_CUADRE_M3 = 0.01;

export type VeredictoGuia =
  | "cuadra"
  | "no_cuadra"
  | "citada_sin_registrar"
  | "registrada_sin_trozas"
  | "anulada_citada"
  | "sin_volumen";

/** Lo que hace falta de cada ForestGtf (lo trae `GET /api/admin/forestal/gtf`). */
export interface GtfRegistrada {
  gtfNumber: string;
  /** ISO. Date-only: se formatea en UTC. */
  gtfDate: string | null;
  /** Decimal(12,4): la API lo serializa como string. */
  volumenTotalM3: string | number | null;
  piezasTotal: number | null;
  placaVehiculo?: string | null;
  /** `emitida` | `anulada`. */
  status: string;
}

/** Lo mínimo de una troza del tablero que este cruce necesita. */
export type TrozaParaCuadre = Pick<TrozaTablero, "code" | "gtf" | "volumenM3" | "estado">;

export interface CuadreGuia {
  gtf: string;
  fecha: string | null;
  placa: string | null;
  /** null = la guía no está registrada, o no trae volumen. */
  declaradoM3: number | null;
  declaradoPiezas: number | null;
  /** Suma del volumen de las trozas que citan la guía (las sin volumen no suman). */
  libroM3: number;
  libroTrozas: number;
  /** Trozas del libro que citan la guía pero no tienen volumen registrado. */
  sinVolumen: number;
  /** libroM3 − declaradoM3; null si no hay declarado con qué comparar. */
  diferenciaM3: number | null;
  /** null = no hay declarado o no hay trozas: no se puede afirmar nada. */
  piezasCuadran: boolean | null;
  veredicto: VeredictoGuia;
  /** Códigos de las trozas del libro, para poder ir hasta ellas. */
  codigos: string[];
}

export const VEREDICTOS_META: Record<VeredictoGuia, { label: string; ayuda: string; orden: number }> = {
  no_cuadra: {
    label: "No cuadra",
    ayuda: "Los m³ que declara la guía no son los de las trozas que la citan",
    orden: 1,
  },
  citada_sin_registrar: {
    label: "Citada, sin registrar",
    ayuda: "El libro cita esta guía pero no existe entre las guías emitidas",
    orden: 2,
  },
  anulada_citada: {
    label: "Guía anulada",
    ayuda: "El libro despacha trozas con una guía que está anulada",
    orden: 3,
  },
  sin_volumen: {
    label: "Sin volumen",
    ayuda: "Falta el volumen de la guía o de alguna troza: no se puede cuadrar",
    orden: 4,
  },
  registrada_sin_trozas: {
    label: "Sin trozas en el libro",
    ayuda: "La guía está emitida pero ninguna línea de Despacho de trozas la cita",
    orden: 5,
  },
  cuadra: {
    label: "Cuadra",
    ayuda: `Diferencia de hasta ${TOLERANCIA_CUADRE_M3} m³ entre la guía y las trozas del libro`,
    orden: 6,
  },
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clave = (n: string) => n.trim().toUpperCase();

function aNumero(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Una fila por guía: la unión de las registradas y las citadas por el libro.
 *
 * Sólo cuentan las trozas que **citan** una guía (`gtf` no nulo); las que nunca
 * salieron no tienen nada que cuadrar. Las sin volumen no suman como 0: se
 * cuentan aparte y el veredicto pasa a «sin volumen» — sumar cero dibujaría
 * una diferencia falsa.
 */
export function cuadrarGuias(
  trozas: readonly TrozaParaCuadre[],
  gtfs: readonly GtfRegistrada[],
): CuadreGuia[] {
  const registradas = new Map<string, GtfRegistrada>();
  for (const g of gtfs) {
    const k = clave(g.gtfNumber);
    if (!k) continue;
    const previa = registradas.get(k);
    // Si hay dos con el mismo N°, manda la viva: una anulada no tapa a la emitida.
    if (!previa || (previa.status === "anulada" && g.status !== "anulada")) registradas.set(k, g);
  }

  const delLibro = new Map<string, { nombre: string; trozas: TrozaParaCuadre[] }>();
  for (const t of trozas) {
    const nombre = t.gtf?.trim();
    if (!nombre) continue;
    const k = clave(nombre);
    const b = delLibro.get(k);
    if (b) b.trozas.push(t);
    else delLibro.set(k, { nombre, trozas: [t] });
  }

  const claves = new Set<string>([...registradas.keys(), ...delLibro.keys()]);
  const filas: CuadreGuia[] = [];

  for (const k of claves) {
    const reg = registradas.get(k) ?? null;
    const lib = delLibro.get(k) ?? null;
    const propias = lib?.trozas ?? [];

    const conVolumen = propias.filter((t) => t.volumenM3 != null && t.volumenM3 > 0);
    const libroM3 = r4(conVolumen.reduce((a, t) => a + (t.volumenM3 ?? 0), 0));
    const sinVolumen = propias.length - conVolumen.length;

    const declaradoM3 = reg ? aNumero(reg.volumenTotalM3) : null;
    const declaradoPiezas = reg?.piezasTotal ?? null;
    const anulada = reg?.status === "anulada";

    let veredicto: VeredictoGuia;
    if (!reg) veredicto = "citada_sin_registrar";
    else if (propias.length === 0) veredicto = "registrada_sin_trozas";
    else if (anulada) veredicto = "anulada_citada";
    else if (declaradoM3 == null || sinVolumen > 0) veredicto = "sin_volumen";
    else if (Math.abs(libroM3 - declaradoM3) <= TOLERANCIA_CUADRE_M3 + 1e-9) veredicto = "cuadra";
    else veredicto = "no_cuadra";

    // Sin declarado, o sin volumen completo en el libro, no hay diferencia que mostrar.
    const hayDiferencia = reg != null && declaradoM3 != null && propias.length > 0 && sinVolumen === 0;

    filas.push({
      gtf: reg?.gtfNumber ?? lib?.nombre ?? k,
      fecha: reg?.gtfDate ?? null,
      placa: reg?.placaVehiculo?.trim() || null,
      declaradoM3: declaradoM3 != null ? r4(declaradoM3) : null,
      declaradoPiezas,
      libroM3,
      libroTrozas: propias.length,
      sinVolumen,
      diferenciaM3: hayDiferencia ? r4(libroM3 - (declaradoM3 as number)) : null,
      piezasCuadran: declaradoPiezas != null && propias.length > 0 ? declaradoPiezas === propias.length : null,
      veredicto,
      codigos: propias.map((t) => t.code).sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    });
  }

  // Lo que pide atención primero; dentro de cada veredicto, por N° de guía.
  return filas.sort((a, b) => {
    const d = VEREDICTOS_META[a.veredicto].orden - VEREDICTOS_META[b.veredicto].orden;
    return d !== 0 ? d : a.gtf.localeCompare(b.gtf, "es", { numeric: true });
  });
}

/** Cuántas guías hay por veredicto (para un resumen o un badge). */
export function contarVeredictos(filas: readonly CuadreGuia[]): Record<VeredictoGuia, number> {
  const out: Record<VeredictoGuia, number> = {
    no_cuadra: 0,
    citada_sin_registrar: 0,
    anulada_citada: 0,
    sin_volumen: 0,
    registrada_sin_trozas: 0,
    cuadra: 0,
  };
  for (const f of filas) out[f.veredicto]++;
  return out;
}
