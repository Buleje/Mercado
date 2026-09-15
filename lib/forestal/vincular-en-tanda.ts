/**
 * Ponerle el lote a VARIAS producciones sin lote de una vez.
 *
 * Pedido de Brandon (2026-09-13): «que pueda marcar con check esas 5
 * producciones sin lote y usarlas… y se reste lo usado, y quede un saldo».
 *
 * Las corridas **no se tocan**: siguen siendo las mismas cinco, con su fecha,
 * su volumen y su producto. Lo único que cambia es que pasan a decir de qué
 * madera salieron — que es exactamente lo que hace `CtpVincularMateriaPrimaModal`
 * de a una (ADR-408), sólo que acá para un grupo.
 *
 * **Las reglas no se reescriben**: cada corrida pasa por `revisarVinculacion`,
 * la misma de siempre. Acá sólo se reparte la madera del lote entre las
 * corridas elegidas y se junta el veredicto de cada una — porque el lote es uno
 * y su troza no alcanza para todas por separado: lo que consume la primera ya
 * no está para la segunda.
 *
 * PURO y client-safe.
 */

import {
  revisarVinculacion,
  type CorridaAVincular,
  type LoteAVincular,
  type RevisionVinculo,
  type TrozaAVincular,
} from "./vincular-produccion";

export interface CorridaEnTanda extends CorridaAVincular {
  id: string;
}

export interface FilaDeTanda {
  corrida: CorridaEnTanda;
  revision: RevisionVinculo;
  /** Las trozas que le tocan a ESTA corrida del reparto. */
  trozas: TrozaAVincular[];
  /** `false` cuando la madera del lote se acabó antes de llegarle. */
  alcanzo: boolean;
}

export interface ResultadoTanda {
  filas: FilaDeTanda[];
  /** m³ de troza que quedan sin usar en el lote. */
  saldoM3: number;
  /** m³ de troza que se van a atribuir en total. */
  usadoM3: number;
  /** Cuántas corridas se pueden vincular de verdad. */
  vinculables: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Repartir la troza del lote entre las corridas elegidas, en orden.
 *
 * El reparto es **por orden de corrida** (la más vieja primero, que es como se
 * aserró) y **entero por troza**: una troza no se parte entre dos corridas
 * porque en el patio tampoco se parte — entra a la sierra completa.
 *
 * A cada corrida se le dan trozas hasta cubrir lo que produjo. Si la madera se
 * acaba, las que siguen quedan marcadas `alcanzo: false`: no se les inventa un
 * origen parcial, se dice que el lote no da para todas.
 */
export function repartirEnTanda(
  corridas: readonly CorridaEnTanda[],
  lote: LoteAVincular,
  trozas: readonly TrozaAVincular[],
): ResultadoTanda {
  /* Sólo la madera que de verdad se puede usar entra al reparto: una troza
     bloqueada no es saldo, es un problema aparte. */
  const disponibles = trozas.filter((t) => !t.noDisponible);
  const ordenadas = [...corridas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.lineNo ?? 0) - (b.lineNo ?? 0)));

  let i = 0;
  let usado = 0;
  const filas: FilaDeTanda[] = ordenadas.map((corrida) => {
    const mias: TrozaAVincular[] = [];
    let acumulado = 0;
    /* Hasta cubrir lo producido: el rendimiento nunca es 100 %, así que hace
       falta al menos tanto volumen de troza como producto declarado. */
    while (i < disponibles.length && acumulado < corrida.producidoM3) {
      const t = disponibles[i]!;
      mias.push(t);
      acumulado = r4(acumulado + t.volumenM3);
      i += 1;
    }
    usado = r4(usado + acumulado);
    return {
      corrida,
      trozas: mias,
      alcanzo: mias.length > 0,
      revision: revisarVinculacion(corrida, lote, mias),
    };
  });

  const totalDisponible = r4(disponibles.reduce((a, t) => a + t.volumenM3, 0));
  return {
    filas,
    usadoM3: usado,
    saldoM3: r4(totalDisponible - usado),
    vinculables: filas.filter((f) => f.alcanzo && f.revision.puedeVincular).length,
  };
}

/** Los ids de las corridas que se pueden escribir, en el orden del reparto. */
export function idsVinculables(r: ResultadoTanda): string[] {
  return r.filas.filter((f) => f.alcanzo && f.revision.puedeVincular).map((f) => f.corrida.id);
}

/**
 * Un resumen en una línea de lo que va a pasar.
 *
 * Se muestra ANTES de firmar: son varias escrituras al libro y conviene verlas
 * como una sola frase antes de tocar el botón. `fmt` es el formateador de la
 * pantalla (`fmtM3`), para que la frase diga los mismos «9.000 m³» que el
 * recuadro de al lado y no un «9» que parezca otra cifra.
 */
export function resumenDeTanda(r: ResultadoTanda, fmt: (n: number) => string = String): string {
  if (r.filas.length === 0) return "No hay corridas elegidas.";
  const n = r.vinculables;
  if (n === 0) return "Ninguna de las corridas elegidas se puede vincular a este lote.";
  const quedan = r.filas.length - n;
  return (
    `${n} corrida${n === 1 ? "" : "s"} van a quedar con su origen · ` +
    `${fmt(r.usadoM3)} m³ de troza atribuidos · ${fmt(r.saldoM3)} m³ de saldo en el lote` +
    (quedan > 0 ? ` · ${quedan} queda${quedan === 1 ? "" : "n"} sin vincular` : "")
  );
}
