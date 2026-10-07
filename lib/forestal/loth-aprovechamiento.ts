/**
 * El aprovechamiento de un plan, listo para dibujar (Brandon 07-10-2026:
 * «mejora el KPI de aprovechamiento ingresando más detalles y mejor formato»).
 *
 * No hace cuentas nuevas del libro: toma la cascada (`cascadaDelPlan`, la MISMA
 * de la pestaña «Registro y saldo») y el plazo (`analizarZafra`, la MISMA del
 * panel de Zafra) y las ordena para la cabecera:
 *
 *   · una barra apilada sobre la base (registrado o autorizado) con tramos que
 *     NO se pisan: despachado · en patio · resto del talado · en pie;
 *   · el exceso dicho en palabras (total y por especie);
 *   · el desglose por especie, ordenado por saldo;
 *   · el ritmo contra el plazo, en DÍAS («vas 12 días atrasado»).
 *
 * Qué mide el avance:
 *   · PLANTACIÓN → lo TALADO sobre lo registrado (la tala descuenta del
 *     registro, ADR-459).
 *   · BOSQUE (PO/POA) → lo MOVILIZADO sobre lo autorizado (el «Aprovechamiento
 *     POA» de siempre: la GTF es lo que fiscaliza OSINFOR).
 *
 * PURO: sin React, sin fetch, sin `Date.now` (el `hoy` entra por parámetro).
 */

import { formatNumber } from "@/lib/format";
import type { CascadaPlan } from "./loth-saldo-cascada";
import { TOLERANCIA_CASCADA_M3 } from "./loth-saldo-cascada";
import { ptAserrableDeRolliza } from "./loth-restante";
import { analizarZafra, type ZafraEstado } from "./loth-zafra";

export type ModoAprovechamiento = "plantacion" | "bosque";
export type TramoId = "despachado" | "patio" | "talado" | "enPie";

export interface TramoAprovechamiento {
  id: TramoId;
  label: string;
  m3: number;
  /** m³ ÷ base × 100; `null` sin base. */
  pctBase: number | null;
  /** Ancho en la barra (0-100), sobre la escala (base o lo aprovechado, lo mayor). */
  ancho: number;
}

export interface EspecieAprovechamiento {
  especie: string;
  cites: boolean;
  base: number;
  talado: number;
  despachado: number;
  enPatio: number;
  /** Lo que queda: en pie (plantación) o por movilizar (bosque). Nunca negativo. */
  saldo: number;
  /** avance ÷ base × 100; `null` sin base (especie fuera del registro/plan). */
  pct: number | null;
  /** m³ por encima de la base (talado o movilizado, el mayor); 0 si no pasó. */
  excesoM3: number;
}

export interface RitmoAprovechamiento {
  estado: ZafraEstado;
  avanceTiempoPct: number;
  avanceVolumenPct: number;
  /** Puntos (volumen − tiempo): positivo = adelantado. */
  desfasePct: number;
  /** El desfase en días del plazo: positivo = adelantado. `null` si no corre. */
  diasDesfase: number | null;
  diasRestantes: number;
  /** Una línea: «Vas 12 días atrasado», «La zafra arranca el jueves 10/09». */
  titular: string;
  /** La comparación que lo explica: «35 % aprovechado con 48 % del plazo corrido». */
  detalle: string;
}

export interface Aprovechamiento {
  modo: ModoAprovechamiento;
  /** «registrado» o «autorizado»: cómo se llama la base en esta pantalla. */
  nombreBase: string;
  /** «talado» o «movilizado»: qué cuenta como avance. */
  nombreAvance: string;
  base: number;
  avance: number;
  /** avance ÷ base × 100; `null` sin base. */
  pct: number | null;
  talado: number;
  despachado: number;
  enPatio: number;
  /** base − avance, sin bajar de 0. */
  saldo: number;
  tramos: TramoAprovechamiento[];
  /** Dónde cae el 100 % en la barra (0-100). < 100 cuando hay exceso. */
  marca100: number;
  /** Frases del exceso total, en rojo. Vacío = no se pasó. */
  excesos: string[];
  /** Especies que pasaron su base, de mayor a menor exceso. */
  especiesExcedidas: EspecieAprovechamiento[];
  /** Todas, ordenadas por saldo (mayor primero). */
  especies: EspecieAprovechamiento[];
  /** ≈ pt aserrable de lo que queda en pie (referencia al 56 %); sólo plantación. */
  ptEnPie: number | null;
  /** m³ talados de especies que no están en el registro (no descuentan de nada). */
  taladoSinRegistrar: number;
  ritmo: RitmoAprovechamiento | null;
  /** Sin base ni movimientos: no hay nada que medir todavía. */
  sinDatos: boolean;
}

