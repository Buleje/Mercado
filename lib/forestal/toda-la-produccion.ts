/**
 * toda-la-produccion — «Registrar toda la producción» de la Distribución de
 * rolliza en una sola confirmación (ADR-464, Brandon 2026-10-03: «con un botón,
 * sin poner manualmente cada producción»).
 *
 * No inventa otra forma de escribir: arma la MISMA secuencia que saldría de
 * tocar «Registrar en el Libro» día por día y la recorre con el mismo
 * escritor. Dos piezas, las dos puras y con tests:
 *
 *  · `planTodaLaProduccion` — por cada bloque, en orden (bloque y día), pide a
 *    `planLibroDeBloque` el día que hoy se puede registrar, lo da por escrito
 *    (sus trozas pasan a una corrida simulada del lote) y vuelve a pedir el
 *    siguiente. Así se respeta «el Libro se llena en orden» con las mismas
 *    reglas de siempre (fecha futura, tope del 56 %, T1, Completar…): si un
 *    día queda apagado, los siguientes de ESE bloque no entran y se dice por qué.
 *  · `recorrerPlan` — escribe un paso por vez (nunca en paralelo: el candado
 *    del Libro y el orden lo exigen) y se detiene en el primero que no quede
 *    declarado. Lo escrito queda (es el Libro, no se deshace); reintentar es
 *    volver a planear: lo ya escrito sale «En el libro» y no se repite.
 *
 * PURO y client-safe: sin DB, sin React, sin `window`.
 */
import type { BloqueDistribuido } from "./cubicacion-reparto";
import { planLibroDeBloque, type JornadaDelBloque, type LoteParaLibro, type PlanLibroDeBloque } from "./jornadas-de-bloque";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface EntradaDeProduccion {
  bd: Pick<BloqueDistribuido, "bloque" | "porDia">;
  lote: LoteParaLibro | null | undefined;
}

/** Un día de un bloque que entra en la tanda, listo para el escritor. */
export interface PasoDeProduccion {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  /** Siempre en estado «lista»: es exactamente lo que el botón del día mandaría. */
  jornada: JornadaDelBloque;
  totalDias: number;
}

/** Lo que no entra en la tanda y por qué (el motivo es el del botón del día). */
export interface NoEntraEnTanda {
  bloqueId: string;
  etiqueta: string;
  /** `null` = el bloque entero no escribe. */
  dia: number | null;
  /** Cuántos días quedan fuera por este motivo (el día y los que vienen detrás). */
  dias: number;
  motivo: string;
  /** `abierta` = una corrida ya consumió y le falta declarar: se arregla en el Libro. */
  tipo: "bloque" | "dia" | "abierta";
}

export interface PlanDeProduccion {
  pasos: PasoDeProduccion[];
  noEntran: NoEntraEnTanda[];
  /** Bloques con al menos un día en la tanda. */
  bloques: number;
  dias: number;
  trozas: number;
  rollizaM3: number;
  piezas: number;
  m3: number;
  pieTablar: number;
  /** Días que ya estaban en el Libro antes de planear (no se repiten). */
  yaEnLibro: number;
}

const ID_SIMULADA = "simulada:";

/**
 * El bloque y su lote como quedarían si el día `j` se hubiera escrito: el día
 * anotado como declarado y sus trozas consumidas por una corrida viva. Si el
 * lote no trae corridas (lectura sin ellas), no se le agrega ninguna: con la
 * lista vacía, `planLibroDeBloque` tomaría por anulados los días ya escritos.
 */
