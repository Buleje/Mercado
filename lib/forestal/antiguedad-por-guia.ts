/**
 * antiguedad-por-guia — qué madera del LIBRO lleva cuánto parada, guía por guía.
 *
 * Es lo que dibuja «Antigüedad por guía» en Saldos y lo que alimenta dos avisos
 * de «Qué revisar» (madera varada y m³ sin costo). Sale de
 * `availableSource(produccion)`: m³ del libro por guía (volumen − consumo), NO
 * piezas del patio. Por eso no cuadra con el patio pieza por pieza (en Blas,
 * 24-09: 125,22 m³ en 21 guías contra 135,59 m³ físicos) y la pantalla lo dice.
 *
 * La escala de días es la ÚNICA del libro (ADR-431, `patio-dias`): 0-14 ·
 * 15-29 · 30-59 · 60 o más, con `>=` y por día UTC. Antes el Aging cortaba en
 * 30/60 con `>` estricto y pintaba verde lo que Consumos llamaba «añeja».
 *
 * PURO y client-safe.
 */

import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  ETIQUETA_TRAMO_DIAS,
  SEVERIDAD_TRAMO_DIAS,
  TONO_TRAMO_DIAS,
  TRAMOS_DIAS,
  diasParada,
  tramoDeDias,
  type TramoDias,
} from "@/lib/forestal/patio-resumen";

/** Lo que devuelve `/ctp?available=produccion` por guía. */
export interface GuiaDisponible {
  id: string;
  code: string | null;
  /** Fecha de la guía, date-only. */
  entryDate: string;
  species: string | null;
  cites: boolean;
  /** m³ del libro todavía sin consumir. */
  disponible: number;
  /** Sin factura = `null`: vale «no sé», nunca «S/ 0». */
  costoUnitario: number | null;
  moneda: string;
}

export interface FilaAntiguedad extends GuiaDisponible {
  dias: number | null;
  tramo: TramoDias | null;
  valor: number | null;
}

export interface TramoAntiguedadGuia {
  tramo: TramoDias;
  label: string;
  severidad: (typeof SEVERIDAD_TRAMO_DIAS)[TramoDias];
  tono: (typeof TONO_TRAMO_DIAS)[TramoDias];
  m3: number;
  guias: number;
  /** `null` si ninguna guía del tramo tiene costo. */
  valor: number | null;
  /** Hay guías con y sin costo: el importe es un piso. */
  valorParcial: boolean;
}

export interface ResumenAntiguedad {
  filas: FilaAntiguedad[];
  tramos: TramoAntiguedadGuia[];
  totM3: number;
  totValor: number;
  valorParcial: boolean;
  m3ConCosto: number;
  m3SinCosto: number;
  guiasSinCosto: number;
  /** % del volumen que tiene costo cargado (0-100). */
  cobertura: number;
  /** Las del último tramo (60 días o más). */
  varadas: { guias: number; m3: number };
  /** Varadas Y sin costo: la plata que ni se puede reclamar. */
  varadasSinCosto: { guias: number; m3: number };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * La antigüedad del libro, guía por guía, con la escala única de días.
 *
 * `especie` es el recorte de los indicadores (ADR-400): la especie viene EN CADA
 * GUÍA, así que filtrar acá da el mismo conjunto que daría el servidor. Por
 * `claveEspecie`: «Tornillo» y «TORNILLO» son una sola madera.
 */
export function antiguedadPorGuia(
  guias: readonly GuiaDisponible[],
  ahora: Date,
  especie?: string | null,
): ResumenAntiguedad {
  const clave = especie?.trim() ? claveEspecie(especie) : null;
  const filas: FilaAntiguedad[] = guias
    .filter((g) => clave == null || claveEspecie(g.species ?? "") === clave)
    .map((g) => {
      /* La fecha de la guía es date-only: por día UTC, como el resto del patio. */
      const dias = diasParada({ fechaIngreso: g.entryDate }, ahora);
      return {
        ...g,
        dias,
        tramo: tramoDeDias(dias),
        valor: g.costoUnitario != null ? g.disponible * g.costoUnitario : null,
      };
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));

  const suma = (xs: readonly FilaAntiguedad[]) => r3(xs.reduce((a, f) => a + f.disponible, 0));
  const totM3 = suma(filas);
  const conCosto = filas.filter((f) => f.valor != null);
  const m3ConCosto = suma(conCosto);
  const m3SinCosto = r3(totM3 - m3ConCosto);
  const varadas = filas.filter((f) => f.tramo === "mas60");
  const varadasSinCosto = varadas.filter((f) => f.valor == null);

  const tramos: TramoAntiguedadGuia[] = TRAMOS_DIAS.map((tramo) => {
    const dentro = filas.filter((f) => f.tramo === tramo);
    const conC = dentro.filter((f) => f.valor != null);
    return {
      tramo,
      label: ETIQUETA_TRAMO_DIAS[tramo],
      severidad: SEVERIDAD_TRAMO_DIAS[tramo],
      tono: TONO_TRAMO_DIAS[tramo],
      m3: suma(dentro),
      guias: dentro.length,
      valor: conC.length > 0 ? conC.reduce((a, f) => a + (f.valor ?? 0), 0) : null,
      valorParcial: conC.length > 0 && conC.length < dentro.length,
    };
  });

  return {
    filas,
    tramos,
    totM3,
    totValor: conCosto.reduce((a, f) => a + (f.valor ?? 0), 0),
    valorParcial: filas.length > conCosto.length && conCosto.length > 0,
    m3ConCosto,
    m3SinCosto,
    guiasSinCosto: filas.length - conCosto.length,
    cobertura: totM3 > 0 ? (m3ConCosto / totM3) * 100 : 0,
    varadas: { guias: varadas.length, m3: suma(varadas) },
    varadasSinCosto: { guias: varadasSinCosto.length, m3: suma(varadasSinCosto) },
  };
}
