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

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 shadow-sm">
      {label !== undefined && (
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((item, i) => {
          const formatted = format
            ? format(item.value ?? 0, item.name)
            : String(item.value ?? "");
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              {item.name && (
                <span className="text-gray-500">{item.name}</span>
              )}
              <span className="font-bold text-gray-900 dark:text-white tabular-nums ml-auto">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