function comoSiSeHubieraEscrito(
  bd: EntradaDeProduccion["bd"],
  lote: LoteParaLibro,
  j: JornadaDelBloque,
): { bd: EntradaDeProduccion["bd"]; lote: LoteParaLibro } {
  const id = `${ID_SIMULADA}${bd.bloque.id}:${j.dia}`;
  const trozas = new Set(j.trozaIds);
  const b = bd.bloque;
  return {
    bd: {
      ...bd,
      bloque: {
        ...b,
        corridaIds: [...(b.corridaIds ?? []), id],
        jornadasLibro: [
          ...(b.jornadasLibro ?? []).filter((x) => x.dia !== j.dia),
          { dia: j.dia, corridaId: id, lineNo: 0, estado: "declarada", fecha: j.fecha },
        ],
      },
    },
    lote: {
      ...lote,
      trozas: lote.trozas.map((t) => (trozas.has(t.id) ? { ...t, consumidaEnId: id } : t)),
      corridas: lote.corridas
        ? [
            ...lote.corridas,
            {
              id,
              lineNo: 0,
              entryDate: j.fecha,
              productType: null,
              quantity: j.m3,
              volumeInputM3: j.rollizaM3,
              unit: "m3",
              status: "registrado",
              viva: true,
            },
          ]
        : lote.corridas,
    },
  };
}

/**
 * Qué queda fuera de la tanda en un bloque, mirando su plan después de simular
 * lo que sí entra. Si el primer día que no entra ya tenía un motivo propio
 * ANTES de simular (T1, Completar…), ése manda: después de simular, sus trozas
 * figuran tomadas por los días anteriores y el motivo diría otra cosa.
 */
function loQueNoEntra(bd: EntradaDeProduccion["bd"], plan: PlanLibroDeBloque, inicial: PlanLibroDeBloque): NoEntraEnTanda[] {
  const etiqueta = bd.bloque.etiqueta || "sin etiqueta";
  const base = { bloqueId: bd.bloque.id, etiqueta };
  const apagadas = plan.jornadas.filter((j) => j.estado === "apagada");
  if (plan.motivo) {
    return apagadas.length > 0 ? [{ ...base, dia: null, dias: apagadas.length, motivo: plan.motivo, tipo: "bloque" }] : [];
  }
  const fuera: NoEntraEnTanda[] = plan.jornadas
    .filter((j) => j.estado === "abierta")
    .map((j) => ({ ...base, dia: j.dia, dias: 1, motivo: j.motivo ?? "Consumió sus trozas y falta declarar lo que salió.", tipo: "abierta" }));
  const primera = apagadas[0];
  if (primera) {
    const antes = inicial.jornadas.find((j) => j.dia === primera.dia);
    const propio = antes?.estado === "apagada" && !antes.porOrden && antes.motivo ? antes.motivo : null;
    fuera.push({ ...base, dia: primera.dia, dias: apagadas.length, motivo: propio ?? primera.motivo ?? "Sin motivo", tipo: "dia" });
  }
  return fuera;
}

/**
 * Todo lo pendiente de la Distribución, en orden: bloque por bloque y, dentro
 * de cada uno, día por día. Bloques que comparten lote ven lo que el anterior
 * ya se llevó (el lote simulado pasa de uno a otro).
 */
export function planTodaLaProduccion(entradas: readonly EntradaDeProduccion[], hoy: string): PlanDeProduccion {
  const pasos: PasoDeProduccion[] = [];
  const noEntran: NoEntraEnTanda[] = [];
  const lotesSimulados = new Map<string, LoteParaLibro>();
  let yaEnLibro = 0;

  for (const entrada of entradas) {
    let bd = entrada.bd;
    let lote = entrada.lote ? (lotesSimulados.get(entrada.lote.id) ?? entrada.lote) : entrada.lote;
    const inicial = planLibroDeBloque(bd, lote, hoy);
    let plan = inicial;
    if (plan.oculto) continue;
    yaEnLibro += plan.jornadas.filter((j) => j.estado === "en-libro").length;
    const totalDias = plan.jornadas.length;
    /* Cada vuelta escribe (en simulado) un día: nunca más vueltas que días. */
    for (let vuelta = 0; vuelta < totalDias && lote; vuelta++) {
      const j = plan.jornadas.find((x) => x.estado === "lista");
      if (!j) break;
      pasos.push({ bloqueId: bd.bloque.id, etiqueta: bd.bloque.etiqueta || "sin etiqueta", especie: bd.bloque.especie, jornada: j, totalDias });
      ({ bd, lote } = comoSiSeHubieraEscrito(bd, lote, j));
      lotesSimulados.set(lote.id, lote);
      plan = planLibroDeBloque(bd, lote, hoy);
    }
    noEntran.push(...loQueNoEntra(bd, plan, inicial));
  }

  return {
    pasos,
    noEntran,
    bloques: new Set(pasos.map((p) => p.bloqueId)).size,
    dias: pasos.length,
    trozas: pasos.reduce((a, p) => a + p.jornada.trozaIds.length, 0),
    rollizaM3: r4(pasos.reduce((a, p) => a + p.jornada.rollizaM3, 0)),
    piezas: pasos.reduce((a, p) => a + p.jornada.piezas, 0),
    m3: r4(pasos.reduce((a, p) => a + p.jornada.m3, 0)),
    pieTablar: Math.round(pasos.reduce((a, p) => a + p.jornada.pieTablar, 0) * 100) / 100,
    yaEnLibro,
  };
}