export interface AprovechamientoInput {
  modo: ModoAprovechamiento;
  cascada: CascadaPlan;
  /**
   * La base total, si la pantalla ya la publica (bosque: Σ volumen autorizado
   * de las especies, el mismo número de la tarjeta «Vol. autorizado»). Sin
   * ella, la de la cascada.
   */
  baseM3?: number;
  vigenciaDesde: string | Date | null;
  vigenciaHasta: string | Date | null;
  taladoSinRegistrarM3?: number;
  hoy: Date;
}

const TOL = TOLERANCIA_CASCADA_M3;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pctDe = (v: number, base: number): number | null => (base > TOL ? r1((v / base) * 100) : null);
/** m³ con 3 decimales, el mismo formato que el resto de la cabecera. */
const m3 = (v: number) => `${formatNumber(v, 3)} m³`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** «jueves 10/09», en UTC (las vigencias son fechas sin hora). */
export function diaCorto(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function ritmoDe(input: AprovechamientoInput, base: number, avance: number, nombreAvance: string): RitmoAprovechamiento | null {
  const z = analizarZafra({
    vigenciaDesde: input.vigenciaDesde,
    vigenciaHasta: input.vigenciaHasta,
    autorizadoM3: base,
    movilizadoM3: avance,
    hoy: input.hoy,
  });
  if (z.estado === "sin_vigencia" || base <= TOL) return null;
  const comun = {
    estado: z.estado,
    avanceTiempoPct: z.avanceTiempoPct,
    avanceVolumenPct: z.avanceVolumenPct,
    desfasePct: z.desfasePct,
    diasRestantes: z.diasRestantes,
  };
  if (z.estado === "no_iniciada") {
    return {
      ...comun,
      diasDesfase: null,
      titular: input.vigenciaDesde ? `La vigencia arranca el ${diaCorto(input.vigenciaDesde)}` : "La vigencia todavía no arranca",
      detalle: `${plural(z.diasTotales, "día", "días")} de plazo`,
    };
  }
  const detalle = `${r1(z.avanceVolumenPct)} % ${nombreAvance} con ${r1(z.avanceTiempoPct)} % del plazo corrido`;
  if (z.estado === "vencida") {
    const hasta = input.vigenciaHasta ? ` el ${diaCorto(input.vigenciaHasta)}` : "";
    return {
      ...comun,
      diasDesfase: null,
      titular: z.saldoM3 > TOL ? `La vigencia venció${hasta} con ${m3(z.saldoM3)} sin aprovechar` : `Vigencia cerrada${hasta}: se aprovechó todo`,
      detalle,
    };
  }
  /* El volumen hecho equivale a un día del plazo; la distancia a hoy, en días. */
  const diasDesfase = Math.round((z.desfasePct / 100) * z.diasTotales);
  const titular = diasDesfase > 0
    ? `Vas ${plural(diasDesfase, "día", "días")} adelantado`
    : diasDesfase < 0
      ? `Vas ${plural(-diasDesfase, "día", "días")} atrasado`
      : "Vas al día con el plazo";
  return { ...comun, diasDesfase, titular, detalle: `${detalle} · ${plural(z.diasRestantes, "día", "días")} por delante` };
}

export function analizarAprovechamiento(input: AprovechamientoInput): Aprovechamiento {
  const { modo, cascada } = input;
  const esPlantacion = modo === "plantacion";
  const nombreBase = esPlantacion ? "registrado" : "autorizado";
  const nombreAvance = esPlantacion ? "talado" : "movilizado";
  const t = cascada.total;
  const base = Math.max(0, input.baseM3 != null ? num(input.baseM3) : num(t.baseM3));
  const talado = Math.max(0, num(t.taladoM3));
  const despachado = Math.max(0, num(t.despachadoM3));
  const enPatio = Math.max(0, num(t.enPatioM3));
  const avance = esPlantacion ? talado : despachado;
  const saldo = r3(Math.max(0, base - avance));

  /* Tramos que no se pisan: lo despachado y el patio salen de lo talado; lo
     que sobra del talado (sin trozar, transformado en el TH, merma) es su
     propio tramo. Si el libro despachó sin asentar la tala, el tramo de
     talado queda en 0 y la barra igual muestra lo despachado. */
  const restoTalado = Math.max(0, talado - despachado - enPatio);
  const hecho = despachado + enPatio + restoTalado;
  const enPie = Math.max(0, base - hecho);
  const escala = Math.max(base, hecho);
  const ancho = (v: number) => (escala > TOL ? r1((v / escala) * 100) : 0);
  const tramos: TramoAprovechamiento[] = [
    { id: "despachado" as const, label: "Despachado", m3: r3(despachado) },
    { id: "patio" as const, label: "En patio", m3: r3(enPatio) },
    { id: "talado" as const, label: esPlantacion ? "Talado, sin salir" : "Talado, sin movilizar", m3: r3(restoTalado) },
    { id: "enPie" as const, label: "En pie", m3: r3(enPie) },
  ].map((x) => ({ ...x, pctBase: pctDe(x.m3, base), ancho: ancho(x.m3) }));

  const excesos: string[] = [];
  if (talado > base + TOL && base > TOL) excesos.push(`Se taló ${m3(talado - base)} más de lo ${nombreBase}`);
  if (despachado > base + TOL && base > TOL) {
    excesos.push(`Se ${esPlantacion ? "despachó" : "movilizó"} ${m3(despachado - base)} más de lo ${nombreBase}`);
  }

  const especies: EspecieAprovechamiento[] = cascada.especies.map((e) => {
    const b = Math.max(0, num(e.baseM3));
    const tal = Math.max(0, num(e.taladoM3));
    const desp = Math.max(0, num(e.despachadoM3));
    const av = esPlantacion ? tal : desp;
    const exceso = Math.max(tal - b, desp - b);
    return {
      especie: e.especie,
      cites: e.cites,
      base: r3(b),
      talado: r3(tal),
      despachado: r3(desp),
      enPatio: r3(Math.max(0, num(e.enPatioM3))),
      saldo: r3(Math.max(0, b - av)),
      pct: pctDe(av, b),
      excesoM3: exceso > TOL ? r3(exceso) : 0,
    };
  });
  especies.sort((a, b) => b.saldo - a.saldo || b.base - a.base || a.especie.localeCompare(b.especie, "es"));
  const especiesExcedidas = especies.filter((e) => e.excesoM3 > 0).sort((a, b) => b.excesoM3 - a.excesoM3);

  const taladoSinRegistrar = r3(Math.max(0, num(input.taladoSinRegistrarM3)));
  return {
    modo,
    nombreBase,
    nombreAvance,
    base: r3(base),
    avance: r3(avance),
    pct: pctDe(avance, base),
    talado: r3(talado),
    despachado: r3(despachado),
    enPatio: r3(enPatio),
    saldo,
    tramos,
    marca100: escala > TOL ? r1((base / escala) * 100) : 100,
    excesos,
    especiesExcedidas,
    especies,
    ptEnPie: esPlantacion && enPie > TOL ? ptAserrableDeRolliza(enPie) : null,
    taladoSinRegistrar,
    ritmo: ritmoDe(input, base, avance, nombreAvance),
    sinDatos: base <= TOL && hecho <= TOL && taladoSinRegistrar <= TOL,
  };
}

/** Tono del porcentaje: rojo pasado el 100 %, ámbar desde 85 %. */
export function tonoAprovechamiento(a: Pick<Aprovechamiento, "pct" | "excesos" | "especiesExcedidas">): "danger" | "warn" | undefined {
  if (a.excesos.length > 0 || a.especiesExcedidas.length > 0) return "danger";
  if (a.pct != null && a.pct >= 85) return "warn";
  return undefined;
}
