/**
 * El período de Comprobantes: un corte en días de Pucallpa que comparten la
 * lista de Facturas y boletas, sus indicadores, el Excel y la Conciliación
 * (F36/F38). Antes las cifras sumaban «los últimos 100 que trajo la lista» sin
 * decir de qué fechas: ahora todo dice «del miércoles 01/10 al viernes 17/10».
 *
 * Puro: lo usan el panel y las rutas. Perú no cambia de hora (UTC−5 todo el
 * año), así que el día de Lima se corta con `-05:00` fijo.
 */
import { limaDateKey } from "@/lib/utils";

export type PeriodoClave = "mes" | "mes-pasado" | "7d" | "30d" | "todo";

export const PERIODOS: readonly { clave: PeriodoClave; rotulo: string }[] = [
  { clave: "mes", rotulo: "Este mes" },
  { clave: "mes-pasado", rotulo: "Mes pasado" },
  { clave: "7d", rotulo: "Últimos 7 días" },
  { clave: "30d", rotulo: "Últimos 30 días" },
  { clave: "todo", rotulo: "Todo" },
];

export const esPeriodo = (v: unknown): v is PeriodoClave => PERIODOS.some((p) => p.clave === v);

export const rotuloDePeriodo = (c: PeriodoClave): string => PERIODOS.find((p) => p.clave === c)?.rotulo ?? c;

/** Días «2026-10-01» inclusive; `null` = sin tope de ese lado. */
export interface Rango {
  desde: string | null;
  hasta: string | null;
}

const DIA_MS = 86_400_000;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function esDia(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** El corte de un período, contado desde hoy en Pucallpa. */
export function rangoDePeriodo(clave: PeriodoClave, ahora: Date | number = Date.now()): Rango {
  const hoy = limaDateKey(ahora);
  const inicioDelMes = `${hoy.slice(0, 7)}-01`;
  switch (clave) {
    case "mes":
      return { desde: inicioDelMes, hasta: hoy };
    case "mes-pasado": {
      const finPasado = sumarDias(inicioDelMes, -1);
      return { desde: `${finPasado.slice(0, 7)}-01`, hasta: finPasado };
    }
    case "7d":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    default:
      return { desde: null, hasta: null };
  }
}

/** Los instantes que encierran el rango (para `createdAt: { gte, lte }`). */
export function limitesDelRango(r: Rango): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  if (r.desde) out.gte = new Date(`${r.desde}T00:00:00.000-05:00`);
  if (r.hasta) out.lte = new Date(`${r.hasta}T23:59:59.999-05:00`);
  return out;
}

/** «jueves 10/09». */
export function textoDiaCorto(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Un instante (ISO) como el día de Lima: «jueves 10/09». */
export function textoFecha(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? textoDiaCorto(limaDateKey(t)) : "—";
}

/** «jueves 10/09, 14:40» en hora de Lima (las 20:00 de Pucallpa ya son mañana en UTC). */
export function textoFechaHora(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const lima = new Date(t - 5 * 3600_000);
  const hh = String(lima.getUTCHours()).padStart(2, "0");
  const mm = String(lima.getUTCMinutes()).padStart(2, "0");
  return `${textoDiaCorto(limaDateKey(t))}, ${hh}:${mm}`;
}

/** Días enteros desde ese instante hasta `ahora` (0 = hoy o en el futuro). */
export function diasDesde(iso: string, ahora: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 86_400_000)) : 0;
}

/** «Del miércoles 01/10 al viernes 17/10» · «Desde el primer documento». */
export function textoRango(r: Rango): string {
  if (r.desde && r.hasta) {
    return r.desde === r.hasta ? `El ${textoDiaCorto(r.desde)}` : `Del ${textoDiaCorto(r.desde)} al ${textoDiaCorto(r.hasta)}`;
  }
  if (r.desde) return `Desde el ${textoDiaCorto(r.desde)}`;
  if (r.hasta) return `Hasta el ${textoDiaCorto(r.hasta)}`;
  return "Desde el primer documento";
}

/**
 * Lee `desde`/`hasta` de una ruta: sólo días válidos y en orden. Sin ninguno =
 * todo. `null` = la petición vino mal (la ruta responde 400).
 */
export function rangoDeParams(sp: URLSearchParams): Rango | null {
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if ((desde && !esDia(desde)) || (hasta && !esDia(hasta))) return null;
  if (desde && hasta && desde > hasta) return null;
  return { desde: desde || null, hasta: hasta || null };
}
