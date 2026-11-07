/**
 * Formato y rótulos de «Plantas forestales» del superadmin (17-10).
 *
 * Una sola fuente para cómo se escriben las cifras en la lista, la ficha y las
 * incoherencias: m³ con 3 decimales, pies tablares SIEMPRE con «≈» (son un
 * derivado de 1 m³ = 424 PT) y «—» cuando la lectura vino `null` (nunca 0).
 */
import { formatNumber, SIN_DATO } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import type { BadgeStatusVariant } from "@buleje/design-system";
import type {
  EstadoInspeccion,
  FuenteLectura,
  GravedadIncoherencia,
  OrigenIncoherencia,
  PendientePlanta,
  PeriodoPlanta,
  Semaforo,
} from "@/lib/superadmin/plantas-forestales/tipos";

/** «12,345.678 m³» · null → «—». */
export function m3(n: number | null | undefined): string {
  return n == null ? SIN_DATO : `${formatNumber(n, 3)} m³`;
}

/** «≈ 12,346 PT» · null → «—». */
export function pies(n: number | null | undefined): string {
  return n == null ? SIN_DATO : `≈ ${formatNumber(n, 0)} PT`;
}

export function piezas(n: number | null | undefined): string {
  if (n == null) return SIN_DATO;
  return `${formatNumber(n, 0)} ${n === 1 ? "pieza" : "piezas"}`;
}

export function pct(n: number | null | undefined): string {
  return n == null ? SIN_DATO : `${formatNumber(n, { max: 1 })} %`;
}

export const NOTA_PT = `Derivado: 1 m³ = ${PT_POR_M3} PT. Es una referencia comercial, no el dato del libro.`;
export const NOTA_PT_ROLLIZA = `Derivado: la rolliza rinde ≈ 56 % aserrable y cada m³ aserrado son ${PT_POR_M3} PT.`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 10/09». Fecha sola «AAAA-MM-DD» se lee en UTC; fecha con hora, en Lima. */
export function diaCorto(v: string | null | undefined): string {
  if (!v) return SIN_DATO;
  const clave = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : limaDateKey(v);
  if (!clave) return SIN_DATO;
  const d = new Date(`${clave}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

/** «01/10 al 17/10» (con año si no es el actual). */
export function rotuloPeriodo(p: PeriodoPlanta): string {
  const anio = limaDateKey().slice(0, 4);
  const f = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}${k.slice(0, 4) === anio ? "" : `/${k.slice(0, 4)}`}`;
  return `${f(p.desde)} al ${f(p.hasta)}`;
}

// ── Período ───────────────────────────────────────────────────────────────────

export type ClavePeriodo = "mes" | "mes-pasado" | "90d" | "anio";

export const PERIODOS: { clave: ClavePeriodo; rotulo: string }[] = [
  { clave: "mes", rotulo: "Este mes" },
  { clave: "mes-pasado", rotulo: "Mes pasado" },
  { clave: "90d", rotulo: "Últimos 90 días" },
  { clave: "anio", rotulo: "Este año" },
];

export function esClavePeriodo(v: string | null): v is ClavePeriodo {
  return PERIODOS.some((p) => p.clave === v);
}

const clave = (d: Date) => d.toISOString().slice(0, 10);

/** Rango AAAA-MM-DD en hora de Lima (aritmética en UTC sobre la fecha sola). */
export function rangoDePeriodo(c: ClavePeriodo, hoy: string = limaDateKey()): PeriodoPlanta {
  const [y, m] = hoy.split("-").map(Number);
  if (c === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  if (c === "mes-pasado") {
    const inicio = new Date(Date.UTC(y, m - 2, 1));
    const fin = new Date(Date.UTC(y, m - 1, 0));
    return { desde: clave(inicio), hasta: clave(fin) };
  }
  if (c === "90d") {
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 89);
    return { desde: clave(d), hasta: hoy };
  }
  return { desde: `${y}-01-01`, hasta: hoy };
}

// ── Rótulos ───────────────────────────────────────────────────────────────────

export const SEMAFORO: Record<Semaforo, { rotulo: string; variante: BadgeStatusVariant }> = {
  verde: { rotulo: "En orden", variante: "success" },
  amarillo: { rotulo: "Revisar", variante: "warning" },
  rojo: { rotulo: "Descuadre", variante: "error" },
  gris: { rotulo: "Sin lectura", variante: "neutral" },
};

export const GRAVEDAD: Record<GravedadIncoherencia, { rotulo: string; variante: BadgeStatusVariant }> = {
  error: { rotulo: "Error", variante: "error" },
  warning: { rotulo: "Aviso", variante: "warning" },
  info: { rotulo: "Dato", variante: "info" },
};

export const ORIGEN: Record<OrigenIncoherencia, string> = {
  saldo: "Saldo de rolliza",
  cuadre_ingreso: "Cuadre de ingreso",
  rendimiento: "Rendimiento",
  pendiente: "Pendiente",
  inspeccion: "Inspección",
};

export const URGENCIA: Record<PendientePlanta["urgencia"], { rotulo: string; variante: BadgeStatusVariant }> = {
  bloquea: { rotulo: "Bloquea", variante: "error" },
  atrasado: { rotulo: "Atrasado", variante: "warning" },
  pendiente: { rotulo: "Pendiente", variante: "neutral" },
};

export const ESTADO_INSPECCION: Record<EstadoInspeccion, { rotulo: string; variante: BadgeStatusVariant }> = {
  abierta: { rotulo: "Abierta", variante: "info" },
  cerrada: { rotulo: "Cerrada", variante: "success" },
  anulada: { rotulo: "Anulada", variante: "neutral" },
};

export const FUENTE: Record<FuenteLectura, string> = {
  saldos: "el movimiento del libro",
  conciliacion: "la existencia por especie",
  disponibles: "la aserrada disponible",
  patio: "las trozas del patio",
  lotes: "los lotes",
  pendientes: "los pendientes",
  rendimiento: "el rendimiento",
  cumplimiento: "el cumplimiento",
};

export const TONO_CUMPLIMIENTO: Record<"success" | "warning" | "error", BadgeStatusVariant> = {
  success: "success",
  warning: "warning",
  error: "error",
};

/** Alto y forma de los filtros del panel (48 px, ADR-489). */
export const CONTROL =
  "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";
