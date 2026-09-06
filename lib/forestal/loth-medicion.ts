/**
 * loth-medicion — la cinta métrica del mapa: medir una distancia (¿cuánto hay
 * del campamento al ingreso?) y un área (¿cuánto ocupa esta faja?) sin tocar el
 * polígono declarado de la parcela.
 *
 * Es la herramienta que todo GIS tiene y que acá faltaba: hasta ahora la única
 * forma de medir algo era dibujar la parcela, y eso sobrescribe un dato legal.
 *
 * PURO: se apoya en la geodesia de `loth-utm` y `loth-geo`.
 */

import { polygonAreaHa, type LatLng } from "./loth-geo";
import { bearingDeg, distanceM, formatDistance, lineLengthM, perimeterM } from "./loth-utm";

export type ModoMedicion = "distancia" | "area";

export interface TramoMedicion {
  indice: number;
  largoM: number;
  azimut: number;
  acumuladoM: number;
}

export interface MedicionResultado {
  modo: ModoMedicion;
  puntos: number;
  /** Largo total de la traza (m) — en modo área, el perímetro cerrado. */
  totalM: number;
  /** Área en hectáreas (solo en modo área con 3+ puntos). */
  areaHa: number | null;
  /** Área en m² — para superficies chicas, donde "0,03 ha" no dice nada. */
  areaM2: number | null;
  tramos: TramoMedicion[];
  /** Texto listo para mostrar en el mapa. */
  resumen: string;
}

const round = (n: number, d = 2): number => Number(n.toFixed(d));

/** Área legible: bajo 1 ha se lee mucho mejor en m². */
export function formatArea(areaHa: number): string {
  const m2 = areaHa * 10_000;
  return m2 < 10_000 ? `${Math.round(m2).toLocaleString("es-PE")} m²` : `${areaHa.toFixed(2)} ha`;
}

/**
 * Mide la traza en curso. En modo `area` el anillo se cierra solo (el usuario no
 * tiene que volver al primer punto) y el total pasa a ser el perímetro.
 */
export function medir(puntos: LatLng[], modo: ModoMedicion): MedicionResultado {
  const tramos: TramoMedicion[] = [];
  let acumulado = 0;

  const pares = modo === "area" && puntos.length >= 3 ? puntos.length : Math.max(0, puntos.length - 1);
  for (let i = 0; i < pares; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    const largoM = distanceM(a, b);
    acumulado += largoM;
    tramos.push({ indice: i + 1, largoM: round(largoM), azimut: round(bearingDeg(a, b), 1), acumuladoM: round(acumulado) });
  }

  const totalM = round(modo === "area" && puntos.length >= 3 ? perimeterM(puntos) : lineLengthM(puntos));
  const areaHa = modo === "area" && puntos.length >= 3 ? round(polygonAreaHa(puntos), 4) : null;

  const resumen =
    puntos.length === 0
      ? "Tocá el mapa para empezar a medir"
      : modo === "area"
        ? areaHa != null
          ? `${formatArea(areaHa)} · perímetro ${formatDistance(totalM)}`
          : `${puntos.length} punto(s) — faltan ${3 - puntos.length} para cerrar el área`
        : totalM > 0
          ? `${formatDistance(totalM)} en ${puntos.length - 1} tramo(s)`
          : "1 punto — tocá otro para medir la distancia";

  return {
    modo,
    puntos: puntos.length,
    totalM,
    areaHa,
    areaM2: areaHa != null ? round(areaHa * 10_000) : null,
    tramos,
    resumen,
  };
}
