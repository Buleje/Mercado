/**
 * lib/admin/metas-periodo.ts — qué días mide una meta y cómo va (ADR-488).
 *
 * Sin `server-only`: lo usan el servidor (al derivar el avance) y la pantalla
 * (para escribir «te faltan … hasta el 31/10») con la MISMA cuenta.
 *
 * Todo en el día de Lima (UTC−5 fijo, Perú no cambia de hora) y con claves
 * "YYYY-MM-DD": nunca pasa por la zona del navegador. `gte`/`lt` son los
 * instantes para filtrar columnas con hora (`createdAt`); las columnas DATE
 * (`entryDate`, `fecha`) se comparan con `desde`/`hasta`.
 *
 * Una meta es recurrente: mide la ventana que contiene HOY. Si tiene `dueDate`
 * y ya pasó, mide la ventana que contiene `dueDate`, y cuando esa ventana
 * termina queda `cerrada` con su resultado final (no suma el mes siguiente).
 */
import { rangoDeLaSemana } from "@/lib/forestal/semana-de-registro";
import { diasEntreFechas, sumarDiasAFecha, type PeriodoMeta } from "./metas-tareas";

/** Cómo se nombra el período de una meta («Meta mensual»). */
export const NOMBRE_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  diario: "Diaria",
  semanal: "Semanal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
};

/** El chip del filtro de la pantalla. */
export const CHIP_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  diario: "Hoy",
  semanal: "Semana",
  mensual: "Mes",
  trimestral: "Trimestre",
  anual: "Año",
};

/** «al día», «a la semana»…: para las plantillas («Vender S/ 30.000 al mes»). */
export const AL_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  diario: "al día",
  semanal: "a la semana",
  mensual: "al mes",
  trimestral: "al trimestre",
  anual: "al año",
};

// Escritos a mano: `toLocaleDateString("es-PE")` depende del ICU del runtime y dice «septiembre».
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export interface VentanaMeta {
  /** Primer día medido, "YYYY-MM-DD" (Lima), inclusive. */
  desde: string;
  /** Último día medido, inclusive. */
  hasta: string;
  /** `desde` a las 00:00 de Lima. */
  gte: Date;
  /** El día siguiente a `hasta` a las 00:00 de Lima (exclusivo). */
  lt: Date;
  /** Días de la ventana. */
  dias: number;
  /** Días ya vividos, contando hoy (= `dias` si está cerrada). */
  transcurridos: number;
  /** La ventana ya terminó: el avance es el resultado final. */
  cerrada: boolean;
  /** «octubre 2026», «semana del 5 al 11 de octubre», «julio a setiembre 2026». */
  etiqueta: string;
}

