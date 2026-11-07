/**
 * Lo que la banda «Aprovechamiento» suma a su barra (Brandon 08-10 tarde):
 *
 *   · CADENA: base → talado → trozado → despachado → recibido en el CTP, cada
 *     paso con su % del anterior y de la base. Las trozas que el libro tiene
 *     sin tala (llegaron con una guía importada, ADR-461) son su propio tramo,
 *     «Entró con guía»: sin él, Blas (0 talas, 22 trozas, 20,303 m³) arrancaba
 *     la cadena en 0 y el trozado salía de la nada.
 *   · PATIO: m³ trozados que no salieron, cuántas trozas y los días de la más
 *     vieja, con aviso pasado un tope (30 días por defecto).
 *   · TÉRMINO: m³ por semana desde el primer avance y en qué fecha se acaba la
 *     base a ese ritmo, contra el cierre de la vigencia.
 *
 * Lo recibido, las trozas del patio con su fecha y las semanas los sabe la
 * Extracción (ADR-454, `GET loth/extraccion?planId=`): `hechosDeExtraccion`
 * toma sólo eso. Los m³ del libro siguen saliendo del balance (la cascada),
 * los mismos de la barra: la banda no muestra dos «talado» distintos.
 *
 * PURO: sin React, sin fetch, sin `Date.now` (el `hoy` entra por parámetro).
 */

import { formatNumber } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import type { ExtraccionResponse } from "./loth-extraccion-tipos";
import type { CascadaEspecie } from "./loth-saldo-cascada";
import { TOLERANCIA_CASCADA_M3 } from "./loth-saldo-cascada";

const TOL = TOLERANCIA_CASCADA_M3;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pctDe = (v: number, base: number): number | null => (base > TOL ? r1((v / base) * 100) : null);

const DIA_MS = 86_400_000;
const msDeDia = (d: string) => Date.parse(`${d}T00:00:00Z`);
const diasEntre = (a: string, b: string) => Math.round((msDeDia(b) - msDeDia(a)) / DIA_MS);
const sumarDias = (d: string, n: number) => new Date(msDeDia(d) + n * DIA_MS).toISOString().slice(0, 10);
/** Una vigencia (fecha sin hora) como `YYYY-MM-DD`, en UTC. */
const diaDe = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// ─── Hechos: lo que trae la Extracción ───────────────────────────────────────

export interface SemanaAvance {
  /** Lunes de la semana, `YYYY-MM-DD`. */
  semana: string;
  taladoM3: number;
  trozadoM3: number;
  despachadoM3: number;
}

export interface HechosAprovechamiento {
  /** m³ (del libro) de las trozas que el CTP ya recibió. */
  recibidoM3: number;
  recibidas: number;
  /** Trozas trozadas que no salieron ni se consumieron. */
  patioTrozas: number;
  /** Días que lleva en patio la más vieja; `null` sin trozas en patio. */
  patioDiasMasVieja: number | null;
  semanas: SemanaAvance[];
}

/** Sin movimientos no hay nada que preguntar: todo en cero. */
export const HECHOS_VACIOS: HechosAprovechamiento = { recibidoM3: 0, recibidas: 0, patioTrozas: 0, patioDiasMasVieja: null, semanas: [] };

/** Lo que la banda necesita de la respuesta de la Extracción de UN plan. */
export function hechosDeExtraccion(ex: Pick<ExtraccionResponse, "total" | "kpis" | "semanas">): HechosAprovechamiento {
  return {
    recibidoM3: r3(Math.max(0, num(ex.total?.recibido?.m3))),
    recibidas: Math.max(0, num(ex.total?.recibido?.n)),
    patioTrozas: Math.max(0, num(ex.kpis?.trozasEnElMonte?.n)),
    patioDiasMasVieja: ex.kpis?.trozasEnElMonte?.diasMasVieja ?? null,
    semanas: (ex.semanas ?? []).map((s) => ({
      semana: s.semana,
      taladoM3: num(s.taladoM3),
      trozadoM3: num(s.trozadoM3),
      despachadoM3: num(s.despachadoM3),
    })),
  };
}

// ─── Entró con guía ──────────────────────────────────────────────────────────

/**
 * m³ trozados por encima de lo talado, especie por especie: trozas que el
 * libro tiene sin su tala (llegaron con la guía importada). Por especie y no
 * sobre el total: una especie con merma no tapa a otra sin tala. Bajo la
 * tolerancia de la cascada (0,01 m³) es redondeo, no madera.
 */
