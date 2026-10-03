/**
 * variado-aplicar — del Variado CALCULADO al lote del cubicador (ADR-463,
 * Brandon 2026-10-02).
 *
 * La Distribución abre cada paquete 6×6 «Variado» en medidas y especies por
 * proporción (`desglosarVariado`), pero mientras el lote siga diciendo
 * «Variado» todo lo que sale de él (el vínculo al Libro, el Anexo 04 de un
 * despacho, una corrida declarada) sale «VARIADO 6×6». Acá vive el paso que lo
 * hace real —reemplazar cada fila Variado por sus piezas— y las reglas que
 * frenan hasta que se dé ese paso. PURO: sin storage ni React.
 */
import type { PiezaCubicada } from "./cubicacion";
import type { ApartadosAsignados } from "./cubicacion-apartados";
import { ESPECIE_VARIADO, agruparPiezasIguales, esVariado, type ResultadoVariado } from "./variado-desglose";

/** El camino para abrir el Variado de verdad, en una línea. */
export const MOTIVO_ABRIR_VARIADO = "Abre el Variado primero: Resúmenes › Rolliza › Aplicar el desglose al lote.";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Por qué el lote no se envía ni se vincula con Variado adentro. Las filas SIN
 * especie que toman «Variado» de arriba van primero: la Distribución lee el
 * lote guardado, donde esas filas no dicen nada, así que hay que ponérselo.
 */
export function motivoAbrirVariado(heredadas: number): string {
  if (heredadas > 0) {
    return `${plural(heredadas, "fila sin especie toma", "filas sin especie toman")} «Variado» de arriba: ponles su especie (o «Variado») en la tabla y ábrelo en Resúmenes › Rolliza › Aplicar el desglose al lote.`;
  }
  return MOTIVO_ABRIR_VARIADO;
}

/**
 * Las filas como las lee el papel: sin especie propia toman la de arriba. Si
 * la de arriba es «Variado», se la ponen EXPLÍCITA, para que los chequeos y el
 * desglose las traten igual que a las que la dicen. Con otra especie arriba
 * devuelve el MISMO array (no invalida memos).
 */
export function conVariadoHeredado(filas: PiezaCubicada[], especieGlobal: string | null | undefined): PiezaCubicada[] {
  if (!esVariado(especieGlobal)) return filas;
  let cambio = false;
  const next = filas.map((r) => {
    if (r.especie?.trim()) return r;
    cambio = true;
    return { ...r, especie: ESPECIE_VARIADO };
  });
  return cambio ? next : filas;
}

/** Una cubicación guardada que todavía dice «Variado» (propia o heredada de su especie general). */
export function cubicacionTraeVariado(
  piezas: readonly Pick<PiezaCubicada, "especie">[],
  especieGlobal: string | null | undefined,
): boolean {
  const global = esVariado(especieGlobal);
  return piezas.some((p) => (p.especie?.trim() ? esVariado(p.especie) : global));
}

export interface LoteConVariadoAbierto {
  filas: PiezaCubicada[];
  /** Los apartados del lote con las piezas nuevas en el de su fila Variado. */
  asignados: ApartadosAsignados;
  /** Filas Variado que salen del lote. */
  salen: number;
  /** Filas que entran en su lugar (piezas iguales juntas). */
  entran: number;
  /** Paquetes 6×6 que se abrieron. */
  paquetes: number;
}

/**
 * Cambia en el lote cada fila Variado ABIERTA por sus piezas desglosadas. Las
 * piezas iguales se juntan en una fila (`agruparPiezasIguales`), pero sólo
 * dentro del mismo apartado: un apartado es un camión o un cliente, y juntar
 * entre dos mezclaría lo que va a cada uno. El bloque de piezas entra donde
 * estaba la primera fila Variado de su apartado. Lo que no se pudo abrir
 * (`sinDesglosar`) queda como estaba.
 *
 * `des` tiene que venir de ESTE lote (`desglosarVariado(lote, …)`): las piezas
 * se reconocen por el id de su fila (`<id>-v-N`).
 */
export function aplicarDesgloseAlLote(
  lote: readonly PiezaCubicada[],
  des: ResultadoVariado,
  asignados: ApartadosAsignados = {},
): LoteConVariadoAbierto {
  const enLote = new Set(lote.map((r) => r.id));
  const abiertos = new Map(des.grupos.filter((g) => enLote.has(g.origenId)).map((g) => [g.origenId, g.paquetes]));
  if (abiertos.size === 0) return { filas: [...lote], asignados: { ...asignados }, salen: 0, entran: 0, paquetes: 0 };

  /* Las piezas de cada fila abierta, juntadas por apartado. */
  const hijosPorApartado = new Map<number, PiezaCubicada[]>();
  for (const p of des.piezas) {
    const corte = p.id.lastIndexOf("-v-");
    if (corte <= 0) continue;
    const origen = p.id.slice(0, corte);
    if (!abiertos.has(origen)) continue;
    const ap = asignados[origen] ?? 0;
    const lista = hijosPorApartado.get(ap);
    if (lista) lista.push(p);
    else hijosPorApartado.set(ap, [p]);
  }
  const juntas = new Map<number, PiezaCubicada[]>();
  for (const [ap, hijos] of hijosPorApartado) juntas.set(ap, agruparPiezasIguales(hijos));

  const nuevosAsignados: ApartadosAsignados = {};
  for (const [id, ap] of Object.entries(asignados)) if (!abiertos.has(id)) nuevosAsignados[id] = ap;

  const puestos = new Set<number>();
  let entran = 0;
  const filas: PiezaCubicada[] = [];
  for (const r of lote) {
    if (!abiertos.has(r.id)) {
      filas.push(r);
      continue;
    }
    const ap = asignados[r.id] ?? 0;
    if (puestos.has(ap)) continue;
    puestos.add(ap);
    const bloque = juntas.get(ap) ?? [];
    for (const p of bloque) {
      filas.push(p);
      if (ap > 0) nuevosAsignados[p.id] = ap;
    }
    entran += bloque.length;
  }

  return {
    filas,
    asignados: nuevosAsignados,
    salen: abiertos.size,
    entran,
    paquetes: [...abiertos.values()].reduce((a, n) => a + n, 0),
  };
}
