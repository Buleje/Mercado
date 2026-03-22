"use client";
import { useState, useMemo } from "react";
import { Target, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";
import type { Product } from "@/types/erp";

/* ── Helpers ── */
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/* ── Seed Data ── */
const PRODUCTS: Product[] = [];

const FIXED_COSTS: { name: string; amount: number }[] = [];

export default function BreakEvenTab() {
  const [selectedProduct, setSelectedProduct] = useState<number | "general">("general");
  const [customFixed, setCustomFixed] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customCost, setCustomCost] = useState("");

  const totalFixed = useMemo(() => {
    const override = parseFloat(customFixed);
    return isNaN(override) ? FIXED_COSTS.reduce((s, c) => s + c.amount, 0) : override;
  }, [customFixed]);

  // General break-even (weighted average)
  const generalAnalysis = useMemo(() => {
    const totalRevenue = PRODUCTS.reduce((s, p) => s + p.unitPrice * p.monthlySales, 0);
    const totalVariable = PRODUCTS.reduce((s, p) => s + p.unitCost * p.monthlySales, 0);
    const avgContribMargin = (totalRevenue - totalVariable) / totalRevenue;
    const breakEvenRevenue = totalFixed / avgContribMargin;
    const currentProfit = totalRevenue - totalVariable - totalFixed;
    const safetyMargin = ((totalRevenue - breakEvenRevenue) / totalRevenue) * 100;
    return { totalRevenue, totalVariable, avgContribMargin, breakEvenRevenue, currentProfit, safetyMargin };
  }, [totalFixed]);

  // Product-specific break-even
  const productAnalysis = useMemo(() => {
    if (selectedProduct === "general") return null;
    const p = PRODUCTS[selectedProduct];
    const price = parseFloat(customPrice) || p.unitPrice;
    const cost = parseFloat(customCost) || p.unitCost;
    const contrib = price - cost;
    const breakEvenUnits = contrib > 0 ? Math.ceil(totalFixed / contrib) : Infinity;
    const breakEvenRevenue = breakEvenUnits * price;
    const currentRevenue = p.monthlySales * price;
    const currentProfit = (p.monthlySales * contrib) - totalFixed;
    return { product: p, price, cost, contrib, breakEvenUnits, breakEvenRevenue, currentRevenue, currentProfit, monthlySales: p.monthlySales };
  }, [selectedProduct, totalFixed, customPrice, customCost]);

  // Chart data (general)
  const chartPoints = useMemo(() => {
    const steps = 20;
    const maxRev = generalAnalysis.totalRevenue * 1.5;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const revenue = (maxRev / steps) * i;
      const cost = totalFixed + revenue * (1 - generalAnalysis.avgContribMargin);
      return { revenue, cost };
    });
  }, [generalAnalysis, totalFixed]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Target className="h-6 w-6 text-red-500" /> Análisis Break-Even
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Punto de equilibrio: ¿cuánto necesitas vender para cubrir costos?</p>
        </div>
        <button onClick={() => exportToCSV(PRODUCTS.map(p => ({ Producto: p.name, Precio: p.unitPrice, Costo: p.unitCost, Margen: (p.unitPrice - p.unitCost).toFixed(2), VentasMes: p.monthlySales })), "break-even")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setSelectedProduct("general"); setCustomPrice(""); setCustomCost(""); }} className={cn("px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-bold transition-colors", selectedProduct === "general" ? "bg-red-500 text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
          Vista General
        </button>
        {PRODUCTS.map((p, i) => (
          <button key={i} onClick={() => { setSelectedProduct(i); setCustomPrice(""); setCustomCost(""); }} className={cn("px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-bold transition-colors", selectedProduct === i ? "bg-red-500 text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
            {p.name.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>

      {/* Fixed costs */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">Costos Fijos Mensuales</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FIXED_COSTS.map((c, i) => (
            <div key={i} className="bg-gray-50 dark:bg-surface rounded-xl p-3">
              <p className="text-xs text-gray-400">{c.name}</p>
              <p className="font-bold text-gray-900 dark:text-foreground">{fmt(c.amount)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-500">Total:</span>
          <span className="text-lg font-extrabold text-red-600">{fmt(totalFixed)}</span>
          <input value={customFixed} onChange={e => setCustomFixed(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Sobrescribir total fijo" className="ml-auto px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary w-48" />
        </div>
      </div>

      {/* General view */}
      {selectedProduct === "general" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Ventas Actuales</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{fmt(generalAnalysis.totalRevenue)}</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Punto de Equilibrio</p>
              <p className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">{fmt(generalAnalysis.breakEvenRevenue)}</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Utilidad Mensual</p>
              <p className={cn("text-xl sm:text-2xl font-extrabold mt-1", generalAnalysis.currentProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{fmt(generalAnalysis.currentProfit)}</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Margen de Seguridad</p>
              <p className={cn("text-xl sm:text-2xl font-extrabold mt-1", generalAnalysis.safetyMargin >= 20 ? "text-emerald-600" : "text-amber-600")}>{generalAnalysis.safetyMargin.toFixed(1)}%</p>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-6">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4">Gráfico Break-Even</h3>
            <div className="relative h-64">
              <svg viewBox="0 0 400 200" className="w-full h-full">
                {/* Revenue line */}
                <polyline fill="none" stroke="#10b981" strokeWidth="2" points={chartPoints.map((p, i) => `${(i / chartPoints.length) * 380 + 20},${200 - (p.revenue / (generalAnalysis.totalRevenue * 1.5)) * 180}`).join(" ")} />
                {/* Cost line */}
                <polyline fill="none" stroke="#ef4444" strokeWidth="2" points={chartPoints.map((p, i) => `${(i / chartPoints.length) * 380 + 20},${200 - (p.cost / (generalAnalysis.totalRevenue * 1.5)) * 180}`).join(" ")} />
                {/* Fixed cost line */}
                <line x1="20" y1={200 - (totalFixed / (generalAnalysis.totalRevenue * 1.5)) * 180} x2="400" y2={200 - (totalFixed / (generalAnalysis.totalRevenue * 1.5)) * 180} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4" />
                {/* Break-even point */}
                <circle cx={(generalAnalysis.breakEvenRevenue / (generalAnalysis.totalRevenue * 1.5)) * 380 + 20} cy={200 - (generalAnalysis.breakEvenRevenue / (generalAnalysis.totalRevenue * 1.5)) * 180} r="5" fill="#ef4444" />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-5 text-[10px] text-gray-400">
                <span>S/ 0</span><span>Break-Even: {fmt(generalAnalysis.breakEvenRevenue)}</span><span>{fmt(generalAnalysis.totalRevenue * 1.5)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 mt-3 text-xs">
              <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-emerald-500" />Ingresos</span>
              <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-red-500" />Costos Totales</span>
              <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-gray-400 border-dashed" />Costos Fijos</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500" />Punto de Equilibrio</span>
            </div>
          </div>
        </>
      )}

      {/* Product-specific view */}
      {productAnalysis && (
        <>
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">Simular Precio/Costo — {productAnalysis.product.name}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Precio Venta (S/)</label>
                <input type="number" step="0.10" value={customPrice || productAnalysis.product.unitPrice} onChange={e => setCustomPrice(e.target.value)} className="w-full mt-1 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Costo Unitario (S/)</label>
                <input type="number" step="0.10" value={customCost || productAnalysis.product.unitCost} onChange={e => setCustomCost(e.target.value)} className="w-full mt-1 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Contribución/Unidad</p>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{fmt(productAnalysis.contrib)}</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Punto Equilibrio (und)</p>
              <p className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">{productAnalysis.breakEvenUnits === Infinity ? "∞" : productAnalysis.breakEvenUnits.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Ventas Actuales</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{productAnalysis.monthlySales.toLocaleString()} und</p>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">{productAnalysis.monthlySales >= productAnalysis.breakEvenUnits ? "Ganancia" : "Pérdida"}</p>
              <p className={cn("text-xl sm:text-2xl font-extrabold mt-1", productAnalysis.currentProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{fmt(productAnalysis.currentProfit)}</p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">Progreso hacia Break-Even</h3>
            <div className="relative h-8 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", productAnalysis.monthlySales >= productAnalysis.breakEvenUnits ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, (productAnalysis.monthlySales / productAnalysis.breakEvenUnits) * 100)}%` }} />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-extrabold">
                {productAnalysis.monthlySales >= productAnalysis.breakEvenUnits ? "✓ Superado" : `${((productAnalysis.monthlySales / productAnalysis.breakEvenUnits) * 100).toFixed(0)}%`}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0</span><span>Break-Even: {productAnalysis.breakEvenUnits.toLocaleString()} und</span><span>Actual: {productAnalysis.monthlySales.toLocaleString()}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
