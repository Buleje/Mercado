/**
 * components/admin/metas/formato-meta.ts — cómo se escriben las cifras de una
 * meta según su unidad, y la línea de estado de la tarjeta (ADR-488).
 *
 * Reusa el formato canónico del panel (`lib/format`: «S/ 12,345», punto
 * decimal de es-PE) en vez de un `toFixed` por tarjeta. Las fechas van como
 * «31/10» armadas a mano desde la clave "YYYY-MM-DD": nunca pasan por la zona
 * del navegador ni por los nombres de mes de Intl.
 */
import { formatCurrency, formatNumber, SIN_DATO } from "@/lib/format";
import { CATALOGO_METAS } from "@/lib/admin/metas-catalogo";
import { diasEntreFechas, type CategoriaMeta, type PeriodoMeta } from "@/lib/admin/metas-tareas";
import type { EstadoMeta, SentidoMeta } from "@/lib/admin/metas-periodo";
import type { TonoMeta } from "./clases-meta";

const CON_SIMBOLO = new Set(["S/", "%", "m³", "PT"]);
const SINGULAR: Readonly<Record<string, string>> = {
  ventas: "venta",
  clientes: "cliente",
  cierres: "cierre",
  pedidos: "pedido",
  tareas: "tarea",
  meses: "mes",
  veces: "vez",
  pies: "pie",
};

/** Sólo el número, con el símbolo de su unidad cuando lo tiene («S/ 8,240», «12.4 m³», «38 %», «12»). */
function numero(v: number, unidad: string): string {
  if (unidad === "S/") return formatCurrency(v, { decimals: Number.isInteger(v) || Math.abs(v) >= 1000 ? 0 : 2 });
  if (unidad === "%") return `${formatNumber(v, { max: 1 })} %`;
  if (unidad === "m³") return `${formatNumber(v, { max: 2 })} m³`;
  if (unidad === "PT") return `${formatNumber(v, 0)} PT`;
  return formatNumber(v, { max: 2 });
}

/** La cifra completa: «S/ 30,000», «50 m³», «80 ventas», «1 cliente». Sin dato → «—». */
export function cifraDeMeta(v: number | null | undefined, unidad: string): string {
  if (v == null || !Number.isFinite(v)) return SIN_DATO;
  const n = numero(v, unidad);
  if (CON_SIMBOLO.has(unidad)) return n;
  return `${n} ${Math.abs(v) === 1 ? singular(unidad) : unidad}`;
}

/**
 * «1 visita», no «1 visitas»: la unidad de la meta a mano la escribe cada uno.
 * Primero el mapa (catálogo + irregulares: «meses» → «mes»); si no, la regla
 * corta del castellano y sólo en palabras de 5+ letras («gas», «mes» quedan):
 * -ces → -z («luces» → «luz»), -es tras r/n/l/d se va entero («flores» →
 * «flor»), si no sólo la -s («viajes» → «viaje», «visitas» → «visita»).
 */
function singular(unidad: string): string {
  const fijo = SINGULAR[unidad] ?? SINGULAR[unidad.toLowerCase()];
  if (fijo) return fijo;
  if (!/^[a-záéíóúñ]{4,}s$/i.test(unidad)) return unidad;
  if (/ces$/i.test(unidad)) return `${unidad.slice(0, -3)}z`;
  return /[rnld]es$/i.test(unidad) ? unidad.slice(0, -2) : unidad.slice(0, -1);
}

/**
 * Las unidades del catálogo que se cuentan de a uno (clientes, pedidos,
 * cierres…). «Vas 0.19 clientes arriba del ritmo» no dice nada: en estas
 * unidades las diferencias van en enteros. La unidad libre de la meta a mano
 * («kg», «horas») NO entra: puede ser continua (ver `lineaDeEstado`).
 */
const CONTEO = new Set(["ventas", "clientes", "cierres", "pedidos", "tareas", "unid."]);
export function esConteo(unidad: string): boolean {
  return CONTEO.has(unidad);
}

/** La cifra grande de la tarjeta: en los conteos va sin la palabra (la dice «de 80 ventas»). */
export function cifraGrande(v: number | null | undefined, unidad: string): string {
  if (v == null || !Number.isFinite(v)) return SIN_DATO;
  return CON_SIMBOLO.has(unidad) ? numero(v, unidad) : formatNumber(v, { max: 2 });
}

