"use client";

/**
 * Lo que va dentro del panel «Indicadores» de Gastos, arriba de las tarjetas:
 * los gastos de los últimos 6 meses (barras) y en qué se fue la plata desde
 * siempre, por categoría.
 *
 * Antes las categorías eran tarjetas grandes arriba de la lista y, al tocarlas,
 * filtraban la lista DEL PERÍODO con una cifra de TODA LA HISTORIA: en main,
 * «Alquiler S/ 850» llevaba a «Ningún gasto de esa categoría en este período»
 * (11-10). Ahora dicen lo que son —desde siempre— y el filtro de la lista es
 * el selector de categoría, que cuenta lo del período.
 */

import { CardTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface MesDeGasto {
  label: string;
  total: number;
}
export interface CategoriaDeGasto {
  category: string;
  total: number;
  count: number;
}

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ResumenDeGastos({ porMes, categorias, total }: { porMes: MesDeGasto[]; categorias: CategoriaDeGasto[]; total: number }) {
  const hayMeses = porMes.some((m) => m.total > 0);
  if (!hayMeses && categorias.length === 0) return null;
  const maximo = Math.max(...porMes.map((m) => m.total), 1);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {hayMeses && (
        <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-3 text-sm font-bold" as="h3">
            Últimos 6 meses
          </CardTitle>
          <ol className="flex h-36 items-end gap-2" aria-label="Gastos de los últimos 6 meses">
            {porMes.map((m, i) => {
              const alto = m.total > 0 ? Math.max((m.total / maximo) * 80, 4) : 4;
              const actual = i === porMes.length - 1;
              return (
                <li key={m.label} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${formatCurrency(m.total)}`}>
                  <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                    {m.total > 0 ? formatCurrency(m.total, { decimals: 0 }) : ""}
                  </span>
                  <span
                    aria-hidden
                    className={cn("w-full rounded-t-md", actual ? "bg-[var(--data-error-500)]" : "bg-[var(--data-error-500)]/60")}
                    style={{ height: `${alto}px`, opacity: m.total > 0 ? 1 : 0.25 }}
                  />
                  <span className="text-sm capitalize text-[var(--text-secondary)]">{m.label}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {categorias.length > 0 && (
        <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-3 text-sm font-bold" as="h3">
            Por categoría, desde siempre
          </CardTitle>
          <ul className="space-y-2">
            {categorias.map((c) => (
              <li key={c.category} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-[var(--text-primary)]">
                    {conMayuscula(c.category)} <span className="text-[var(--text-secondary)]">({c.count})</span>
                  </span>
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(c.total)}</span>
                </div>
                {total > 0 && (
                  <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(c.total / total) * 100}%` }} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
