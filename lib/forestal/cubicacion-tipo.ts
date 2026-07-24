/**
 * cubicacion-tipo — clasifica cada pieza aserrada por su TIPO comercial según
 * las dimensiones, como se maneja en los aserraderos de Ucayali/Pucallpa y con
 * la nomenclatura que SERFOR usa para medir (espesor × ancho × largo).
 *
 * SERFOR/NTP miden la pieza en el orden espesor · ancho · largo (pulg/pies); el
 * tipo comercial se decide sobre esas tres medidas:
 *
 *   • Comercial        → espesor ≥ 2", ancho ≥ 6", largo ≥ 6 pies
 *                        (pieza de escuadría plena: tabla/tablón vendible por PT)
 *   • Paquetería larga → largo ≥ 6 pies pero sección por debajo de comercial
 *                        (angosta o delgada: listón, tablilla larga)
 *   • Paquetería corta → largo < 6 pies (pieza corta, se vende empaquetada)
 *
 * PURO y client-safe: recibe las medidas + unidades y devuelve el tipo. Convierte
 * a pulgadas y pies antes de comparar, así funciona con piezas en cm/m también.
 */
import { toInches, toFeet, type Unidad } from "./cubicacion";

export type TipoComercial = "Comercial" | "Paquetería larga" | "Paquetería corta";

export interface MedidaPieza {
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
}

/** Umbrales (en las unidades canónicas: pulgadas y pies). Single source. */
export const UMBRAL_TIPO = {
  espesorComercial: 2, // pulg
  anchoComercial: 6, // pulg
  largoComercial: 6, // pies (largo mínimo para no ser "corta")
} as const;

/** Tipo comercial de una pieza según espesor·ancho·largo. */
export function clasificarTipo(p: MedidaPieza): TipoComercial {
  const espesorPulg = toInches(p.espesor, p.uEspesor);
  const anchoPulg = toInches(p.ancho, p.uAncho);
  const largoPies = toFeet(p.largo, p.uLargo);

  // Corta: largo por debajo del mínimo comercial (≤ 5 pies en la práctica).
  if (largoPies < UMBRAL_TIPO.largoComercial) return "Paquetería corta";
  // Largo suficiente: comercial si la sección es plena, si no paquetería larga.
  if (espesorPulg >= UMBRAL_TIPO.espesorComercial && anchoPulg >= UMBRAL_TIPO.anchoComercial) {
    return "Comercial";
  }
  return "Paquetería larga";
}

/** Etiqueta corta para la tabla (columnas angostas). */
export function tipoCorto(t: TipoComercial): string {
  return t === "Comercial" ? "Comercial" : t === "Paquetería larga" ? "Paq. larga" : "Paq. corta";
}

/** Tono del DS para el badge: comercial destaca, paquetería es secundaria. */
export function tonoTipo(t: TipoComercial): "success" | "info" | "neutral" {
  return t === "Comercial" ? "success" : t === "Paquetería larga" ? "info" : "neutral";
}
