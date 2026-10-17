/**
 * Dónde está HOY el volumen de un plan, especie por especie (ADR-459).
 *
 * Brandon (2-10-2026), sobre la plantación: «con esos m³ y especie se trabaja
 * […] de acuerdo a los procesos se descontará el volumen». Una plantación no
 * tiene censo: su base es lo REGISTRADO por especie, y cada proceso del libro
 * mueve volumen de un casillero al siguiente:
 *
 *   registrado ─ tala ─▶ talado ─ trozado ─▶ en patio ─ despacho ─▶ fuera
 *
 *   · En pie            = registrado − talado          (negativo = se taló de más)
 *   · Talado sin trozar = talado − trozado              (≥ 0)
 *   · Trozas en patio   = trozado − movilizado COMO TROZA − consumido (≥ 0)
 *   · Despachado        = movilizado (GTF)
 *   · Consumido en el TH
 *
 * La MISMA madera se asienta en tala, trozado y despacho: nunca se suman entre
 * sí (sería ~3× el volumen real). Cada casillero es una RESTA de la etapa
 * anterior, así que en pie + sin trozar + patio + despachado + consumido
 * reconstruye el registrado salvo la merma (lo talado que no llegó a troza).
 *
 * Sirve igual para un PO (su base es lo autorizado): el nombre de la base lo
 * pone la pantalla («registrado» en plantación, «autorizado» en bosque).
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

/** Lo que hace falta de una fila del balance del plan (`computeBalance`). */
export interface FilaBalanceCascada {
  species: string;
  cites: boolean;
  autorizado: number;
  talado: number;
  trozado: number;
  movilizado: number;
  /**
   * Sólo el despacho de trozas (`computeBalance.movilizadoTroza`). El producto
   * despachado salió de trozas que ya se restan como consumidas: con
   * `movilizado` el patio las restaba dos veces. Sin el campo (respuesta
   * vieja), se usa `movilizado`.
   */
  movilizadoTroza?: number;
  consumido: number;
}

export interface CascadaEspecie {
  especie: string;
  cites: boolean;
  /** La base: registrado (plantación) o autorizado (bosque). */
  baseM3: number;
  taladoM3: number;
  trozadoM3: number;
  /** base − talado. Negativo = se taló más de lo registrado. */
  enPieM3: number;
  taladoSinTrozarM3: number;
  enPatioM3: number;
  despachadoM3: number;
  consumidoM3: number;
  /** talado ÷ base × 100; `null` sin base. */
  pctTalado: number | null;
  /** Se taló o se movilizó más que la base (tolerancia 0,01 m³). */
  excedido: boolean;
}

/** 0,01 m³ = 10 litros: lo fino de una cinta en el monte, no el epsilon del float. */
export const TOLERANCIA_CASCADA_M3 = 0.01;

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const pos = (n: number): number => (n > TOLERANCIA_CASCADA_M3 ? r4(n) : 0);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function cascadaDeFila(f: FilaBalanceCascada): CascadaEspecie {
  const base = num(f.autorizado);
  const talado = num(f.talado);
  const trozado = num(f.trozado);
  const movilizado = num(f.movilizado);
  const salioComoTroza = f.movilizadoTroza == null ? movilizado : num(f.movilizadoTroza);
  const consumido = num(f.consumido);
  return {
    especie: f.species,
    cites: f.cites,
    baseM3: r4(base),
    taladoM3: r4(talado),
    trozadoM3: r4(trozado),
    enPieM3: r4(base - talado),
    taladoSinTrozarM3: pos(talado - trozado),
    enPatioM3: pos(trozado - salioComoTroza - consumido),
    despachadoM3: r4(movilizado),
    consumidoM3: r4(consumido),
    pctTalado: base > TOLERANCIA_CASCADA_M3 ? Math.round((talado / base) * 1000) / 10 : null,
    excedido: talado > base + TOLERANCIA_CASCADA_M3 || movilizado > base + TOLERANCIA_CASCADA_M3,
  };
}

export interface CascadaPlan {
  especies: CascadaEspecie[];
  total: CascadaEspecie;
}

/** La cascada de cada especie del plan y la del plan entero. */
export function cascadaDelPlan(filas: readonly FilaBalanceCascada[]): CascadaPlan {
  const especies = filas.map(cascadaDeFila);
  const suma = (k: keyof FilaBalanceCascada) => filas.reduce((a, f) => a + num(f[k]), 0);
  const total = cascadaDeFila({
    species: "Total",
    cites: filas.some((f) => f.cites),
    autorizado: suma("autorizado"),
    talado: suma("talado"),
    trozado: suma("trozado"),
    movilizado: suma("movilizado"),
    movilizadoTroza: filas.reduce((a, f) => a + num(f.movilizadoTroza ?? f.movilizado), 0),
    consumido: suma("consumido"),
  });
  /* El total de los casilleros que se recortan a 0 es la suma de las especies,
     no el recorte del total: una especie con patio y otra sin trozar no se
     compensan entre sí. */
  total.taladoSinTrozarM3 = r4(especies.reduce((a, e) => a + e.taladoSinTrozarM3, 0));
  total.enPatioM3 = r4(especies.reduce((a, e) => a + e.enPatioM3, 0));
  total.excedido = especies.some((e) => e.excedido);
  return { especies, total };
}