/** "2026-10-31" → "31/10". */
export function diaMes(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** «del mes», «de la semana»…: el nombre que se arma solo en el modal. */
export const DEL_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  diario: "del día",
  semanal: "de la semana",
  mensual: "del mes",
  trimestral: "del trimestre",
  anual: "del año",
};

/** «Ventas cobradas del mes». La meta a mano no tiene nombre de fábrica. */
export function nombreAutomatico(category: CategoriaMeta, period: PeriodoMeta): string {
  if (category === "manual") return "";
  return `${CATALOGO_METAS[category].nombre} ${DEL_PERIODO[period]}`;
}

export interface DatosLinea {
  avance: number | null;
  target: number;
  esperado: number | null;
  estado: EstadoMeta;
  sentido: SentidoMeta;
  /** Último día de la ventana, "YYYY-MM-DD". */
  hasta: string;
  cerrada: boolean;
  unidad: string;
}

/**
 * UNA línea que dice cómo va: «Vas S/ 900 arriba del ritmo», «Te faltan 12.4 m³
 * hasta el 31/10», «Te quedan S/ 300 del tope», «Cerrada: cumpliste».
 */
export function lineaDeEstado(d: DatosLinea): { texto: string; tono: TonoMeta } {
  const { avance, target, esperado, estado, sentido, hasta, cerrada, unidad } = d;
  // La meta a mano cuenta de a uno si tú la anotas en enteros («12 visitas», avance 5).
  const conteo =
    esConteo(unidad) ||
    (!CON_SIMBOLO.has(unidad) && avance !== null && Number.isInteger(target) && Number.isInteger(avance));
  /* Lo que falta se redondea hacia arriba y lo que sobra hacia abajo: con
     conteos nunca se promete de más («te faltan 4,2 cierres» → 5). */
  const falta = (v: number) => cifraDeMeta(conteo ? Math.ceil(Math.abs(v) - 1e-9) : Math.abs(v), unidad);
  const sobra = (v: number) => cifraDeMeta(conteo ? Math.floor(Math.abs(v) + 1e-9) : Math.abs(v), unidad);
  if (avance === null || estado === "sin_dato") return { texto: "Sin dato: no se pudo medir este período", tono: "neutro" };
  switch (estado) {
    case "pasada_del_tope":
      return { texto: `Te pasaste ${sobra(avance - target)} del tope`, tono: "error" };
    case "no_cumplida":
      return { texto: `Cerrada: te faltaron ${falta(target - avance)}`, tono: "error" };
    case "cumplida":
      if (sentido === "baja") return { texto: "Cerrada: no te pasaste del tope", tono: "exito" };
      if (cerrada) return { texto: "Cerrada: cumpliste", tono: "exito" };
      return avance > target && (!conteo || avance - target >= 1)
        ? { texto: `Cumpliste y vas ${sobra(avance - target)} por encima`, tono: "exito" }
        : { texto: "Cumpliste la meta", tono: "exito" };
    case "atrasada":
      if (sentido === "baja") {
        const sobre = esperado === null ? "" : `; vas ${sobra(avance - esperado)} sobre el ritmo`;
        return { texto: `Te quedan ${sobra(target - avance)} del tope${sobre}`, tono: "aviso" };
      }
      return { texto: `Te faltan ${falta(target - avance)} hasta el ${diaMes(hasta)}`, tono: "aviso" };
    case "en_camino":
      if (sentido === "baja") return { texto: `Te quedan ${sobra(target - avance)} del tope`, tono: "exito" };
      if (esperado === null) return { texto: `Te faltan ${falta(target - avance)} para hoy`, tono: "neutro" };
      return avance - esperado < (conteo ? 1 : target * 0.005)
        ? { texto: "Vas justo al ritmo", tono: "exito" }
        : { texto: `Vas ${sobra(avance - esperado)} arriba del ritmo`, tono: "exito" };
  }
}

/**
 * Con cuánto cerraría la ventana si sigue al ritmo de hoy. Es una PROYECCIÓN
 * (se dice así en el ⓘ), no un dato: `null` si la ventana es de un día, ya
 * cerró o no hay avance.
 */
export function proyeccion(avance: number | null, desde: string, hasta: string, hoy: string): number | null {
  if (avance === null || hoy > hasta || hoy < desde) return null;
  const dias = diasEntreFechas(desde, hasta) + 1;
  const vividos = diasEntreFechas(desde, hoy) + 1;
  if (dias <= 1 || vividos < 1) return null;
  return (avance / vividos) * dias;
}
