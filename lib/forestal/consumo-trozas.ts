/**
 * consumo-trozas.ts — elegir QUÉ PIEZAS entran a la sierra (ADR-326).
 *
 * El consumo del libro es `ForestCtpConsumo`: ingreso → corrida, en m³. Ahí viven
 * las invariantes I1-I6 y el costeo, y así se queda. Lo que faltaba es decir
 * **cuáles trozas** se consumieron: un fiscalizador no cuenta metros cúbicos
 * abstractos, cuenta piezas en la pila.
 *
 * Del ERP forestal de referencia (AppForestal, módulo `consumo`), donde el
 * operador tilda las trozas de una tabla filtrable en vez de tipear un volumen.
 * En el patio eso es lo que pasa: se eligen los palos que entran al carro.
 *
 * PURO y client-safe.
 */

import { PT_POR_M3 } from "./cubicacion";

/** Una troza candidata a consumirse. */
export interface TrozaConsumible {
  id: string;
  woodEntryId: string;
  codificacion: string | null;
  codigoPlanta?: string | null;
  parcela?: string | null;
  especieComun: string | null;
  especieCientifica?: string | null;
  dimensiones?: string | null;
  volumenM3: number | null;
  /** La guía por la que entró — para agrupar y para el filtro. */
  gtfNumber?: string | null;
  proveedor?: string | null;
  fechaRecepcion?: string | null;
  /** Ya consumida en otra corrida: no se puede volver a elegir. */
  consumidaEnId?: string | null;
  /** Declarada en la guía pero nunca llegó (ADR-325): no se puede consumir. */
  noRecepcionada?: boolean | null;
  /** Es un pedazo de otra troza (ADR-313). */
  trozaOrigenId?: string | null;
  /** Cuántos pedazos tiene: una madre partida ya no entra entera a la sierra. */
  retrozos?: number;
  /** El pedazo que no sirve: ocupa volumen pero no es producto. */
  descarte?: boolean | null;
}

/** Por qué una troza no se puede elegir. `null` = está disponible. */
export type MotivoBloqueo =
  | "ya_consumida"
  | "no_recepcionada"
  | "descarte"
  | "madre_retrozada"
  | "sin_volumen";

/**
 * Qué impide consumir esta troza.
 *
 * **Una madre con pedazos NO se consume entera**: al cortarla dejó de existir
 * como pieza; lo que entra a la sierra son los pedazos. Consumir las dos cosas
 * contaría la misma madera dos veces, que es lo que I2 evita en el otro extremo.
 */
export function motivoBloqueo(t: TrozaConsumible): MotivoBloqueo | null {
  if (t.consumidaEnId) return "ya_consumida";
  if (t.noRecepcionada) return "no_recepcionada";
  if (t.descarte) return "descarte";
  if ((t.retrozos ?? 0) > 0) return "madre_retrozada";
  if (!(Number(t.volumenM3) > 0)) return "sin_volumen";
  return null;
}

export const LABEL_BLOQUEO: Record<MotivoBloqueo, string> = {
  ya_consumida: "Ya entró a otra corrida",
  no_recepcionada: "No llegó al patio",
  descarte: "Descarte del retrozado: no es producto",
  madre_retrozada: "Se cortó en pedazos: consumí los pedazos",
  sin_volumen: "Sin volumen registrado",
};

export function estaDisponible(t: TrozaConsumible): boolean {
  return motivoBloqueo(t) === null;
}

/** Filtros de la tabla — los mismos que usa el operador en el patio. */
export interface FiltroTrozas {
  texto?: string;
  especie?: string;
  gtf?: string;
  proveedor?: string;
  /** `true` = esconder las que no se pueden elegir. */
  soloDisponibles?: boolean;
}

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Aplica los filtros. El texto busca por las DOS codificaciones —la del bosque y
 * la que marcó el patio— porque el operador tipea la que tiene delante.
 */
