/**
 * inicio-forestal.ts — el resumen forestal del Inicio, armado con lo que el
 * libro YA publica (2026-10-08, pedido N7).
 *
 * Regla de oro (`verificacion-de-verdad` §2): acá no nace ninguna cifra. Cada
 * número sale de la función que ya lo calcula para su pantalla y lo único que
 * se hace es juntarlo:
 *
 *  - ingresado · producido · despachado y su serie → `movimientoDelLibro`
 *    (el Tablero del Libro CTP);
 *  - guías de salida del CTP → `guiasDeDespachos` + `resumirGuias` (Guías
 *    emitidas);
 *  - madera parada en el patio → `trozasDisponibles` + `resumenDisponibles`
 *    (Volumen disponible);
 *  - permisos del LO-TH → `cascadaDelPlan` sobre el balance del plan (Control
 *    del permiso).
 *
 * Lo que sí hace este módulo, y por eso es puro y tiene test: pasar la serie
 * diaria del Tablero a SEMANAS con el mismo corte de cubo (`inicioDeCubo`, la
 * semana arranca lunes) y filtrar las GTF del LO-TH por su fecha. Las dos cosas
 * son reagrupar o recortar, no una fórmula nueva: la suma de las semanas tiene
 * que dar el total del período, y el test lo exige.
 */

import { etiquetaDeCubo, inicioDeCubo, type MovimientoDelLibro, type PasoEje } from "./movimiento-libro";
import type { CascadaEspecie } from "./loth-saldo-cascada";
import type { AdminRole } from "@/lib/session";
import { formatNumber } from "@/lib/format";

/**
 * Quién puede pedir el resumen: los roles que ven el libro (los mismos del GET
 * del Libro CTP). La ruta lo usa en `requireAdmin` y el Inicio para no mostrar
 * la pestaña a quien recibiría un 403 (el cajero de una bodega con aserradero).
 * admin · owner · manager pasan siempre (management tier de `requireAdmin`).
 */
export const ROLES_INICIO_FORESTAL: readonly AdminRole[] = ["admin", "almacenero", "owner"];
const MANAGEMENT_TIER: readonly AdminRole[] = ["admin", "owner", "manager"];

export function puedeVerInicioForestal(rol: AdminRole | null | undefined): boolean {
  return rol != null && (MANAGEMENT_TIER.includes(rol) || ROLES_INICIO_FORESTAL.includes(rol));
}

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;

// ── Serie por semana ────────────────────────────────────────────────────────

export interface PuntoInicioForestal {
  /** `YYYY-MM-DD` del inicio del cubo (lunes si es semana). */
  fecha: string;
  /** Rótulo corto del eje («29/09», «oct 26»). */
  etiqueta: string;
  ingresoM3: number;
  producido: number;
  despachado: number;
}

export interface SerieInicioForestal {
  paso: PasoEje;
  puntos: PuntoInicioForestal[];
}

/**
 * La serie del Tablero, en semanas.
 *
 * El Tablero dibuja días hasta 45 días de período (`pasoParaBarras`); el Inicio
 * pide semanas. Un día cae en UNA semana con el mismo `inicioDeCubo` que usa el
 * Tablero, así que sumar los días de cada semana da lo mismo que si el Tablero
 * hubiera agrupado por semana. Con semanas o meses ya armados, se devuelven tal
 * cual: un mes no se puede partir en semanas sin los movimientos de adentro.
 */
export function serieSemanal(mov: Pick<MovimientoDelLibro, "paso" | "puntos">): SerieInicioForestal {
  if (mov.paso !== "dia") {
    return {
      paso: mov.paso,
      puntos: mov.puntos.map((p) => ({
        fecha: p.fecha,
        etiqueta: etiquetaDeCubo(p.fecha, mov.paso),
        ingresoM3: r4(p.ingresoM3),
        producido: r4(p.producido),
        despachado: r4(p.despachado),
      })),
    };
  }
  const cubos = new Map<string, { ingresoM3: number; producido: number; despachado: number }>();
  for (const p of mov.puntos) {
    const clave = inicioDeCubo(new Date(`${p.fecha}T00:00:00.000Z`), "semana").toISOString().slice(0, 10);
    const c = cubos.get(clave) ?? { ingresoM3: 0, producido: 0, despachado: 0 };
    c.ingresoM3 += p.ingresoM3;
    c.producido += p.producido;
    c.despachado += p.despachado;
    cubos.set(clave, c);
  }
  return {
    paso: "semana",
    puntos: [...cubos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, c]) => ({
        fecha,
        etiqueta: etiquetaDeCubo(fecha, "semana"),
        ingresoM3: r4(c.ingresoM3),
        producido: r4(c.producido),
        despachado: r4(c.despachado),
      })),
  };
}

// ── GTF del LO-TH en el período ─────────────────────────────────────────────

/** Lo que hace falta de una `ForestGtf` (la fila de Prisma sirve tal cual). */
export interface GtfLothFila {
  status: string;
  gtfDate: Date | string | null;
  createdAt: Date | string;
}

const claveUtc = (v: Date | string): string => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

