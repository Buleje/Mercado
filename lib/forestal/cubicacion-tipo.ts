/**
 * cubicacion-tipo — clasifica cada pieza aserrada por su TIPO comercial según
 * las dimensiones, con la nomenclatura del aserradero (Ucayali/Pucallpa) y el
 * orden con que SERFOR mide la pieza: espesor · ancho · largo (pulg/pies).
 *
 * Reglas (largo "largo" = ≥ 6 pies; "corto" = < 6 pies). Se evalúan en orden de
 * especificidad — las de sección exacta ganan sobre las de rango, porque una
 * pieza 6×6 cae tanto en "paquetería" como en "comercial" y manda la exacta:
 *
 *   1. Tabla            → espesor = 1"    · ancho ≥ 3" · largo ≥ 6'
 *   2. Paquetería larga → espesor = 6" y ancho = 6"    · largo ≥ 6'
 *   3. Paquetería corta → espesor = 6" y ancho = 6"    · largo < 6'
 *   4. Comercial        → espesor ≥ 1.5" · ancho ≥ 6"  · largo ≥ 6'
 *   5. Larga angosta    → espesor ≤ 5" · ancho ≤ 5"    · largo ≥ 6'
 *   6. Corta            → espesor ≥ 1" · ancho ≥ 2"    · largo ≤ 5' (todo corto)
 *   7. Otro             → lo que no cae en ninguna
 *
 * "Corta" es UNA sola categoría para toda pieza corta (largo < 6'): absorbe lo
 * que antes se partía en "Corta comercial" y "Corta" — Brandon las unificó.
 *
 * PURO y client-safe: convierte a pulgadas y pies antes de comparar, así funciona
 * con piezas en cm/m también. "Exacto" se compara con tolerancia (float / cm).
 */
import { toInches, toFeet, type Unidad } from "./cubicacion";

export type TipoComercial =
  | "Comercial"
  | "Paquetería larga"
  | "Paquetería corta"
  | "Tabla"
  | "Larga angosta"
  | "Corta"
  | "Otro";

export interface MedidaPieza {
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
}

/** Umbrales en las unidades canónicas (pulgadas y pies). Single source. */
export const UMBRAL_TIPO = {
  largoLargo: 6, // pies — ≥ es "largo", < es "corto"
  tablaEspesor: 1, // pulg exacto
  tablaAnchoMin: 3, // pulg
  paqueteriaSeccion: 6, // pulg exacto (6×6)
  comercialEspesor: 1.5, // pulg — piso (Comercial arranca en este espesor: 1.5, 2, 3, 4… en adelante)
  comercialAncho: 6, // pulg
  angostaMax: 5, // pulg — espesor y ancho máximos de "Larga angosta"
  cortaEspesorMin: 1, // pulg — piso de espesor para "Corta" (bajo 1" = Otro)
  cortaAnchoMin: 2, // pulg — piso de ancho para "Corta" (bajo 2" = Otro)
} as const;

/** Igualdad "exacta" tolerante a float y a conversiones de cm. */
const eq = (v: number, target: number) => Math.abs(v - target) < 0.05;

/** Tipo comercial de una pieza según espesor · ancho · largo. */
export function clasificarTipo(p: MedidaPieza): TipoComercial {
  const E = toInches(p.espesor, p.uEspesor);
  const A = toInches(p.ancho, p.uAncho);
  const L = toFeet(p.largo, p.uLargo);
  const U = UMBRAL_TIPO;
  const esLargo = L >= U.largoLargo;

  // 1. Tabla: espesor exacto 1", ancho ≥ 3", largo ≥ 6'
  if (eq(E, U.tablaEspesor) && A >= U.tablaAnchoMin && esLargo) return "Tabla";
  // 2-3. Paquetería: sección exacta 6×6", según el largo
  if (eq(E, U.paqueteriaSeccion) && eq(A, U.paqueteriaSeccion)) {
    return esLargo ? "Paquetería larga" : "Paquetería corta";
  }
  // 4. Comercial: espesor ≥ 1.5", ancho ≥ 6", largo ≥ 6' (solo pieza larga)
  if (E >= U.comercialEspesor && A >= U.comercialAncho && esLargo) return "Comercial";
  // 5. Larga angosta: espesor ≤ 5", ancho ≤ 5", largo ≥ 6'
  if (E <= U.angostaMax && A <= U.angostaMax && esLargo) return "Larga angosta";
  // 6. Corta: TODA pieza corta — espesor ≥ 1", ancho ≥ 2", largo < 6'
  if (E >= U.cortaEspesorMin && A >= U.cortaAnchoMin && !esLargo) return "Corta";
  // 7. Lo que no encaja
  return "Otro";
}