/* ── El recorrido: uno por vez, y se para en el primer tropiezo ─────────── */

export interface ResultadoDePaso {
  /** Lo mismo que devuelve el registro de una jornada, más `error` si tiró. */
  estado: "declarada" | "corrida-abierta" | "no-consumio" | "error";
  corridaId?: string | null;
  lineNo?: number | null;
  detalle?: string | null;
}

export interface AvanceDeTanda<P> {
  /** Cuántos pasos terminaron bien antes del que está en curso. */
  hechos: number;
  total: number;
  /** El que se está escribiendo (`null` al terminar). */
  paso: P | null;
}

export interface RecorridoDeTanda<P> {
  escritos: { paso: P; resultado: ResultadoDePaso }[];
  /** El paso que no quedó declarado (corrida abierta, no consumió o error). */
  fallo: { paso: P; resultado: ResultadoDePaso } | null;
  /** Se pidió parar entre un paso y otro. */
  detenido: boolean;
  /** Los que no se intentaron. */
  pendientes: P[];
}

/**
 * Escribe los pasos en orden, esperando cada uno antes del siguiente. Un paso
 * que no termina «declarada» corta la tanda: el siguiente día de un bloque no
 * entra antes que el anterior, y seguir con otros bloques escondería el error
 * entre éxitos. `detener` se consulta ENTRE pasos: el que está en curso termina.
 */
export async function recorrerPlan<P>(
  pasos: readonly P[],
  escribir: (paso: P, indice: number) => Promise<ResultadoDePaso>,
  opciones: { onAvance?: (a: AvanceDeTanda<P>) => void; detener?: () => boolean } = {},
): Promise<RecorridoDeTanda<P>> {
  const escritos: RecorridoDeTanda<P>["escritos"] = [];
  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i]!;
    if (opciones.detener?.()) return { escritos, fallo: null, detenido: true, pendientes: pasos.slice(i) };
    opciones.onAvance?.({ hechos: i, total: pasos.length, paso });
    let resultado: ResultadoDePaso;
    try {
      resultado = await escribir(paso, i);
    } catch (e) {
      resultado = { estado: "error", detalle: e instanceof Error ? e.message : String(e) };
    }
    if (resultado.estado !== "declarada") {
      return { escritos, fallo: { paso, resultado }, detenido: false, pendientes: pasos.slice(i + 1) };
    }
    escritos.push({ paso, resultado });
  }
  opciones.onAvance?.({ hechos: pasos.length, total: pasos.length, paso: null });
  return { escritos, fallo: null, detenido: false, pendientes: [] };
}

/** «día 1», «días 1 a 3», «días 1, 3 y 4» — los días de un bloque en la tanda. */
export function textoDias(dias: readonly number[]): string {
  const d = [...dias].sort((a, b) => a - b);
  if (d.length === 0) return "";
  if (d.length === 1) return `día ${d[0]}`;
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  if (seguidos) return `días ${d[0]} a ${d[d.length - 1]}`;
  return `días ${d.slice(0, -1).join(", ")} y ${d[d.length - 1]}`;
}