/**
 * Las GTF del LO-TH cuya fecha cae entre `desdeKey` y `hastaKey` (días
 * `YYYY-MM-DD` de Lima, ambos incluidos).
 *
 * `gtfDate` es date-only: se lee por su día UTC (regla del módulo, el
 * off-by-one de Lima). Una guía sin fecha cuenta por el día en que se anotó.
 * Las anuladas van aparte: un documento anulado no ampara madera.
 */
export function guiasLothDelPeriodo(
  gtfs: readonly GtfLothFila[],
  desdeKey: string,
  hastaKey: string,
): { emitidas: number; anuladas: number } {
  let emitidas = 0;
  let anuladas = 0;
  for (const g of gtfs) {
    const dia = g.gtfDate ? claveUtc(g.gtfDate) : claveUtc(g.createdAt);
    if (!dia || dia < desdeKey || dia > hastaKey) continue;
    if (g.status === "anulada") anuladas += 1;
    else emitidas += 1;
  }
  return { emitidas, anuladas };
}

// ── Permisos vigentes del LO-TH ─────────────────────────────────────────────

export interface PermisoInicio {
  id: string;
  numero: string;
  /** PLANTACION · PO · PMFI · DEMA. En plantación la base es lo REGISTRADO. */
  tipo: string;
  baseM3: number;
  taladoM3: number;
  despachadoM3: number;
  enPieM3: number;
  pctTalado: number | null;
  excedido: boolean;
  /**
   * Talado de especies que el permiso NO tiene cargadas (`sinRegistrar` del
   * balance). No entra a la cascada —que recorre las especies del plan— y por
   * eso se muestra aparte en vez de perderse.
   */
  taladoSinRegistrarM3: number;
}

/** Une el plan con el total de SU cascada (la de Control del permiso). */
export function permisoInicio(
  plan: { id: string; planNumber: string | null; planType: string; alias?: string | null },
  total: CascadaEspecie,
  sinRegistrar: readonly { taladoM3: number }[] = [],
): PermisoInicio {
  return {
    id: plan.id,
    numero: plan.alias?.trim() || plan.planNumber?.trim() || "Sin número",
    tipo: plan.planType,
    baseM3: total.baseM3,
    taladoM3: total.taladoM3,
    despachadoM3: total.despachadoM3,
    enPieM3: total.enPieM3,
    pctTalado: total.pctTalado,
    excedido: total.excedido,
    taladoSinRegistrarM3: r4(sinRegistrar.reduce((a, s) => a + (Number(s.taladoM3) || 0), 0)),
  };
}

// ── Producido y despachado: con su unidad sólo si es una ────────────────────

const SIMBOLO_UNIDAD: Record<string, string> = { m3: "m³", pt: "pt", unidad: "u.", kg: "kg" };

/** `m3` → «m³», `pt` → «pt»; otra, tal cual. */
export const simboloDeUnidad = (unidad: string): string => SIMBOLO_UNIDAD[unidad] ?? unidad;

/**
 * «12.40 m³» / «300.00 pt» si TODO el período declara en esa unidad; «12.40»
 * sin unidad si mezcla, igual que el Tablero del Libro CTP. Cada corrida y
 * cada despacho declaran en SU unidad y la suma no convierte: ponerle «m³» a
 * un total que trae pies tablares es presentar un número que no existe
 * (`verificacion-de-verdad` §2).
 */
export function cantidadDelPeriodo(n: number, unidad: string | null): string {
  const num = formatNumber(n, unidad === "unidad" ? 0 : 2);
  if (unidad == null) return num;
  return `${num} ${simboloDeUnidad(unidad)}`;
}

// ── Lo que viaja al Inicio ──────────────────────────────────────────────────

export interface InicioForestalCtp {
  ingresoM3: number;
  consumoM3: number;
  producido: number;
  despachado: number;
  /** Ponderado por consumo, sólo corridas en m³ (el del Tablero). */
  rendimiento: number;
  /** Corridas que declaran en otra unidad: su cantidad igual se suma a «producido». */
  corridasOtraUnidad: number;
  /** La unidad de `producido` / `despachado` si TODO el período está en una sola; `null` si mezcla (ver `cantidadDelPeriodo`). */
  unidadProducido: string | null;
  unidadDespachado: string | null;
  serie: SerieInicioForestal;
  /** El Tablero cortó el eje (más de 400 cubos). */
  serieTruncada: boolean;
  guias: { total: number; anuladas: number; truncado: boolean };
  /** `null` = no se pudo leer el patio (la tarjeta lo dice, no inventa un 0). */
  patio: { trozas: number; m3: number; pt: number; truncado: boolean } | null;
}

export interface InicioForestalLoth {
  guias: { emitidas: number; anuladas: number; truncado: boolean };
  permisos: PermisoInicio[];
}

export interface InicioForestal {
  /** Días `YYYY-MM-DD` de Lima del período pedido. */
  desde: string;
  hasta: string;
  ctp: InicioForestalCtp | null;
  loth: InicioForestalLoth | null;
  /** Saldo por cobrar por moneda — nunca sumado entre monedas (ADR-118). */
  adelantos: { moneda: string; saldoPendiente: number; abiertos: number }[] | null;
}
