"use client";
import { useState, useEffect, useMemo } from "react";
import { Target, Download, Loader2, AlertTriangle, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/* ── Types ── */
type ProductRecord = {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice?: number;
  stock?: number;
  monthlySales?: number; // calculado desde ventas
  active?: boolean;
};

type ExpenseRecord = {
  id: string;
  category: string;
  amount: number;
  date: string;
  recurring: boolean;
};

type SaleRecord = {
  id: string;
  items: { productId: number; quantity: number; price: number }[];
  total: number;
  createdAt: string;
};

/* ── Calcular ventas mensuales por producto ── */
function calcMonthlySales(
  products: ProductRecord[],
  sales: SaleRecord[]
): ProductRecord[] {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = sales.filter((s) => new Date(s.createdAt) >= last30);

  const salesByProduct = new Map<number, number>();
  recentSales.forEach((sale) => {
    sale.items?.forEach((item) => {
      salesByProduct.set(
        item.productId,
        (salesByProduct.get(item.productId) ?? 0) + item.quantity
      );
    });
  });

  return products
    .filter((p) => p.active !== false && p.price > 0)
    .map((p) => ({
      ...p,
      costPrice: p.costPrice ?? p.price * 0.65, // 65% costo por defecto
      monthlySales: salesByProduct.get(p.id) ?? 0,
    }));
}

/* ── Costos fijos mensuales desde gastos recurrentes ── */
function calcFixedCosts(expenses: ExpenseRecord[]): { name: string; amount: number }[] {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Recurrentes o del último mes
  const recent = expenses.filter(
    (e) => e.recurring || new Date(e.date) >= last30
  );

  // Agrupar por categoría
  const grouped = new Map<string, number>();
  recent.forEach((e) => {
    grouped.set(e.category, (grouped.get(e.category) ?? 0) + e.amount);
  });

  return Array.from(grouped.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10); // top 10 categorías
}

/* ── Component ── */
export default function BreakEvenTab() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<number | "general">("general");
  const [customFixed, setCustomFixed] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customCost, setCustomCost] = useState("");

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch("/api/products?limit=200").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/expenses").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/sales").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([prods, exps, sls]) => {
        const rawProds = Array.isArray(prods) ? prods : (prods?.products ?? prods?.data ?? []);
        setProducts(rawProds);
        setExpenses(Array.isArray(exps) ? exps : []);
        setSales(Array.isArray(sls) ? sls : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  /* Productos enriquecidos con ventas mensuales */
  const enrichedProducts = useMemo(
    () => calcMonthlySales(products, sales),
    [products, sales]
  );

  /* Solo los que tienen ventas (para selector) */
  const activeProducts = useMemo(
    () => enrichedProducts.filter((p) => p.monthlySales! > 0).slice(0, 20),
    [enrichedProducts]
  );

  /* Costos fijos */
  const fixedCosts = useMemo(() => calcFixedCosts(expenses), [expenses]);

  const totalFixed = useMemo(() => {
    const override = parseFloat(customFixed);
    return isNaN(override)
      ? fixedCosts.reduce((s, c) => s + c.amount, 0)
      : override;
  }, [customFixed, fixedCosts]);

  /* Análisis general (margen ponderado) */
  const generalAnalysis = useMemo(() => {
    const totalRevenue = enrichedProducts.reduce(
      (s, p) => s + p.price * (p.monthlySales ?? 0),
      0
    );
    const totalVariable = enrichedProducts.reduce(
      (s, p) => s + (p.costPrice ?? p.price * 0.65) * (p.monthlySales ?? 0),
      0
    );
    const grossProfit = totalRevenue - totalVariable;
    const avgContribMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
    const breakEvenRevenue =
      avgContribMargin > 0 ? totalFixed / avgContribMargin : Infinity;
    const currentProfit = grossProfit - totalFixed;
    const safetyMargin =
      totalRevenue > 0
        ? ((totalRevenue - breakEvenRevenue) / totalRevenue) * 100
        : 0;
    return {
      totalRevenue,
      totalVariable,
      avgContribMargin,
      breakEvenRevenue,
      currentProfit,
      safetyMargin,
    };
  }, [enrichedProducts, totalFixed]);

  /* Análisis por producto */
  const productAnalysis = useMemo(() => {
    if (selectedProduct === "general") return null;
    const p = enrichedProducts.find((x) => x.id === selectedProduct);
    if (!p) return null;
    const price = parseFloat(customPrice) || p.price;
    const cost = parseFloat(customCost) || (p.costPrice ?? p.price * 0.65);
    const contrib = price - cost;
    const breakEvenUnits = contrib > 0 ? Math.ceil(totalFixed / contrib) : Infinity;
    const breakEvenRevenue = breakEvenUnits === Infinity ? Infinity : breakEvenUnits * price;
    const currentRevenue = (p.monthlySales ?? 0) * price;
    const currentProfit = (p.monthlySales ?? 0) * contrib - totalFixed;
    return {
      product: p,
      price,
      cost,
      contrib,
      breakEvenUnits,
      breakEvenRevenue,
      currentRevenue,
      currentProfit,
      monthlySales: p.monthlySales ?? 0,
    };
  }, [selectedProduct, enrichedProducts, totalFixed, customPrice, customCost]);

  /* Puntos para SVG del gráfico */
  const chartPoints = useMemo(() => {
    const steps = 20;
    const maxRev =
      generalAnalysis.totalRevenue > 0
        ? generalAnalysis.totalRevenue * 1.5
        : totalFixed * 3;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const revenue = (maxRev / steps) * i;
      const cost =
        totalFixed +
        revenue * (1 - generalAnalysis.avgContribMargin);
      return { revenue, cost };
    });
  }, [generalAnalysis, totalFixed]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 dark:text-muted">Cargando datos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500 dark:text-muted text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  const maxChartVal =
    generalAnalysis.totalRevenue > 0 ? generalAnalysis.totalRevenue * 1.5 : totalFixed * 3;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Target className="h-6 w-6 text-red-500" /> Análisis Break-Even
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">
            Punto de equilibrio basado en {enrichedProducts.length} productos, {expenses.length} gastos y {sales.length} ventas reales
          </p>
        </div>
        <button
          onClick={() =>
            exportToCSV(
              enrichedProducts.map((p) => ({
                Producto: p.name,
                Categoría: p.category,
                Precio: p.price,
                Costo: p.costPrice ?? p.price * 0.65,
                Margen: (p.price - (p.costPrice ?? p.price * 0.65)).toFixed(2),
                VentasMes: p.monthlySales ?? 0,
              })),
              "break-even"
            )
          }
          className="flex flex-wrap items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Selector de producto */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setSelectedProduct("general");
            setCustomPrice("");
            setCustomCost("");
          }}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-bold transition-colors",
            selectedProduct === "general"
              ? "bg-red-500 text-white"
              : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent"
          )}
        >
          Vista General
        </button>
        {activeProducts.slice(0, 12).map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setSelectedProduct(p.id);
              setCustomPrice("");
              setCustomCost("");
            }}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-bold transition-colors",
              selectedProduct === p.id
                ? "bg-red-500 text-white"
                : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent"
            )}
          >
            {p.name.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
        {activeProducts.length === 0 && (
          <span className="text-xs text-gray-400 dark:text-muted italic">
            Sin ventas recientes — los productos aparecen aquí cuando tienen ventas del último mes
          </span>
        )}
      </div>

      {/* Costos fijos */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">
          Costos Fijos Mensuales
          {expenses.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({fixedCosts.length} categorías del último mes)
            </span>
          )}
        </h3>
        {fixedCosts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fixedCosts.map((c) => (
              <div key={c.name} className="bg-gray-50 dark:bg-surface rounded-xl p-3">
                <p className="text-xs text-gray-400 truncate">{c.name}</p>
                <p className="font-bold text-gray-900 dark:text-foreground">{fmt(c.amount)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-muted italic">
            No hay gastos registrados. Registra egresos para calcular costos fijos reales.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-500">Total:</span>
          <span className="text-lg font-extrabold text-red-600">{fmt(totalFixed)}</span>
          <input
            value={customFixed}
            onChange={(e) => setCustomFixed(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Sobrescribir total fijo"
            className="ml-auto px-4 py-2 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary w-52"
          />
        </div>
      </div>

      {/* Vista general */}
      {selectedProduct === "general" && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Ventas del mes</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">
                {fmt(generalAnalysis.totalRevenue)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {enrichedProducts.filter((p) => (p.monthlySales ?? 0) > 0).length} productos vendidos
              </p>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Punto de equilibrio</p>
              <p className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">
                {generalAnalysis.breakEvenRevenue === Infinity ? "∞" : fmt(generalAnalysis.breakEvenRevenue)}
              </p>
              <p className="text-xs text-gray-400 mt-1">necesitas vender esto al mes</p>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Utilidad mensual</p>
              <p
                className={cn(
                  "text-xl sm:text-2xl font-extrabold mt-1",
                  generalAnalysis.currentProfit >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                {fmt(generalAnalysis.currentProfit)}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {generalAnalysis.currentProfit >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <p className="text-xs text-gray-400">
                  {generalAnalysis.currentProfit >= 0 ? "Ganancia" : "Pérdida"} este mes
                </p>
              </div>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Margen de seguridad</p>
              <p
                className={cn(
                  "text-xl sm:text-2xl font-extrabold mt-1",
                  generalAnalysis.safetyMargin >= 20
                    ? "text-emerald-600"
                    : generalAnalysis.safetyMargin >= 0
                    ? "text-amber-600"
                    : "text-red-600"
                )}
              >
                {generalAnalysis.safetyMargin.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400 mt-1">distancia al punto de quiebre</p>
            </div>
          </div>

          {/* Mensaje clave */}
          <div
            className={cn(
              "rounded-xl border p-5 flex flex-wrap items-start gap-3",
              generalAnalysis.currentProfit >= 0
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
            )}
          >
            <Target
              className={cn(
                "h-6 w-6 shrink-0 mt-0.5",
                generalAnalysis.currentProfit >= 0 ? "text-emerald-500" : "text-red-500"
              )}
            />
            <div>
              <p
                className={cn(
                  "font-extrabold text-lg",
                  generalAnalysis.currentProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                )}
              >
                {generalAnalysis.breakEvenRevenue === Infinity
                  ? "Sin datos suficientes para calcular"
                  : generalAnalysis.currentProfit >= 0
                  ? `Superaste el break-even en ${fmt(generalAnalysis.currentProfit)}`
                  : `Necesitas vender ${fmt(Math.abs(generalAnalysis.currentProfit / (generalAnalysis.avgContribMargin || 1)))} más para cubrir costos`}
              </p>
              <p className="text-sm text-gray-600 dark:text-muted mt-1">
                Punto de equilibrio: <strong>{fmt(generalAnalysis.breakEvenRevenue === Infinity ? 0 : generalAnalysis.breakEvenRevenue)}</strong> · Margen de contribución promedio: <strong>{(generalAnalysis.avgContribMargin * 100).toFixed(1)}%</strong>
              </p>
            </div>
          </div>

          {/* Gráfico SVG */}
          <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4">
              Gráfico Break-Even
            </h3>
            <div className="relative h-64">
              <svg viewBox="0 0 400 200" className="w-full h-full">
                {/* Ejes */}
                <line x1="20" y1="0" x2="20" y2="200" stroke="#e5e7eb" strokeWidth="1" />
                <line x1="20" y1="200" x2="400" y2="200" stroke="#e5e7eb" strokeWidth="1" />
                {/* Línea de ingresos */}
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  points={chartPoints
                    .map(
                      (p, i) =>
                        `${(i / chartPoints.length) * 380 + 20},${200 - (p.revenue / maxChartVal) * 180}`
                    )
                    .join(" ")}
                />
                {/* Línea de costos totales */}
                <polyline
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  points={chartPoints
                    .map(
                      (p, i) =>
                        `${(i / chartPoints.length) * 380 + 20},${200 - (p.cost / maxChartVal) * 180}`
                    )
                    .join(" ")}
                />
                {/* Línea de costos fijos */}
                <line
                  x1="20"
                  y1={200 - (totalFixed / maxChartVal) * 180}
                  x2="400"
                  y2={200 - (totalFixed / maxChartVal) * 180}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
                {/* Punto de equilibrio */}
                {generalAnalysis.breakEvenRevenue !== Infinity && (
                  <circle
                    cx={Math.min(
                      (generalAnalysis.breakEvenRevenue / maxChartVal) * 380 + 20,
                      400
                    )}
                    cy={
                      200 -
                      (generalAnalysis.breakEvenRevenue / maxChartVal) * 180
                    }
                    r="6"
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth="2"
                  />
                )}
                {/* Ventas actuales — línea vertical */}
                {generalAnalysis.totalRevenue > 0 && (
                  <line
                    x1={(generalAnalysis.totalRevenue / maxChartVal) * 380 + 20}
                    y1="0"
                    x2={(generalAnalysis.totalRevenue / maxChartVal) * 380 + 20}
                    y2="200"
                    stroke="#00B4A6"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    opacity="0.6"
                  />
                )}
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-5 text-[length:var(--ts-2xs)] text-gray-400">
                <span>S/ 0</span>
                {generalAnalysis.breakEvenRevenue !== Infinity && (
                  <span>BE: {fmt(generalAnalysis.breakEvenRevenue)}</span>
                )}
                <span>{fmt(maxChartVal)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 mt-4 text-xs">
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-emerald-500" /> Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-red-500" /> Costos totales
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-px bg-gray-400" style={{ borderTop: "1.5px dashed" }} /> Costos fijos
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white" /> Punto equilibrio
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-px h-3 bg-primary opacity-60" style={{ borderLeft: "1.5px dashed" }} /> Ventas actuales
              </span>
            </div>
          </div>
        </>
      )}

      {/* Vista por producto */}
      {productAnalysis && (
        <>
          {/* Inputs de simulación */}
          <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">
              Simular Precio/Costo — {productAnalysis.product.name}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Precio Venta (S/)</label>
                <input
                  type="number"
                  step="0.10"
                  value={customPrice || productAnalysis.product.price}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-full mt-1 px-4 py-2 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Costo Unitario (S/)</label>
                <input
                  type="number"
                  step="0.10"
                  value={customCost || (productAnalysis.product.costPrice ?? productAnalysis.product.price * 0.65)}
                  onChange={(e) => setCustomCost(e.target.value)}
                  className="w-full mt-1 px-4 py-2 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* KPIs por producto */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Contribución/Unidad</p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {fmt(productAnalysis.contrib)}
              </p>
              <p className="text-xs text-gray-400 mt-1">por cada unidad vendida</p>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Punto equilibrio</p>
              <p className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">
                {productAnalysis.breakEvenUnits === Infinity
                  ? "∞"
                  : productAnalysis.breakEvenUnits.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-1">unidades/mes necesarias</p>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Ventas del mes</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">
                {productAnalysis.monthlySales.toLocaleString()} und
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {fmt(productAnalysis.currentRevenue)} en ingresos
              </p>
            </div>
            <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">
                {productAnalysis.monthlySales >= productAnalysis.breakEvenUnits ? "Ganancia" : "Pérdida"}
              </p>
              <p
                className={cn(
                  "text-xl sm:text-2xl font-extrabold mt-1",
                  productAnalysis.currentProfit >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                {fmt(productAnalysis.currentProfit)}
              </p>
              <p className="text-xs text-gray-400 mt-1">este mes</p>
            </div>
          </div>

          {/* Barra de progreso hacia break-even */}
          <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3">
              Progreso hacia el Punto de Equilibrio
            </h3>
            {productAnalysis.breakEvenUnits === Infinity ? (
              <p className="text-sm text-amber-600 font-semibold">
                El precio debe ser mayor al costo para calcular el break-even.
              </p>
            ) : (
              <>
                <div className="relative h-10 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      productAnalysis.monthlySales >= productAnalysis.breakEvenUnits
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    )}
                    style={{
                      width: `${Math.min(
                        100,
                        (productAnalysis.monthlySales / productAnalysis.breakEvenUnits) * 100
                      )}%`,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-gray-700 dark:text-foreground">
                    {productAnalysis.monthlySales >= productAnalysis.breakEvenUnits
                      ? "Superado — ganando dinero"
                      : `${((productAnalysis.monthlySales / productAnalysis.breakEvenUnits) * 100).toFixed(0)}% del break-even`}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>0 und</span>
                  <span>Break-Even: {productAnalysis.breakEvenUnits.toLocaleString()} und</span>
                  <span>Actual: {productAnalysis.monthlySales.toLocaleString()} und</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