export function entroConGuiaDe(especies: readonly Pick<CascadaEspecie, "taladoM3" | "trozadoM3">[]): number {
  let s = 0;
  for (const e of especies) {
    const extra = num(e.trozadoM3) - num(e.taladoM3);
    if (extra > TOL) s += extra;
  }
  return r3(s);
}

// ─── Cadena ──────────────────────────────────────────────────────────────────

export type PasoAprovId = "base" | "talado" | "conGuia" | "trozado" | "despachado" | "recibido";

export interface PasoAprov {
  id: PasoAprovId;
  label: string;
  /** `null` = todavía no se sabe (el CTP no respondió). */
  m3: number | null;
  /** % contra el paso anterior de la cadena; `null` sin anterior o sin dato. */
  pctAnterior: number | null;
  /** % contra la base (autorizado o registrado). */
  pctBase: number | null;
  /** Tramo que ENTRA a la cadena en vez de salir del anterior («Entró con guía»). */
  entrada?: true;
}

export interface CadenaInput {
  /** «autorizado» o «registrado». */
  nombreBase: string;
  base: number;
  talado: number;
  conGuia: number;
  trozado: number;
  despachado: number;
  /** `null` mientras el CTP no responde. */
  recibido: number | null;
}

/**
 * Base → talado → (entró con guía) → trozado → despachado → recibido. El
 * trozado se mide contra lo talado MÁS lo que entró con guía: es lo que tuvo
 * para trozar.
 */
export function cadenaDelAprovechamiento(x: CadenaInput): PasoAprov[] {
  const base = Math.max(0, x.base);
  const paso = (id: PasoAprovId, label: string, m3: number | null, anterior: number | null): PasoAprov => ({
    id,
    label,
    m3: m3 == null ? null : r3(m3),
    pctAnterior: m3 == null || anterior == null ? null : pctDe(m3, anterior),
    pctBase: m3 == null ? null : pctDe(m3, base),
  });
  const pasos: PasoAprov[] = [
    { ...paso("base", x.nombreBase.charAt(0).toUpperCase() + x.nombreBase.slice(1), base, null), pctBase: base > TOL ? 100 : null },
    paso("talado", "Talado", x.talado, base),
  ];
  if (x.conGuia > TOL) pasos.push({ ...paso("conGuia", "Entró con guía", x.conGuia, null), entrada: true });
  pasos.push(
    paso("trozado", "Trozado", x.trozado, x.talado + Math.max(0, x.conGuia)),
    paso("despachado", "Despachado", x.despachado, x.trozado),
    paso("recibido", "Recibido en CTP", x.recibido, x.despachado),
  );
  return pasos;
}

// ─── Patio ───────────────────────────────────────────────────────────────────

/** Días en patio a partir de los cuales la troza más vieja se avisa (si nadie lo cambia). */
export const TOPE_PATIO_DIAS = 30;
/** Los topes que se ofrecen para elegir. */
export const TOPES_PATIO_DIAS = [15, 30, 45, 60, 90] as const;

export interface PatioAprov {
  m3: number;
  /** `null` mientras la Extracción no responde. */
  trozas: number | null;
  diasMasVieja: number | null;
}

/** La troza más vieja pasó el tope (y hay madera en patio). */
export function patioPasado(p: PatioAprov, topeDias: number): boolean {
  return p.m3 > TOL && p.diasMasVieja != null && p.diasMasVieja > topeDias;
}

// ─── Término ─────────────────────────────────────────────────────────────────

/** Antes de dos semanas desde el primer avance, un ritmo es ruido. */
export const DIAS_MINIMOS_TERMINO = 14;
/** Más allá, «a este ritmo no se termina»: una fecha en 2090 no informa. */
const DIAS_MAXIMOS_TERMINO = 365 * 50;

export interface TerminoAprov {
  /** m³ por semana desde la semana del primer avance; `null` sin ritmo. */
  m3PorSemana: number | null;
  /** Lunes de la primera semana con avance. */
  desde: string | null;
  /** `YYYY-MM-DD` en que se acaba la base a ese ritmo. */
  fecha: string | null;
  vigenciaHasta: string | null;
  /** Termina antes del cierre: `true`; después: `false`; sin vigencia o sin fecha: `null`. */
  llega: boolean | null;
  /** m³/semana para terminar justo al cierre (sólo si no llega y la vigencia sigue). */
  necesarioPorSemana: number | null;
  titular: string;
  detalle: string;
}

