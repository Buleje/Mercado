"use client";

import { LoadingState, DataTable } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { BarChart2, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import type { ABCProduct } from "@/app/api/analytics/abc/route";
import { formatCurrency } from "@/lib/format";
import { VacioMetricas } from "@/components/admin/analisis/metricas-tarjetas";

const CLASS_STYLES: Record<"A" | "B" | "C", { label: string; variant: BadgeVariant }> = {
  A: { label: "Crítico", variant: "success" },
  B: { label: "Importante", variant: "warning" },
  C: { label: "Bajo impacto", variant: "error" },
};

function fmt(n: number) { return `${formatCurrency(n)}`; }

export default function ABCAnalysisTab() {
  const [data, setData]   = useState<ABCProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "A" | "B" | "C">("all");

  useEffect(() => {
    fetch("/api/analytics/abc")
      .then(r => r.ok ? r.json() : [])
      .then((d: ABCProduct[]) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = data.filter(p => {
    if (filter !== "all" && p.class !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { A: data.filter(p => p.class === "A").length, B: data.filter(p => p.class === "B").length, C: data.filter(p => p.class === "C").length };
  const revenue = { A: data.filter(p => p.class === "A").reduce((s, p) => s + p.revenue, 0), B: data.filter(p => p.class === "B").reduce((s, p) => s + p.revenue, 0), C: data.filter(p => p.class === "C").reduce((s, p) => s + p.revenue, 0) };
  const totalRevenue = data.reduce((s, p) => s + p.revenue, 0);

  if (loading) return <LoadingState />;

  if (data.length === 0) {
    return (
      <VacioMetricas
        icono={BarChart2}
        titulo="Sin ventas para clasificar"
        descripcion="Con tus ventas y pedidos, aquí ves qué pocos productos hacen la mayor parte de tus ingresos."
      />
    );
  }

  // Sin título propio (el panel de Métricas dice «ABC (80/20)» y el ⓘ lo
  // explica). Las tres clases son el filtro, en una fila; la tabla, con
  // cabecera fija y alto tope, en vez de 17+ filas que empujaban la página.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {(["A", "B", "C"] as const).map(cls => (
          <button
            key={cls}
            type="button"
            aria-pressed={filter === cls}
            onClick={() => setFilter(f => f === cls ? "all" : cls)}
            className={cn(
              "flex min-h-12 min-w-0 flex-1 basis-56 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
              filter === cls ? "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2" title={`Clase ${cls}: ${CLASS_STYLES[cls].label}`}>
                <span className="shrink-0 whitespace-nowrap"><StatusBadge variant={CLASS_STYLES[cls].variant} label={`Clase ${cls}`} /></span>
                <span className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(revenue[cls])}</span>
              </span>
              <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
                {counts[cls]} productos · {totalRevenue > 0 ? ((revenue[cls] / totalRevenue) * 100).toFixed(1) : 0} % del ingreso
              </span>
            </span>
          </button>
        ))}
        <label className="relative flex-1 basis-56">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" className="h-full min-h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm" />
        </label>
      </div>

      <DataTable stickyHeader wrapperClassName="max-h-[26rem] overflow-y-auto" className="min-w-[600px]">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Producto</th>
            <th className="hidden sm:table-cell">Categoría</th>
            <th className="text-right">Ingresos</th>
            <th className="hidden text-right md:table-cell">Unidades</th>
            <th className="hidden text-right md:table-cell">Acum. %</th>
            <th className="text-center">Clase</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.productId}>
              <td className="text-[var(--text-secondary)]">{data.indexOf(p) + 1}</td>
              <td className="font-semibold">{p.name}</td>
              <td className="hidden text-[var(--text-secondary)] sm:table-cell">{p.category}</td>
              <td className="text-right font-bold">{fmt(p.revenue)}</td>
              <td className="hidden text-right text-[var(--text-secondary)] md:table-cell">{p.units}</td>
              <td className="hidden text-right text-[var(--text-secondary)] md:table-cell">{p.cumulativePct}%</td>
              <td className="text-center">
                <StatusBadge variant={CLASS_STYLES[p.class].variant} label={p.class} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-[var(--text-secondary)]">No se encontraron productos</td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
