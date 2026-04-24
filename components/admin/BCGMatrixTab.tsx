"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  Star, Download, Eye,
  Coins, HelpCircle, TrendingDown,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { Product as BaseProduct } from "@/types/erp";

/* ── Types ── */
type Quadrant = "estrella" | "vaca" | "interrogante" | "perro";
type Product = Omit<BaseProduct, "id"> & { id: number; quadrant: Quadrant; revenue: number; growth: number; marketShare: number; units: number };

/* ── Config ── */
const Q_CONFIG: Record<Quadrant, { label: string; Icon: LucideIcon; color: string; bg: string; desc: string }> = {
  estrella: { label: "Estrellas", Icon: Star, color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border-[var(--data-warning)] dark:border-[var(--data-warning)]", desc: "Alto crecimiento + alta participación. Invertir y potenciar." },
  vaca: { label: "Vacas Lecheras", Icon: Coins, color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", desc: "Bajo crecimiento + alta participación. Máximo beneficio, mínima inversión." },
  interrogante: { label: "Interrogantes", Icon: HelpCircle, color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", desc: "Alto crecimiento + baja participación. Evaluar si invertir o descartar." },
  perro: { label: "Perros", Icon: TrendingDown, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-canvas)]/20 border-[var(--rule-base)]", desc: "Bajo crecimiento + baja participación. Considerar eliminar." },
};

/* ── Seed Data ── */
const PRODUCTS: Product[] = [];

const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

// Pre-computed dot positions (module-level to avoid impure calls during render)
const DOT_POSITIONS = new Map<number, { x: number; y: number }>();
PRODUCTS.forEach(p => {
  const x = p.quadrant === "estrella" || p.quadrant === "vaca" ? 10 + Math.random() * 35 : 55 + Math.random() * 35;
  const y = p.quadrant === "estrella" || p.quadrant === "interrogante" ? 10 + Math.random() * 35 : 55 + Math.random() * 35;
  DOT_POSITIONS.set(p.id, { x, y });
});

export default function BCGMatrixTab() {
  const [selectedQ, setSelectedQ] = useState<Quadrant | "todas">("todas");
  const [detail, setDetail] = useState<Product | null>(null);

  const grouped = useMemo(() => {
    const g: Record<Quadrant, Product[]> = { estrella: [], vaca: [], interrogante: [], perro: [] };
    PRODUCTS.forEach(p => g[p.quadrant].push(p));
    return g;
  }, []);

  const filtered = selectedQ === "todas" ? PRODUCTS : PRODUCTS.filter(p => p.quadrant === selectedQ);
  const totalRevenue = PRODUCTS.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Star className="h-6 w-6 text-[var(--data-warning)]" /> Matriz BCG
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Clasifica productos por crecimiento y participación de mercado</p>
        </div>
        <button onClick={() => exportToCSV(PRODUCTS.map(p => ({ Producto: p.name, Categoría: p.category, Ingreso: p.revenue, Crecimiento: `${p.growth}%`, Participación: `${p.marketShare}%`, Cuadrante: Q_CONFIG[p.quadrant].label })), "bcg-matrix")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Quadrant summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {(["estrella", "vaca", "interrogante", "perro"] as Quadrant[]).map(q => {
          const c = Q_CONFIG[q];
          const items = grouped[q];
          const rev = items.reduce((s, p) => s + p.revenue, 0);
          return (
            <button key={q} onClick={() => setSelectedQ(selectedQ === q ? "todas" : q)} className={cn("rounded-xl border-2 p-3 sm:p-5 text-left transition-all hover:shadow-sm", c.bg, selectedQ === q && "ring-2 ring-primary ring-offset-2 dark:ring-offset-card")}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={cn("font-extrabold text-sm", c.color)}>{c.label}</span>
              </div>
              <p className="text-2xl sm:text-3xl font-mono font-extrabold text-[var(--text-primary)] dark:text-foreground">{items.length}</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1">{fmt(rev)} ({totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(0) : 0}%)</p>
            </button>
          );
        })}
      </div>

      {/* Visual Matrix */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-6">
        <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4">Mapa Visual BCG</CardTitle>
        <div className="relative w-full aspect-square max-w-[500px] mx-auto" style={{ minHeight: 400 }}>
          {/* Axes */}
          <div className="absolute inset-0 grid grid-cols-1 sm:grid-cols-2 grid-rows-2 rounded-xl overflow-hidden">
            <div className="border-b-2 border-r-2 border-[var(--rule-base)] dark:border-card-border bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)] flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-success)]/40 dark:text-[var(--data-success)]/40">Estrellas</span>
            </div>
            <div className="border-b-2 border-[var(--rule-base)] dark:border-card-border bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)] flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-success)]/40 dark:text-[var(--data-success)]/40">Interrogantes</span>
            </div>
            <div className="border-r-2 border-[var(--rule-base)] dark:border-card-border bg-[var(--data-warning-50)]/50 dark:bg-amber-950/10 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-warning)]/40 dark:text-[var(--data-warning)]/40">Vacas Lecheras</span>
            </div>
            <div className="bg-[var(--data-error-50)]/50 dark:bg-red-950/10 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--text-secondary)]/40 dark:text-[var(--text-tertiary)]/40">Perros</span>
            </div>
          </div>
          {/* Axis labels */}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-semibold text-[var(--text-tertiary)]">Participacion (%)</div>
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-semibold text-[var(--text-tertiary)] whitespace-nowrap">Crecimiento (%)</div>
          {/* Product dots */}
          {PRODUCTS.map(p => {
            const pos = DOT_POSITIONS.get(p.id) ?? { x: 50, y: 50 };
            const x = pos.x;
            const y = pos.y;
            const size = Math.max(24, Math.min(48, (p.revenue / totalRevenue) * 400));
            return (
              <button key={p.id} onClick={() => setDetail(p)} title={p.name} className={cn("absolute rounded-full border-2 border-white dark:border-card flex items-center justify-center text-[length:var(--ts-2xs)] font-bold hover:scale-125 transition-transform z-10", p.quadrant === "estrella" ? "bg-[var(--accent-soft)] text-white" : p.quadrant === "vaca" ? "bg-[var(--data-warning)] text-white" : p.quadrant === "interrogante" ? "bg-[var(--accent-soft)] text-white" : "bg-gray-400 text-white")} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}>
                {p.name.slice(0, 2)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
          <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Detalle de Productos ({filtered.length})</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="bg-gray-50 dark:bg-surface text-left">
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Ingreso</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Crecimiento</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Participación</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Cuadrante</th>
              <th className="px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-center">Acción</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.map(p => {
                const c = Q_CONFIG[p.quadrant];
                return (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-surface">
                    <td className="px-5 py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{p.name}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)] dark:text-muted">{p.category}</td>
                    <td className="px-5 py-3 text-right font-bold">{fmt(p.revenue)}</td>
                    <td className={cn("px-5 py-3 text-right font-bold", p.growth >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>{p.growth > 0 && "+"}{p.growth}%</td>
                    <td className="px-5 py-3 text-right font-bold">{p.marketShare}%</td>
                    <td className="px-5 py-3"><span className={cn("text-xs font-bold px-2 py-1 rounded-full", c.bg)}>{c.label}</span></td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setDetail(p)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
        {(["estrella", "vaca", "interrogante", "perro"] as Quadrant[]).map(q => {
          const c = Q_CONFIG[q];
          const QIcon = c.Icon;
          return (
            <div key={q} className={cn("rounded-xl border-2 p-3 sm:p-5", c.bg)}>
              <h4 className={cn("font-extrabold flex items-center gap-2", c.color)}>
                <QIcon className="h-4 w-4" strokeWidth={1.75} />
                {c.label}
              </h4>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">{c.desc}</p>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2 tabular-nums">{grouped[q].length} productos • {fmt(grouped[q].reduce((s, p) => s + p.revenue, 0))}</p>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.name}</CardTitle>
              <button onClick={() => setDetail(null)} className="text-base sm:text-xl font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Ingreso</span><p className="font-bold">{fmt(detail.revenue)}</p></div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Crecimiento</span><p className={cn("font-bold", detail.growth >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>{detail.growth > 0 && "+"}{detail.growth}%</p></div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Participación</span><p className="font-bold">{detail.marketShare}%</p></div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Unidades/mes</span><p className="font-bold">{detail.units}</p></div>
              <div className="col-span-2 bg-gray-50 dark:bg-surface rounded-xl p-3">
                <span className="text-xs text-[var(--text-tertiary)]">Cuadrante</span>
                {(() => {
                  const DIcon = Q_CONFIG[detail.quadrant].Icon;
                  return (
                    <p className="font-bold inline-flex items-center gap-1.5">
                      <DIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {Q_CONFIG[detail.quadrant].label}
                    </p>
                  );
                })()}
              </div>
              <div className="col-span-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3"><span className="text-xs font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">Recomendación</span><p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] mt-1">{Q_CONFIG[detail.quadrant].desc}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