export function filtrarTrozas(
  trozas: readonly TrozaConsumible[],
  f: FiltroTrozas,
): TrozaConsumible[] {
  const texto = norm(f.texto);
  const especie = norm(f.especie);
  const gtf = norm(f.gtf);
  const proveedor = norm(f.proveedor);

  return trozas.filter((t) => {
    if (f.soloDisponibles && !estaDisponible(t)) return false;
    if (especie && norm(t.especieComun) !== especie) return false;
    if (gtf && norm(t.gtfNumber) !== gtf) return false;
    if (proveedor && norm(t.proveedor) !== proveedor) return false;
    if (texto) {
      const campos = [t.codificacion, t.codigoPlanta, t.parcela, t.especieComun, t.gtfNumber];
      if (!campos.some((c) => norm(c).includes(texto))) return false;
    }
    return true;
  });
}

/** Totales de una selección. El pie tablar va porque acá la madera se habla en PT. */
export interface TotalesSeleccion {
  piezas: number;
  volumenM3: number;
  pieTablar: number;
  /** Cuántas guías distintas alimenta la selección. */
  guias: number;
  /** Cuántas especies distintas: mezclar dos en una corrida es una decisión. */
  especies: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function totalesSeleccion(trozas: readonly TrozaConsumible[]): TotalesSeleccion {
  const volumenM3 = r4(trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  return {
    piezas: trozas.length,
    volumenM3,
    pieTablar: Math.round(volumenM3 * PT_POR_M3),
    guias: new Set(trozas.map((t) => t.woodEntryId)).size,
    especies: new Set(trozas.map((t) => norm(t.especieComun)).filter(Boolean)).size,
  };
}

/** Lo que se consume de CADA guía — es lo que alimenta `ForestCtpConsumo`. */
export interface ConsumoPorGuia {
  woodEntryId: string;
  gtfNumber: string | null;
  proveedor: string | null;
  especie: string | null;
  piezas: number;
  volumenM3: number;
  pieTablar: number;
  trozaIds: string[];
}

/**
 * Agrupa la selección por guía de ingreso.
 *
 * Es el puente entre las dos formas de mirar el consumo: el operador elige
 * piezas, el libro registra m³ por guía. El volumen de cada consumo se DERIVA de
 * las trozas elegidas — nadie tipea un número que después no cuadre con la pila.
 */
export function agruparPorGuia(trozas: readonly TrozaConsumible[]): ConsumoPorGuia[] {
  const porGuia = new Map<string, ConsumoPorGuia>();
  for (const t of trozas) {
    const previa = porGuia.get(t.woodEntryId);
    const fila =
      previa ??
      {
        woodEntryId: t.woodEntryId,
        gtfNumber: t.gtfNumber ?? null,
        proveedor: t.proveedor ?? null,
        especie: t.especieComun ?? null,
        piezas: 0,
        volumenM3: 0,
        pieTablar: 0,
        trozaIds: [],
      };
    if (!previa) porGuia.set(t.woodEntryId, fila);
    fila.piezas += 1;
    fila.volumenM3 = r4(fila.volumenM3 + Number(t.volumenM3 ?? 0));
    fila.trozaIds.push(t.id);
  }
  for (const f of porGuia.values()) f.pieTablar = Math.round(f.volumenM3 * PT_POR_M3);
  return [...porGuia.values()].sort((a, b) => b.volumenM3 - a.volumenM3);
}

/**
 * Avisos de la selección tal como quedó. No bloquean: informan.
 *
 * Mezclar especies en una corrida es legal y pasa —se asierra lo que hay— pero
 * el rendimiento de esa corrida deja de ser comparable, y el Cuadro Resumen 3 la
 * va a mostrar con una especie sola. Que el operador lo sepa antes, no después.
 */
export function avisosSeleccion(trozas: readonly TrozaConsumible[]): string[] {
  if (trozas.length === 0) return [];
  const t = totalesSeleccion(trozas);
  const avisos: string[] = [];
  if (t.especies > 1) {
    avisos.push(`La selección mezcla ${t.especies} especies: el rendimiento de la corrida no será comparable.`);
  }
  if (t.guias > 1) {
    avisos.push(`Sale de ${t.guias} guías distintas: el consumo se va a repartir entre ellas.`);
  }
  return avisos;
}
