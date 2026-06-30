"use client";

import { CAT_META, fmtPen } from "./gastos-helpers";

/**
 * Dona del gasto mensual por categoría — conic-gradient (sin dependencia de chart
 * lib). Brandon 2026-06-30.
 */
export function CategoryDonut({ data }: { data: { category: string; amountPen: number }[] }) {
  const total = data.reduce((s, d) => s + d.amountPen, 0);
  if (total <= 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Sin gastos para graficar.</p>;
  }

  let acc = 0;
  const stops = data
    .map((d) => {
      const start = (acc / total) * 100;
      acc += d.amountPen;
      const end = (acc / total) * 100;
      return `${CAT_META[d.category]?.color ?? "#94a3b8"} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        <div className="h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
        <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-[var(--surface-1)] text-center">
          <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Total/mes</span>
          <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{fmtPen(total)}</span>
        </div>
      </div>
      <ul className="min-w-[180px] flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.category} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CAT_META[d.category]?.color ?? "#94a3b8" }} />
            <span className="text-[var(--text-secondary)]">{CAT_META[d.category]?.label ?? d.category}</span>
            <span className="ml-auto tabular-nums text-[var(--text-tertiary)]">{fmtPen(d.amountPen)}</span>
            <span className="w-10 text-right tabular-nums font-bold text-[var(--text-primary)]">{Math.round((d.amountPen / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
