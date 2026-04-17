"use client";
import { useState, useMemo } from "react";
import { Calendar, Download, Sun, Snowflake, Leaf, Flower2 } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── types ──────────────────────────────────────────────────── */
type MonthData = {
  month: string;
  shortMonth: string;
  sales: number;
  orders: number;
  avgTicket: number;
  topCategory: string;
  season: "verano" | "otoño" | "invierno" | "primavera";
};

type ProductSeason = {
  product: string;
  category: string;
  peakMonths: string[];
  lowMonths: string[];
  variationPct: number;
};

/* ── seed data ──────────────────────────────────────────────── */
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHLY_DATA: MonthData[] = [];

const PRODUCT_SEASONS: ProductSeason[] = [];

const SEASON_ICONS = {
  verano: Sun,
  otoño: Leaf,
  invierno: Snowflake,
  primavera: Flower2,
};
const SEASON_COLORS = {
  verano: "text-amber-500",
  otoño: "text-orange-500",
  invierno: "text-emerald-500",
  primavera: "text-green-500",
};

/* ── component ──────────────────────────────────────────────── */
export default function SeasonalityTab() {
  const [view, setView] = useState<"mensual" | "productos">("mensual");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const avgSales = useMemo(() => MONTHLY_DATA.reduce((s, m) => s + m.sales, 0) / 12, []);
  const maxSales = useMemo(() => Math.max(...MONTHLY_DATA.map(m => m.sales)), []);
  const bestMonth = MONTHLY_DATA.find(m => m.sales === maxSales)!;
  const minSales = Math.min(...MONTHLY_DATA.map(m => m.sales));
  const worstMonth = MONTHLY_DATA.find(m => m.sales === minSales)!;
  const seasonVariation = ((maxSales - minSales) / avgSales * 100);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return PRODUCT_SEASONS;
    return PRODUCT_SEASONS.filter(p => p.category === categoryFilter);
  }, [categoryFilter]);

  const categories = [...new Set(PRODUCT_SEASONS.map(p => p.category))];

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">Estacionalidad de Productos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Patrones estacionales de ventas y demanda por producto</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
            {(["mensual", "productos"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold transition-colors capitalize", view === v ? "bg-primary text-white" : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}>{v}</button>
            ))}
          </div>
          <button
            onClick={() => exportToCSV(MONTHLY_DATA.map(m => ({ Mes: m.month, Ventas: m.sales, Pedidos: m.orders, TicketPromedio: m.avgTicket, TopCategoría: m.topCategory })), "estacionalidad")}
            className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Mejor mes</p>
          <p className="text-lg font-extrabold text-emerald-600 mt-1">{bestMonth.shortMonth}</p>
          <p className="text-xs text-gray-500 dark:text-muted">{fmt(bestMonth.sales)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Peor mes</p>
          <p className="text-lg font-extrabold text-red-600 mt-1">{worstMonth.shortMonth}</p>
          <p className="text-xs text-gray-500 dark:text-muted">{fmt(worstMonth.sales)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Promedio mensual</p>
          <p className="text-lg font-extrabold text-gray-900 dark:text-foreground mt-1">{fmt(avgSales)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Variación estacional</p>
          <p className="text-lg font-extrabold text-amber-600 mt-1">{seasonVariation.toFixed(1)}%</p>
        </div>
      </div>

      {/* Monthly view */}
      {view === "mensual" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-6 ">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">Ventas por mes</h3>
          <div className="space-y-3">
            {MONTHLY_DATA.map(m => {
              const pct = (m.sales / maxSales) * 100;
              const vsAvg = ((m.sales - avgSales) / avgSales) * 100;
              const SeasonIcon = SEASON_ICONS[m.season];
              return (
                <div key={m.month} className="flex flex-wrap items-center gap-3">
                  <div className="w-8 text-center"><SeasonIcon className={cn("h-4 w-4 mx-auto", SEASON_COLORS[m.season])} /></div>
                  <div className="w-10 text-sm font-bold text-gray-700 dark:text-foreground">{m.shortMonth}</div>
                  <div className="flex-1">
                    <div className="w-full h-6 bg-gray-100 dark:bg-surface rounded-lg overflow-hidden relative">
                      <div className={cn("h-full rounded-lg transition-all", m.sales === maxSales ? "bg-emerald-500" : m.sales === minSales ? "bg-red-400" : "bg-primary/70")} style={{ width: `${pct}%` }} />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-bold text-gray-700 dark:text-foreground">{fmt(m.sales)}</span>
                    </div>
                  </div>
                  <div className={cn("w-16 text-right text-xs font-bold", vsAvg >= 0 ? "text-emerald-600" : "text-red-500")}>{vsAvg >= 0 ? "+" : ""}{vsAvg.toFixed(1)}%</div>
                  <div className="w-24 text-xs text-gray-500 dark:text-muted text-right">{m.topCategory}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Products view */}
      {view === "productos" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary">
              <option value="all">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border  overflow-y-hidden overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                  <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Producto</th>
                  <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Categoría</th>
                  <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Meses pico</th>
                  <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Meses bajos</th>
                  <th className="text-right px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Variación</th>
                  <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Mapa calor</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.product} className="border-b border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-900 dark:text-foreground">{p.product}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted">{p.category}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">{p.peakMonths.map(m => <span key={m} className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">{m}</span>)}</div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">{p.lowMonths.slice(0, 3).map(m => <span key={m} className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold">{m}</span>)}</div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                      <span className={cn("font-bold", p.variationPct >= 50 ? "text-red-600" : p.variationPct >= 30 ? "text-amber-600" : "text-gray-600 dark:text-muted")}>{p.variationPct}%</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(m => (
                          <div key={m} title={m} className={cn("w-3 h-3 rounded-sm", p.peakMonths.includes(m) ? "bg-emerald-500" : p.lowMonths.includes(m) ? "bg-red-400" : "bg-gray-200 dark:bg-surface")} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Recommendations */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 sm:p-5">
        <h3 className="font-extrabold text-amber-800 dark:text-amber-400 text-sm flex flex-wrap items-center gap-2"><Calendar className="h-4 w-4" /> Recomendaciones estacionales</h3>
        <ul className="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-400">
          <li>• <strong>Dic-Mar (Verano):</strong> Incrementar stock de bebidas, helados y agua. Promociones de hidratación.</li>
          <li>• <strong>Jul (Fiestas Patrias):</strong> Preparar stock de cervezas, golosinas, snacks. Mes de mayor demanda.</li>
          <li>• <strong>Nov-Dic:</strong> Stock agresivo de panetones, cervezas, gaseosas. Decoración navideña.</li>
          <li>• <strong>Feb-Mar (Escolar):</strong> Oportunidad en útiles escolares y loncheras.</li>
          <li>• <strong>Ago (Bajo):</strong> Reducir compras, liquidar sobrantes. Enfocarse en productos estables.</li>
        </ul>
      </div>
    </div>
  );
}
