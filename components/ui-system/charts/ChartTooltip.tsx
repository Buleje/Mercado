"use client";

/**
 * Editorial tooltip para Recharts — reemplaza el default.
 * Pasar como prop `content` del <Tooltip />.
 *
 * Brandon mayo 2026 v2: si payload tiene `iso` (Date ISO string), el label
 * superior se formatea a "Viernes 1 de Mayo" en lugar del label corto del
 * eje X ("01 May"). Así el tooltip da contexto completo de fecha sin que
 * el eje X se sature.
 */

const DAY_FULL_TT = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_FULL_TT = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function formatIsoToHumanDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dayName = DAY_FULL_TT[d.getDay()];
  const monthName = MONTH_FULL_TT[d.getMonth()];
  return `${dayName} ${d.getDate()} de ${monthName}`;
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    name?: string;
    color?: string;
    dataKey?: string;
    payload?: Record<string, unknown>;
  }>;
  format?: (value: number | string, name?: string) => string;
}

export function ChartTooltip({ active, label, payload, format }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Intento elevar el label a "Viernes 1 de Mayo" usando el iso del payload
  // (si los buckets traen `iso`). Fallback al label corto del eje X.
  const firstPayloadIso = payload[0]?.payload?.iso;
  const humanDate = typeof firstPayloadIso === "string"
    ? formatIsoToHumanDate(firstPayloadIso)
    : null;
  const displayLabel = humanDate ?? (label !== undefined ? String(label) : undefined);

  return (
    <div className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-xl px-4 py-3 shadow-md min-w-[220px]">
      {displayLabel !== undefined && (
        <p className="text-sm font-extrabold text-[var(--text-primary)] mb-2.5 leading-tight">
          {displayLabel}
        </p>
      )}
      <div className="space-y-2">
        {payload.map((item, i) => {
          const formatted = format
            ? format(item.value ?? 0, item.name)
            : String(item.value ?? "");
          return (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              {item.name && (
                <span className="text-[var(--text-secondary)] font-semibold">{item.name}:</span>
              )}
              <span className="font-extrabold text-[var(--text-primary)] tabular-nums ml-auto">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
