"use client";

/**
 * Editorial tooltip para Recharts — reemplaza el default.
 * Pasar como prop `content` del <Tooltip />.
 */

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

  // 2026-04-24: tipografia escalada para legibilidad
  //   label (X axis tick): text-2xs -> text-xs
  //   items (name/value):  text-xs  -> text-sm
  //   dot indicator:       h-2 w-2 -> h-2.5 w-2.5
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg px-3.5 py-2.5 shadow-sm min-w-[140px]">
      {label !== undefined && (
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((item, i) => {
          const formatted = format
            ? format(item.value ?? 0, item.name)
            : String(item.value ?? "");
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              {item.name && (
                <span className="text-[var(--text-secondary)]">{item.name}</span>
              )}
              <span className="font-bold text-[var(--text-primary)] tabular-nums ml-auto">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