/**
 * Una pieza que además puede traer el tipo puesto A MANO.
 *
 * La medida no siempre alcanza para decidir: el aserradero vende por costumbre
 * y por cliente, y una 2×6×8 que el cliente compra como paquetería es
 * paquetería aunque la regla diga "Comercial". Antes eso obligaba a falsear la
 * medida —que es el dato que va a la guía— para que el papel saliera bien.
 */
export interface PiezaConTipo extends MedidaPieza {
  /** Tipo forzado por el operario. `undefined`/`null` = lo decide la medida. */
  tipo?: TipoComercial | null;
}

/**
 * El tipo de una pieza: el manual si lo tiene, si no el que dicta la medida.
 *
 * ⭐ **Single source.** `clasificarTipo` sigue existiendo (es la REGLA, y se
 * testea sola), pero nadie que muestre, agrupe, filtre o exporte debe llamarla
 * directo: si un consumidor se queda con la regla pelada, el Excel dice
 * "Comercial" donde la pantalla dice "Paquetería" y el anexo que se entrega al
 * fiscalizador no coincide con el que se vio. Gobierna: badge de la tabla,
 * filtro, `agruparPor`, el agrupado del Excel/PDF, los bloques del Anexo 04 y
 * los insights.
 */
export function tipoDePieza(p: PiezaConTipo): TipoComercial {
  return p.tipo ?? clasificarTipo(p);
}

/** ¿El tipo de esta pieza está forzado a mano (y no coincide con la regla)? */
export function tipoEsManual(p: PiezaConTipo): boolean {
  return p.tipo != null && p.tipo !== clasificarTipo(p);
}

/**
 * Orden canónico de presentación de los tipos: el producto comercial pleno
 * primero, la paquetería y los residuales al final. Single source — lo usan el
 * Excel (agrupado por tipo) y cualquier resumen que ordene por tipo.
 */
export const ORDEN_TIPO: readonly TipoComercial[] = [
  "Comercial",
  "Paquetería larga",
  "Paquetería corta",
  "Tabla",
  "Larga angosta",
  "Corta",
  "Otro",
] as const;

/** Índice de orden de un tipo (para sort estable; desconocidos van al final). */
export function ordenTipo(t: TipoComercial): number {
  const i = ORDEN_TIPO.indexOf(t);
  return i === -1 ? ORDEN_TIPO.length : i;
}

/** Etiqueta corta para la columna angosta de la tabla. */
export function tipoCorto(t: TipoComercial): string {
  switch (t) {
    case "Comercial": return "Comercial";
    case "Paquetería larga": return "Paq. larga";
    case "Paquetería corta": return "Paq. corta";
    case "Tabla": return "Tabla";
    case "Larga angosta": return "L. angosta";
    case "Corta": return "Corta";
    case "Otro": return "Otro";
  }
}

/** Tono del DS para el badge, agrupado por familia de producto. */
export function tonoTipo(t: TipoComercial): "success" | "info" | "warning" | "neutral" {
  switch (t) {
    case "Comercial":
      return "success"; // sección plena y larga, el producto premium
    case "Tabla":
      return "info";
    case "Larga angosta":
    case "Corta":
      return "warning"; // cortes menores / angostos — ojo al rendimiento
    case "Paquetería larga":
    case "Paquetería corta":
    case "Otro":
      return "neutral";
  }
}