/** "2026-10-09" → el instante de las 00:00 de ese día en Lima. */
export function inicioDelDiaLima(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-05:00`);
}

const anio = (f: string) => Number(f.slice(0, 4));
const mes = (f: string) => Number(f.slice(5, 7));
const dosDigitos = (n: number) => String(n).padStart(2, "0");
const ultimoDiaDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const finDeMes = (a: number, m: number) => `${a}-${dosDigitos(m)}-${dosDigitos(ultimoDiaDelMes(a, m))}`;

function limites(periodo: PeriodoMeta, ancla: string): { desde: string; hasta: string } {
  const a = anio(ancla);
  const m = mes(ancla);
  switch (periodo) {
    case "diario":
      return { desde: ancla, hasta: ancla };
    case "semanal":
      return rangoDeLaSemana(ancla);
    case "mensual":
      return { desde: `${a}-${dosDigitos(m)}-01`, hasta: finDeMes(a, m) };
    case "trimestral": {
      const primero = Math.floor((m - 1) / 3) * 3 + 1;
      return { desde: `${a}-${dosDigitos(primero)}-01`, hasta: finDeMes(a, primero + 2) };
    }
    case "anual":
      return { desde: `${a}-01-01`, hasta: `${a}-12-31` };
  }
}

const diaYMes = (f: string) => `${Number(f.slice(8, 10))} de ${MESES[mes(f) - 1]}`;

function etiquetaDe(periodo: PeriodoMeta, desde: string, hasta: string): string {
  switch (periodo) {
    case "diario": {
      const dia = DIAS_SEMANA[new Date(`${desde}T00:00:00Z`).getUTCDay()];
      return `${dia} ${diaYMes(desde)}`;
    }
    case "semanal":
      return mes(desde) === mes(hasta)
        ? `semana del ${Number(desde.slice(8, 10))} al ${diaYMes(hasta)}`
        : `semana del ${diaYMes(desde)} al ${diaYMes(hasta)}`;
    case "mensual":
      return `${MESES[mes(desde) - 1]} ${anio(desde)}`;
    case "trimestral":
      return `${MESES[mes(desde) - 1]} a ${MESES[mes(hasta) - 1]} ${anio(desde)}`;
    case "anual":
      return String(anio(desde));
  }
}

/**
 * La ventana que mide una meta del `periodo` dado. `hoy` = `limaDateKey()`;
 * `dueDate` opcional ("YYYY-MM-DD"): si ya pasó, se mide la ventana que lo contiene.
 */
export function ventanaDeMeta(periodo: PeriodoMeta, hoy: string, dueDate?: string): VentanaMeta {
  const ancla = dueDate && dueDate < hoy ? dueDate : hoy;
  const { desde, hasta } = limites(periodo, ancla);
  const dias = diasEntreFechas(desde, hasta) + 1;
  const cerrada = hoy > hasta;
  return {
    desde,
    hasta,
    gte: inicioDelDiaLima(desde),
    lt: inicioDelDiaLima(sumarDiasAFecha(hasta, 1)),
    dias,
    transcurridos: cerrada ? dias : diasEntreFechas(desde, hoy) + 1,
    cerrada,
    etiqueta: etiquetaDe(periodo, desde, hasta),
  };
}

/** ¿El avance tiene que llegar al objetivo («sube») o no pasarse del tope («baja», gastos)? */
export type SentidoMeta = "sube" | "baja";

/**
 * Cuánto tendría que llevar a esta altura de la ventana, en línea recta: la
 * marca de la barra. En una meta «baja» (tope) es lo que se podría haber
 * gastado hasta hoy sin ir por encima del ritmo. `null` en una ventana de un
 * día: no hay ritmo que marcar.
 */
export function ritmoEsperado(target: number, v: VentanaMeta, _sentido: SentidoMeta): number | null {
  if (v.dias <= 1) return null;
  return (target * v.transcurridos) / v.dias;
}

export type EstadoMeta = "cumplida" | "en_camino" | "atrasada" | "pasada_del_tope" | "no_cumplida" | "sin_dato";

/**
 * Cómo va la meta.
 * - «sube»: llegó al objetivo → cumplida; ventana cerrada sin llegar → no_cumplida;
 *   por debajo de la marca → atrasada; si no, en_camino.
 * - «baja» (tope): por encima del tope → pasada_del_tope; cerrada sin pasarse →
 *   cumplida; por encima de la marca → atrasada (va gastando más rápido que el ritmo).
 * - Sin dato (la lectura falló o no aplica) → sin_dato.
 */
export function estadoDeMeta(p: {
  avance: number | null;
  target: number;
  esperado: number | null;
  sentido: SentidoMeta;
  cerrada: boolean;
}): EstadoMeta {
  const { avance, target, esperado, sentido, cerrada } = p;
  if (avance === null || !Number.isFinite(avance)) return "sin_dato";
  if (sentido === "baja") {
    if (avance > target) return "pasada_del_tope";
    if (cerrada) return "cumplida";
    return esperado !== null && avance > esperado ? "atrasada" : "en_camino";
  }
  if (avance >= target) return "cumplida";
  if (cerrada) return "no_cumplida";
  return esperado !== null && avance < esperado ? "atrasada" : "en_camino";
}

/** Avance sobre objetivo, en % con un decimal (puede pasar de 100). `null` sin dato. */
export function porcentajeDeMeta(avance: number | null, target: number): number | null {
  if (avance === null || !Number.isFinite(avance) || target <= 0) return null;
  return Math.round((avance / target) * 1000) / 10;
}
