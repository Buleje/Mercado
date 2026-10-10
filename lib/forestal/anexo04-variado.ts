/**
 * anexo04-variado.ts — qué renglones del Anexo 04 vienen de la especie
 * «Variado» (paquetes 6×6 abiertos en medidas y especies, ADR-463).
 *
 * SOLO para la vista previa en pantalla (Brandon, 2026-10-03: «resaltar las
 * medidas que se pusieron como Varios y se distribuyeron a otras especies»).
 * No toca volúmenes ni la agrupación oficial, y el PDF/Excel/impresión no lo
 * leen: el papel sale igual que siempre.
 *
 * Cómo se reconoce: la pieza que sale de `desglosarVariado` lleva
 * `variadoPiezas` (cuántas de su `cantidad` vienen del Variado) y esa marca
 * sobrevive a `agruparPiezasIguales`, `unificarPorMedida` y al formato
 * «Sumada/Una por pieza». El motor del reparto (`cubicacion-reparto.ts`) reparte
 * por medida y no arrastra la marca, así que las filas del anexo por permiso
 * llegan sin ella: se reconocen por (especie × medida) contra las piezas del
 * lote (`referencia`). Cuando la fila SÍ trae la marca (cubicación abierta
 * directo), manda la de la fila y el conteo es exacto.
 *
 * PURO: sin React.
 */
import { toFeet, toInches, type PiezaCubicada } from "./cubicacion";
import { claveEspecie } from "./cubicacion-reparto";

export interface OrigenFila {
  /** Piezas que vienen del Variado. */
  variado: number;
  /** Piezas de madera propia de la especie con la misma medida. */
  propias: number;
  /**
   * `true` = el conteo es de ESTA fila. `false` = viene del lote entero (el
   * motor del reparto partió la medida entre permisos y no dice cuáles piezas
   * cayeron en cada uno).
   */
  exacto: boolean;
  /** Junta Variado y madera propia con la misma medida. */
  mixta: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La medida como la lee el anexo: espesor y ancho en pulgadas, largo en pies. */
const claveMedida = (r: PiezaCubicada, global?: string): string =>
  [claveEspecie(r.especie || global), r2(toInches(r.espesor, r.uEspesor)), r2(toInches(r.ancho, r.uAncho)), r2(toFeet(r.largo, r.uLargo))].join("|");

const delVariado = (r: PiezaCubicada): number => Math.min(Math.max(r.variadoPiezas ?? 0, 0), r.cantidad);

/**
 * Por id de renglón del papel, de dónde viene. Sólo aparecen los que tienen
 * algo del Variado. `referencia` = las piezas del lote con su marca (ya
 * abiertas, antes de repartir); puede venir vacía.
 */
export function origenVariadoPorFila(
  filas: readonly PiezaCubicada[],
  referencia: readonly PiezaCubicada[],
  especieGlobal?: string,
): Map<string, OrigenFila> {
  const lote = new Map<string, { variado: number; propias: number }>();
  for (const r of referencia) {
    const k = claveMedida(r, especieGlobal);
    const acc = lote.get(k) ?? { variado: 0, propias: 0 };
    const v = delVariado(r);
    acc.variado += v;
    acc.propias += Math.max(0, r.cantidad - v);
    lote.set(k, acc);
  }

  const out = new Map<string, OrigenFila>();
  for (const f of filas) {
    const propio = delVariado(f);
    if (propio > 0) {
      const propias = Math.max(0, f.cantidad - propio);
      out.set(f.id, { variado: propio, propias, exacto: true, mixta: propias > 0 });
      continue;
    }
    const l = lote.get(claveMedida(f, especieGlobal));
    if (!l || l.variado <= 0) continue;
    if (l.propias <= 0) out.set(f.id, { variado: f.cantidad, propias: 0, exacto: true, mixta: false });
    else out.set(f.id, { variado: l.variado, propias: l.propias, exacto: false, mixta: true });
  }
  return out;
}

export interface ResumenVariadoAnexo {
  /** Renglones (medidas) del papel con algo del Variado. */
  medidas: number;
  /** De ellos, los que juntan Variado y madera propia. */
  mixtas: number;
}

export function resumenVariadoAnexo(origen: ReadonlyMap<string, OrigenFila>): ResumenVariadoAnexo {
  let mixtas = 0;
  for (const o of origen.values()) if (o.mixta) mixtas += 1;
  return { medidas: origen.size, mixtas };
}

/** El texto del tooltip de un renglón resaltado. */
export function textoOrigenVariado(o: OrigenFila): string {
  const pz = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;
  if (!o.mixta) return "Viene de Varios: se abrió de un paquete 6×6 Variado.";
  return o.exacto
    ? `Mezcla: ${pz(o.variado)} vienen de Varios y ${pz(o.propias)} son madera propia de la especie.`
    : `Mezcla: en todo el lote esta medida junta ${pz(o.variado)} de Varios y ${pz(o.propias)} propias de la especie.`;
}
