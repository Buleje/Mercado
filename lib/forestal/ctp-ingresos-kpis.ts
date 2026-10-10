/**
 * Las cuentas detrás de los indicadores de Ingresos del Libro CTP.
 *
 * Viven acá, puras, por la regla de [[kpi-contra-que-se-compara]]: la cifra de
 * hoy y la del período anterior salen de la MISMA función corrida sobre las dos
 * ventanas. Si la tarjeta calculara por su cuenta, el día que una fórmula
 * cambie la cifra y su delta se contradicen y no hay forma de saber cuál miente.
 *
 * Todo recibe los agregados que ya calcula `WoodEntriesDB.stats()` sobre el
 * conjunto filtrado — nunca la página cargada de la tabla.
 */

import { pieTablarDe } from "./lotes-aserrio";

/** Una faceta del período: lo mismo que llena los desplegables. */
export interface FacetaVolumen {
  value: string;
  count: number;
  volumeM3: number;
}

export interface TramoReparto {
  value: string;
  volumeM3: number;
  /** Porcentaje del volumen del período, 0–100. */
  pct: number;
}

export interface Reparto {
  /** Las mayores, ordenadas por volumen. */
  tramos: TramoReparto[];
  /**
   * Lo que no entró en `tramos`: las más chicas Y el volumen sin nombre (una
   * faceta vacía se descarta al armar los desplegables). Con esto la barra
   * suma 100 % contra el total del período — las cifras contiguas cierran.
   */
  otras: { cuantas: number; volumeM3: number; pct: number } | null;
  /** La mayor sola: la que pone el número grande de la tarjeta. */
  principal: TramoReparto | null;
  /** Cuántos valores distintos hay en el período. */
  distintos: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * El reparto del volumen del período por una faceta (proveedor, especie…).
 *
 * El denominador es el TOTAL del período y no la suma de las facetas: las
 * facetas vienen recortadas a 30 y sin la fila vacía, así que sumarlas
 * afirmaría que las mayores son más de lo que son.
 */
export function repartoDeVolumen(
  facetas: readonly FacetaVolumen[] | null | undefined,
  totalM3: number,
  cuantas = 4,
): Reparto | null {
  const filas = [...(facetas ?? [])].filter((f) => f.volumeM3 > 0).sort((a, b) => b.volumeM3 - a.volumeM3);
  if (!(totalM3 > 0) || filas.length === 0) return null;
  const tramos = filas.slice(0, cuantas).map((f) => ({
    value: f.value,
    volumeM3: f.volumeM3,
    pct: r1((f.volumeM3 / totalM3) * 100),
  }));
  const enTramos = tramos.reduce((a, t) => a + t.volumeM3, 0);
  const resto = Math.max(0, totalM3 - enTramos);
  /* Menos de un litro es redondeo de la base, no «otras especies». */
  const otras =
    resto > 0.001
      ? { cuantas: Math.max(0, filas.length - tramos.length), volumeM3: Math.round(resto * 10000) / 10000, pct: r1((resto / totalM3) * 100) }
      : null;
  return { tramos, otras, principal: tramos[0] ?? null, distintos: filas.length };
}

export interface TrozaPromedio {
  m3PorTroza: number;
  ptPorTroza: number;
  /** Cuántas piezas entraron en la cuenta. */
  piezas: number;
  /**
   * De dónde sale: de las trozas MEDIDAS (su volumen propio) o, si el período
   * no cargó listas de trozas, de la guía dividida por las piezas declaradas.
   * Se dice en la tarjeta: son dos precisiones distintas.
   */
  fuente: "trozas" | "declaradas";
}

/**
 * El tamaño de la pieza que entra al patio.
 *
 * Es la cifra que explica el rendimiento antes de aserrar: trozas más chicas
 * rinden menos tabla por m³. Prefiere las trozas medidas; cae a lo declarado.
 */
export function trozaPromedio(s: {
  trozasCount?: number | null;
  trozasConVolumen?: number | null;
  trozasVolumeM3?: number | null;
  totalPieces?: number | null;
  totalVolumeM3?: number | null;
}): TrozaPromedio | null {
  const conVol = Number(s.trozasConVolumen ?? 0);
  const volTrozas = Number(s.trozasVolumeM3 ?? 0);
  if (conVol > 0 && volTrozas > 0) {
    const m3 = volTrozas / conVol;
    return { m3PorTroza: Math.round(m3 * 1000) / 1000, ptPorTroza: pieTablarDe(m3), piezas: conVol, fuente: "trozas" };
  }
  const piezas = Number(s.totalPieces ?? 0);
  const vol = Number(s.totalVolumeM3 ?? 0);
  if (piezas > 0 && vol > 0) {
    const m3 = vol / piezas;
    return { m3PorTroza: Math.round(m3 * 1000) / 1000, ptPorTroza: pieTablarDe(m3), piezas, fuente: "declaradas" };
  }
  return null;
}

export interface CostoDelPeriodo {
  /** Soles por m³, ponderado por volumen, SÓLO sobre lo valorizado. */
  porM3: number;
  total: number;
  /** Qué parte del volumen tiene precio, 0–100. */
  pctValorizado: number;
}

/**
 * Lo que costó la madera que entró.
 *
 * `null` si nada tiene costo: una tarjeta «S/ 0.00 por m³» afirmaría que la
 * madera fue gratis. Lo que falta valorizar es deuda y va a la barra de abajo.
 */
export function costoDelPeriodo(s: {
  valorizadoM3?: number | null;
  costoTotal?: number | null;
  totalVolumeM3?: number | null;
}): CostoDelPeriodo | null {
  const vM3 = Number(s.valorizadoM3 ?? 0);
  const total = Number(s.costoTotal ?? 0);
  if (!(vM3 > 0) || !(total > 0)) return null;
  const vol = Number(s.totalVolumeM3 ?? 0);
  return {
    porM3: Math.round((total / vM3) * 100) / 100,
    total: Math.round(total * 100) / 100,
    pctValorizado: vol > 0 ? r1(Math.min(100, (vM3 / vol) * 100)) : 0,
  };
}

export interface Eslabon {
  clave: "trozas" | "origen" | "constancia";
  label: string;
  con: number;
  total: number;
  pct: number;
}

/**
 * Qué tan probable es contestar una fiscalización con lo que hay cargado.
 *
 * Tres eslabones independientes: la lista de trozas (contar palo por palo), el
 * código de origen (sin él no hay parcela ni EUDR) y la constancia del SNIFFS
 * (probar que SERFOR conoce la guía). El número de la tarjeta es el eslabón
 * MÁS DÉBIL: una cadena de custodia vale lo que su peor tramo, y un promedio
 * escondería justo el que falla.
 */
export function trazabilidad(s: {
  totalCount?: number | null;
  conPiezasCount?: number | null;
  sinOrigenCount?: number | null;
  sinConstanciaCount?: number | null;
}): { eslabones: Eslabon[]; minimo: Eslabon } | null {
  const total = Number(s.totalCount ?? 0);
  if (!(total > 0)) return null;
  const pct = (n: number) => r1((Math.max(0, Math.min(total, n)) / total) * 100);
  const base: Omit<Eslabon, "pct">[] = [
    { clave: "trozas", label: "Con lista de trozas", con: Number(s.conPiezasCount ?? 0), total },
    { clave: "origen", label: "Con código de origen", con: total - Number(s.sinOrigenCount ?? 0), total },
    { clave: "constancia", label: "Con constancia SNIFFS", con: total - Number(s.sinConstanciaCount ?? 0), total },
  ];
  const eslabones: Eslabon[] = base.map((e) => ({ ...e, pct: pct(e.con) }));
  const minimo = eslabones.reduce((a, e) => (e.pct < a.pct ? e : a), eslabones[0]);
  return { eslabones, minimo };
}

/** Un día del ritmo de ingreso, tal como lo devuelve `stats()`. */
export interface DiaDeIngreso {
  fecha: string;
  volumeM3: number;
  count: number;
}

/**
 * La serie diaria del período, con los días SIN ingreso en cero.
 *
 * Acá el cero es un dato y no un hueco: un día que no entró madera, entraron
 * 0 m³ — es flujo, no una medición que falta (el caso contrario de
 * [[serie-temporal-eje-categorico-miente]]). Sin completar los días, una curva
 * de 5 puntos repartidos en un mes se dibujaría como 5 días seguidos.
 *
 * Las fechas son date-only en UTC (así se guarda `entryDate`). Sin período
 * acotado se toma del primer al último día con ingreso. Tope de 400 días: una
 * curva de años en 120 px no dice nada y el cálculo no debe crecer sin límite.
 *
 * `hoy` (YYYY-MM-DD, el de Lima) corta el período en curso: «1 de 93 días con
 * ingreso» en un trimestre que va por el día 75 contaba 18 días que no pasaron
 * (medido en pantalla 2026-09-13) y hacía parecer más flojo el ritmo.
 */
export function serieDiariaCompleta(
  dias: readonly DiaDeIngreso[] | null | undefined,
  desde: string | null,
  hasta: string | null,
  hoy?: string,
): { serie: number[]; diasConIngreso: number; diasDelPeriodo: number } | null {
  const filas = [...(dias ?? [])].filter((d) => d.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (filas.length === 0) return null;
  const clave = (iso: string) => iso.slice(0, 10);
  const inicio = new Date(`${clave(desde ?? filas[0].fecha)}T00:00:00Z`);
  const finDeclarado = clave(hasta ?? filas[filas.length - 1].fecha);
  /* Un día con ingreso posterior a «hoy» no se esconde: manda el que sea más tarde. */
  const tope = hoy ? [clave(hoy), clave(filas[filas.length - 1].fecha)].sort().pop()! : finDeclarado;
  const fin = new Date(`${finDeclarado < tope ? finDeclarado : tope}T00:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) return null;
  const porDia = new Map<string, number>();
  for (const d of filas) porDia.set(clave(d.fecha), (porDia.get(clave(d.fecha)) ?? 0) + d.volumeM3);
  const serie: number[] = [];
  for (let t = inicio.getTime(), i = 0; t <= fin.getTime() && i < 400; t += 86_400_000, i++) {
    serie.push(Math.round((porDia.get(new Date(t).toISOString().slice(0, 10)) ?? 0) * 10000) / 10000);
  }
  return { serie, diasConIngreso: serie.filter((v) => v > 0).length, diasDelPeriodo: serie.length };
}
