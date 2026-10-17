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
 * El período INMEDIATAMENTE ANTERIOR, para comparar contra él.
 *
 * «Entraron 135 m³» no dice nada solo. «135 m³, 40 % menos que el mes pasado»
 * es una decisión de compra. El libro sabía contar el período elegido y nunca
 * el de al lado.
 *
 * Se corre hacia atrás **el mismo largo** que el período elegido, terminando el
 * día antes de que empiece: el trimestre se compara contra el trimestre previo,
 * no contra el mes previo. Comparar lapsos de distinto largo es la forma más
 * fácil de fabricar una caída del 66 % que no existió.
 *
 * `null` cuando no hay contra qué comparar: «todo el histórico» no tiene un
 * antes, y un rango sin definir tampoco. Devolver un período inventado sería
 * peor que no comparar.
 */
export function periodoAnterior(period: CtpPeriod): CtpPeriod | null {
  if (!period.from || !period.to) return null;

  const desde = new Date(period.from);
  const hasta = new Date(period.to);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta <= desde) return null;

  /* Los meses de calendario se corren por MES, no por milisegundos: febrero
     contra enero tiene que dar enero entero, y restarle 28 días a marzo daría
     un pedazo de febrero más un pedazo de enero. */
  if (period.key === "mes-actual" || period.key === "mes-anterior") {
    const py = desde.getFullYear();
    const pm = desde.getMonth() - 1;
    const prev = new Date(py, pm, 1);
    const fin = new Date(prev.getFullYear(), prev.getMonth(), lastDay(prev.getFullYear(), prev.getMonth()), 23, 59, 59, 999);
    return { key: period.key, from: prev.toISOString(), to: fin.toISOString(), label: monthLabel(prev) };
  }
  if (period.key === "trimestre") {
    /* Tres MESES calendario hacia atrás, no 92 días: restar el largo en
       milisegundos daba «31 mar — 30 jun», que no es ningún trimestre y se lee
       como un error de cálculo. El trimestre se compara contra el trimestre. */
    const ini = new Date(desde.getFullYear(), desde.getMonth() - 3, 1);
    const finMes = new Date(ini.getFullYear(), ini.getMonth() + 2, 1);
    const fin = endOfDay(finMes.getFullYear(), finMes.getMonth(), lastDay(finMes.getFullYear(), finMes.getMonth()));
    return {
      key: period.key,
      from: startOfDay(ini.getFullYear(), ini.getMonth(), 1).toISOString(),
      to: fin.toISOString(),
      label: `${monthLabel(ini)} — ${monthLabel(finMes)}`,
    };
  }
  if (period.key === "anio") {
    const py = desde.getFullYear() - 1;
    return {
      key: period.key,
      from: startOfDay(py, 0, 1).toISOString(),
      to: endOfDay(py, 11, 31).toISOString(),
      label: `Año ${py}`,
    };
  }

  /* Rangos custom: mismo largo, pegado por detrás — es lo único honesto
     cuando el usuario eligió un lapso arbitrario. */
  const largoMs = hasta.getTime() - desde.getTime();
  const finPrev = new Date(desde.getTime() - 1);
  const iniPrev = new Date(finPrev.getTime() - largoMs);
  return {
    key: period.key,
    from: iniPrev.toISOString(),
    to: finPrev.toISOString(),
    label: `${dayLabel(iniPrev)} — ${dayLabel(finPrev)}`,
  };
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