export interface TerminoInput {
  modo: "plantacion" | "bosque";
  /** «talado» o «movilizado». */
  nombreAvance: string;
  nombreBase: string;
  avance: number;
  saldo: number;
  semanas: readonly SemanaAvance[];
  vigenciaHasta: string | Date | null;
  hoy: Date;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** «jueves 14/01», con el año si no es el de `hoy` («jueves 14/01/2027»). */
export function diaConAnio(dia: string, hoyDia: string): string {
  const d = new Date(msDeDia(dia));
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const anio = dia.slice(0, 4) === hoyDia.slice(0, 4) ? "" : `/${dia.slice(0, 4)}`;
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm}${anio}`;
}

const ritmoTxt = (v: number) => `${formatNumber(v, 2)} m³/semana`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * El ritmo es lo hecho ÷ las semanas desde la del primer avance hasta hoy (en
 * plantación el primer talado o trozado; en bosque, el primer despacho). La
 * fecha de término es hoy + saldo ÷ ritmo.
 */
export function terminoDelAprovechamiento(x: TerminoInput): TerminoAprov {
  const hoyDia = limaDateKey(x.hoy);
  const vig = diaDe(x.vigenciaHasta);
  const vacio = { m3PorSemana: null, desde: null, fecha: null, vigenciaHasta: vig, llega: null, necesarioPorSemana: null };
  const conAvance = (s: SemanaAvance) =>
    x.modo === "plantacion" ? s.taladoM3 > 0 || s.trozadoM3 > 0 : s.despachadoM3 > 0;
  const desde = [...x.semanas].filter(conAvance).map((s) => s.semana).sort()[0] ?? null;
  if (x.avance <= TOL || !desde) {
    return { ...vacio, titular: "Sin ritmo todavía", detalle: `El ritmo se mide desde el primer m³ ${x.nombreAvance}.` };
  }
  const dias = diasEntre(desde, hoyDia) + 1;
  if (dias < DIAS_MINIMOS_TERMINO) {
    return {
      ...vacio,
      desde,
      titular: "Ritmo en camino",
      detalle: `Hacen falta ${DIAS_MINIMOS_TERMINO} días desde el primer avance para medirlo (van ${plural(Math.max(0, dias), "día", "días")}).`,
    };
  }
  const m3PorSemana = r3(x.avance / (dias / 7));
  const base = { ...vacio, desde, m3PorSemana };
  if (x.saldo <= TOL) {
    return { ...base, titular: `${ritmoTxt(m3PorSemana)} · ya no queda saldo`, detalle: `Se aprovechó todo lo ${x.nombreBase}.` };
  }
  /* Lo que haría falta por semana para cerrar justo al cierre (si la vigencia sigue). */
  const necesario = vig && vig > hoyDia ? r3(x.saldo / (diasEntre(hoyDia, vig) / 7)) : null;
  const diasFaltan = Math.ceil((x.saldo / m3PorSemana) * 7);
  if (diasFaltan > DIAS_MAXIMOS_TERMINO) {
    return {
      ...base,
      llega: vig ? false : null,
      necesarioPorSemana: necesario,
      titular: `${ritmoTxt(m3PorSemana)} · a este ritmo no se termina`,
      detalle: vig && necesario != null
        ? `Para cerrar el ${diaConAnio(vig, hoyDia)} te hacen falta ${ritmoTxt(necesario)}.`
        : "Más de 50 años para el saldo que queda.",
    };
  }
  const fecha = sumarDias(hoyDia, diasFaltan);
  const titular = `${ritmoTxt(m3PorSemana)} · terminas el ${diaConAnio(fecha, hoyDia)}`;
  if (!vig) return { ...base, fecha, titular, detalle: "Sin vigencia cargada: no hay cierre contra qué medir." };
  if (fecha <= vig) {
    const antes = diasEntre(fecha, vig);
    return {
      ...base,
      fecha,
      llega: true,
      titular,
      detalle: antes === 0 ? `Justo al cierre (${diaConAnio(vig, hoyDia)}).` : `${plural(antes, "día", "días")} antes del cierre (${diaConAnio(vig, hoyDia)}).`,
    };
  }
  if (necesario == null) {
    return { ...base, fecha, llega: false, titular, detalle: `La vigencia cerró el ${diaConAnio(vig, hoyDia)}.` };
  }
  return {
    ...base,
    fecha,
    llega: false,
    necesarioPorSemana: necesario,
    titular,
    detalle: `No llegas al cierre (${diaConAnio(vig, hoyDia)}): te hacen falta ${ritmoTxt(necesario)}.`,
  };
}
