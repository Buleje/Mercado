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
  /**
   * Por qué no le tocó madera (sólo con `alcanzo: false`): `fecha` = ninguna
   * troza del lote había entrado al patio el día de la corrida; `se-acabo` =
   * las que podían ir ya se las llevaron las anteriores.
   */
  sinMadera?: "fecha" | "se-acabo";
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
 *
 * `opciones.rendimientoMeta` (0-1, p. ej. 0,56): además de cubrir lo
 * producido, se completa hasta lo producido ÷ rendimiento — la troza que de
 * verdad entró a la sierra. Lo usa «Descontar la madera usada» en la ficha del
 * permiso: con la meta al 100 % el saldo bajaría sólo lo aserrado. Va en DOS
 * pasadas: primero cada corrida cubre lo que produjo (que ninguna quede sin
 * origen por darle de más a la anterior), después, con lo que sobra, cada una
 * se completa hasta la meta. Sin la opción, el reparto de siempre (Producción
 * no cambia).
 */
export function repartirEnTanda(
  corridas: readonly CorridaEnTanda[],
  lote: LoteAVincular,
  trozas: readonly TrozaAVincular[],
  opciones: { rendimientoMeta?: number } = {},
): ResultadoTanda {
  const meta = opciones.rendimientoMeta;
  const conMeta = meta != null && meta > 0 && meta < 1;
  /* Sólo la madera que de verdad se puede usar entra al reparto: una troza
     bloqueada no es saldo, es un problema aparte. */
  const disponibles = trozas.filter((t) => !t.noDisponible);
  const ordenadas = [...corridas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.lineNo ?? 0) - (b.lineNo ?? 0)));

  const usadas = new Set<string>();
  const mias: TrozaAVincular[][] = ordenadas.map(() => []);
  const acumulado: number[] = ordenadas.map(() => 0);
  /* Regla 4 llevada al reparto: a una corrida sólo le toca madera que ya había
     entrado al patio ese día. Sin esto, la troza recibida el 23/09 le tocaba a
     la corrida del 07/09 y la fila entera quedaba en rojo — o, peor, sin la
     fecha, pasaba. Sin fecha de ingreso no se puede comprobar: entra. */
  const puedeIr = (t: TrozaAVincular, c: CorridaEnTanda) => {
    const ingreso = (t.fechaIngreso ?? "").slice(0, 10);
    return !ingreso || ingreso <= c.fecha.slice(0, 10);
  };
  /* Hasta cubrir `hasta(corrida)`, de a troza entera y en orden. */
  const pasada = (hasta: (c: CorridaEnTanda) => number) => {
    ordenadas.forEach((corrida, k) => {
      const objetivo = hasta(corrida);
      for (const t of disponibles) {
        if (acumulado[k]! >= objetivo) break;
        if (usadas.has(t.id) || !puedeIr(t, corrida)) continue;
        usadas.add(t.id);
        mias[k]!.push(t);
        acumulado[k] = r4(acumulado[k]! + t.volumenM3);
      }
    });
  };
  /* Hasta cubrir lo producido: el rendimiento nunca es 100 %, así que hace
     falta al menos tanto volumen de troza como producto declarado. */
  pasada((c) => c.producidoM3);
  if (conMeta) pasada((c) => r4(c.producidoM3 / meta));

  const usado = r4(acumulado.reduce((a, v) => a + v, 0));
  const filas: FilaDeTanda[] = ordenadas.map((corrida, k) => {
    const alcanzo = mias[k]!.length > 0;
    return {
      corrida,
      trozas: mias[k]!,
      alcanzo,
      revision: revisarVinculacion(corrida, lote, mias[k]!),
      ...(alcanzo
        ? {}
        : {
            sinMadera:
              disponibles.length === 0 || disponibles.some((t) => puedeIr(t, corrida))
                ? ("se-acabo" as const)
                : ("fecha" as const),
          }),
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
