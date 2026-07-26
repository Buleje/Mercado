/**
 * ctp-period.ts — single source del período del Libro de Operaciones CTP.
 *
 * El LOE-CTP se lleva por período (típicamente mes). Las 4 pestañas
 * (Ingresos · Producción · Despacho · Saldos) y el export comparten este rango
 * para que los números de una hablen del mismo lapso que los de las otras.
 *
 * Los límites se calculan en hora LOCAL y se envían como instantes ISO
 * completos: así el servidor (`new Date(param)`) reconstruye el mismo momento
 * sin corrimiento de zona horaria (Lima = UTC-5).
 */

export type CtpPeriodKey =
  | "mes-actual"
  | "mes-anterior"
  | "trimestre"
  | "anio"
  | "todo"
  | "custom";

export interface CtpPeriod {
  key: CtpPeriodKey;
  /** Instante ISO inclusivo de inicio; null = sin límite (histórico). */
  from: string | null;
  /** Instante ISO inclusivo de fin; null = sin límite. */
  to: string | null;
  label: string;
}

export const CTP_PERIOD_OPTIONS: { key: CtpPeriodKey; label: string }[] = [
  { key: "mes-actual", label: "Mes actual" },
  { key: "mes-anterior", label: "Mes anterior" },
  { key: "trimestre", label: "Últimos 3 meses" },
  { key: "anio", label: "Año en curso" },
  { key: "todo", label: "Todo el histórico" },
  { key: "custom", label: "Rango personalizado" },
];

const startOfDay = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0);
const endOfDay = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999);
/** Último día del mes `m` (0-based) del año `y`. */
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

const monthLabel = (d: Date) =>
  d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
const dayLabel = (d: Date) =>
  d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

/** Parsea "yyyy-mm-dd" a piezas locales (evita el UTC de `new Date("...")`). */
function parseDateInput(v: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * Resuelve un preset (o un rango custom) al período concreto.
 * `now` es inyectable para tests deterministas.
 */
export function resolveCtpPeriod(
  key: CtpPeriodKey,
  custom?: { from?: string; to?: string },
  now: Date = new Date(),
): CtpPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "mes-actual":
      return {
        key,
        from: startOfDay(y, m, 1).toISOString(),
        to: endOfDay(y, m, lastDay(y, m)).toISOString(),
        label: monthLabel(now),
      };

    case "mes-anterior": {
      const prev = new Date(y, m - 1, 1);
      const py = prev.getFullYear();
      const pm = prev.getMonth();
      return {
        key,
        from: startOfDay(py, pm, 1).toISOString(),
        to: endOfDay(py, pm, lastDay(py, pm)).toISOString(),
        label: monthLabel(prev),
      };
    }

    case "trimestre": {
      const start = new Date(y, m - 2, 1);
      return {
        key,
        from: startOfDay(start.getFullYear(), start.getMonth(), 1).toISOString(),
        to: endOfDay(y, m, lastDay(y, m)).toISOString(),
        label: `${monthLabel(start)} — ${monthLabel(now)}`,
      };
    }

    case "anio":
      return {
        key,
        from: startOfDay(y, 0, 1).toISOString(),
        to: endOfDay(y, 11, 31).toISOString(),
        label: `Año ${y}`,
      };

    case "custom": {
      const f = custom?.from ? parseDateInput(custom.from) : null;
      const t = custom?.to ? parseDateInput(custom.to) : null;
      const fromDate = f ? startOfDay(f.y, f.m, f.d) : null;
      const toDate = t ? endOfDay(t.y, t.m, t.d) : null;
      // Rango incompleto o invertido → se comporta como histórico (no miente).
      if (!fromDate || !toDate || fromDate > toDate) {
        return { key, from: null, to: null, label: "Rango sin definir" };
      }
      return {
        key,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        label: `${dayLabel(fromDate)} — ${dayLabel(toDate)}`,
      };
    }

    case "todo":
    default:
      return { key: "todo", from: null, to: null, label: "Todo el histórico" };
  }
}

/**
 * El mismo rango, en formato corto para la cabina del libro ("may–jul 2026").
 * El `label` largo sigue siendo el de los informes y exports; acá manda el
 * ancho: en la cabecera compite con el score, las acciones y el título.
 */
export function ctpPeriodShortLabel(period: CtpPeriod): string {
  if (!period.from || !period.to) return period.key === "custom" ? "sin definir" : "histórico";
  const f = new Date(period.from);
  const t = new Date(period.to);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return period.label;

  const mes = (d: Date) => d.toLocaleDateString("es-PE", { month: "short" }).replace(".", "");
  const mismoAnio = f.getFullYear() === t.getFullYear();
  // ¿Los límites son meses completos? Entonces se nombra por mes, no por día.
  const mesesEnteros = f.getDate() === 1 && t.getDate() === lastDay(t.getFullYear(), t.getMonth());

  if (mesesEnteros && mismoAnio && f.getMonth() === 0 && t.getMonth() === 11) return String(f.getFullYear());
  if (mesesEnteros && mismoAnio && f.getMonth() === t.getMonth()) return `${mes(f)} ${f.getFullYear()}`;
  if (mesesEnteros && mismoAnio) return `${mes(f)}–${mes(t)} ${f.getFullYear()}`;
  if (mesesEnteros) return `${mes(f)} ${f.getFullYear()} – ${mes(t)} ${t.getFullYear()}`;
  return mismoAnio
    ? `${f.getDate()} ${mes(f)} – ${t.getDate()} ${mes(t)} ${t.getFullYear()}`
    : `${f.getDate()} ${mes(f)} ${f.getFullYear()} – ${t.getDate()} ${mes(t)} ${t.getFullYear()}`;
}

/** Agrega `from`/`to` a los params de un request (no-op si el período es histórico). */
export function applyCtpPeriodParams(params: URLSearchParams, period: CtpPeriod): URLSearchParams {
  if (period.from) params.set("from", period.from);
  if (period.to) params.set("to", period.to);
  return params;
}

/** Sufijo para nombres de archivo del export: `libro-ctp-<sufijo>.xlsx`. */
export function ctpPeriodFileSuffix(period: CtpPeriod): string {
  if (!period.from || !period.to) return "historico";
  return `${period.from.slice(0, 10)}_${period.to.slice(0, 10)}`;
}
