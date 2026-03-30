'use client';

/** Mejora 15: Tooltip unificado mejorado con % del total y comparativo */
export function ChartTooltip({ active, payload, label, totalValue, previousValue, previousLabel }: any) {
  if (!active || !payload?.length) return null;

  // Compute total from all payload entries when totalValue is not provided
  const computedTotal = typeof totalValue === 'number'
    ? totalValue
    : payload.reduce((s: number, p: any) => s + (typeof p.value === 'number' ? p.value : 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => {
        const val = typeof p.value === 'number' ? p.value : 0;
        const formatted = val >= 100 ? `S/ ${val.toLocaleString('es-PE')}` : val.toFixed(1);
        const pct = computedTotal > 0 && payload.length === 1 && typeof totalValue === 'number'
          ? Math.round((val / computedTotal) * 100)
          : null;

        return (
          <div key={i} className="text-xs flex justify-between gap-4 items-baseline">
            <span className="text-gray-500 dark:text-gray-400">{p.name || p.dataKey}</span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono font-medium" style={{ color: p.color || '#0f766e' }}>
                {typeof p.value === 'number' ? formatted : p.value}
              </span>
              {pct !== null && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">({pct}%)</span>
              )}
            </span>
          </div>
        );
      })}
      {/* Comparativo vs periodo anterior */}
      {typeof previousValue === 'number' && previousValue > 0 && payload.length > 0 && (
        (() => {
          const currentVal = typeof payload[0].value === 'number' ? payload[0].value : 0;
          const diff = previousValue > 0 ? Math.round(((currentVal - previousValue) / previousValue) * 100) : 0;
          const isUp = diff >= 0;
          return (
            <div className="border-t border-gray-100 dark:border-gray-700 mt-1.5 pt-1.5">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 flex justify-between">
                <span>{previousLabel || 'vs anterior'}</span>
                <span className={`font-bold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {isUp ? '+' : ''}{diff}%
                </span>
              </p>
            </div>
          );
        })()
      )}
    </div>
  );
}
