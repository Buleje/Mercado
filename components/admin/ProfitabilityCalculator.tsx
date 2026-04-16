"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Loader2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

interface SimPoint {
  price: number;
  salesMultiplier: number;
  revenue: number;
  profit: number;
  label: string;
}

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SEED_PRODUCTS: Product[] = [
  { id: 1, name: "Arroz Extra Superior 5kg", price: 22.5, category: "Abarrotes" },
  { id: 2, name: "Aceite Primor 1L", price: 7.9, category: "Abarrotes" },
  { id: 3, name: "Azúcar Rubia 1kg", price: 3.8, category: "Abarrotes" },
  { id: 4, name: "Fideos Lavaggi 500g", price: 2.5, category: "Abarrotes" },
  { id: 5, name: "Leche Gloria Entera 400g", price: 3.5, category: "Lácteos" },
];

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({
  points,
  optimalIndex,
}: {
  points: SimPoint[];
  optimalIndex: number;
}) {
  const maxProfit = Math.max(...points.map((p) => p.profit), 0.01);

  return (
    <div className="flex h-32 items-end gap-1">
      {points.map((p, i) => {
        const pct = Math.max(0, (p.profit / maxProfit) * 100);
        const isOptimal = i === optimalIndex;
        const isCurrent = i === 0;
        return (
          <div key={i} className="group relative flex flex-1 flex-col items-center">
            {/* Tooltip */}
            <div className="absolute -top-16 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center group-hover:block">
              <p className="text-xs font-semibold text-gray-800">
                {fmt(p.price)}
              </p>
              <p className="text-xs text-primary">{fmt(p.profit)}/mes</p>
            </div>
            <div
              className={cn(
                "w-full rounded-t-sm transition-all",
                isOptimal
                  ? "bg-secondary"
                  : isCurrent
                  ? "bg-primary"
                  : "bg-gray-200"
              )}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <span className="mt-1 text-center text-[9px] leading-tight text-gray-500">
              {fmt(p.price).replace("S/ ", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfitabilityCalculator() {
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [loadingProds, setLoadingProds] = useState(false);
  const [selectedId, setSelectedId] = useState<number>(SEED_PRODUCTS[0].id);

  const [cost, setCost] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [monthlySales, setMonthlySales] = useState<number>(30);
  const [elasticity, setElasticity] = useState<number>(15);

  useEffect(() => {
    setLoadingProds(true);
    fetch("/api/products?limit=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data)) {
          setProducts(data.slice(0, 50));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProds(false));
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId),
    [products, selectedId]
  );

  useEffect(() => {
    if (selectedProduct) {
      setPrice(selectedProduct.price);
      const estimated = selectedProduct.price * 0.7;
      setCost(parseFloat(estimated.toFixed(2)));
    }
  }, [selectedProduct]);

  // ─── Simulation points ────────────────────────────────────────────────────

  const simPoints = useMemo((): SimPoint[] => {
    if (price <= 0 || cost <= 0) return [];
    const steps = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
    return steps.map((delta) => {
      const newPrice = parseFloat((price * (1 + delta)).toFixed(2));
      // Price elasticity: lower price → more sales, higher price → fewer
      const salesMultiplier = Math.max(0.1, 1 - delta * (elasticity / 100) * 2);
      const projectedSales = monthlySales * salesMultiplier;
      const revenue = newPrice * projectedSales;
      const profitPerUnit = newPrice - cost;
      const profit = profitPerUnit * projectedSales;
      const pctLabel =
        delta === 0 ? "actual" : delta > 0 ? `+${(delta * 100).toFixed(0)}%` : `${(delta * 100).toFixed(0)}%`;
      return {
        price: newPrice,
        salesMultiplier,
        revenue,
        profit,
        label: pctLabel,
      };
    });
  }, [price, cost, monthlySales, elasticity]);

  const currentPoint = useMemo(() => simPoints.find((_, i) => i === 4), [simPoints]);
  const optimalIndex = useMemo(() => {
    if (simPoints.length === 0) return 0;
    let best = 0;
    for (let i = 1; i < simPoints.length; i++) {
      if (simPoints[i].profit > simPoints[best].profit) best = i;
    }
    return best;
  }, [simPoints]);

  const optimalPoint = simPoints[optimalIndex];

  const diffVsCurrent = useCallback(
    (p: SimPoint) => {
      if (!currentPoint) return 0;
      return p.profit - currentPoint.profit;
    },
    [currentPoint]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Inputs */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-gray-800">
              Parámetros
            </h3>
          </div>

          {/* Product selector */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Producto
            </label>
            <div className="relative">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                disabled={loadingProds}
                className={cn(
                  "w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-sm",
                  "text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  ""
                )}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              {loadingProds && (
                <Loader2 className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
              )}
            </div>
          </div>

          {/* Numeric inputs */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Precio actual (S/)", value: price, setter: setPrice, min: 0.01 },
              { label: "Costo unitario (S/)", value: cost, setter: setCost, min: 0.01 },
              { label: "Ventas mensuales (und)", value: monthlySales, setter: setMonthlySales, min: 1 },
            ].map(({ label, value, setter, min }) => (
              <div key={label}>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {label}
                </label>
                <input
                  type="number"
                  min={min}
                  step={label.includes("S/") ? 0.1 : 1}
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className={cn(
                    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm",
                    "text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                    ""
                  )}
                />
              </div>
            ))}

            {/* Elasticity slider */}
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Si bajo S/1, ventas suben: {elasticity}%
              </label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={elasticity}
                onChange={(e) => setElasticity(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="mt-0.5 flex justify-between text-xs text-gray-400">
                <span>Poca demanda</span>
                <span>Alta demanda</span>
              </div>
            </div>
          </div>

          {/* Current metrics */}
          {currentPoint && price > cost && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Margen actual</p>
                <p className="text-sm font-bold text-gray-800">
                  {(((price - cost) / price) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Ganancia/mes</p>
                <p className="text-sm font-bold text-primary">
                  {fmt(currentPoint.profit)}
                </p>
              </div>
            </div>
          )}

          {price <= cost && cost > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <TrendingDown className="h-4 w-4 shrink-0" />
              El precio es menor o igual al costo. Estás vendiendo a pérdida.
            </div>
          )}
        </div>

        {/* Chart + optimal */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-secondary" />
            <h3 className="text-sm font-semibold text-gray-800">
              Precio vs ganancia mensual
            </h3>
          </div>

          {simPoints.length > 0 ? (
            <>
              <BarChart points={simPoints} optimalIndex={optimalIndex} />

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  <span className="text-gray-500">Precio actual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-secondary" />
                  <span className="text-gray-500">Precio óptimo</span>
                </div>
              </div>

              {/* Optimal suggestion */}
              {optimalPoint && currentPoint && (
                <div className="mt-4 rounded-lg border border-secondary/30 bg-secondary/5 p-4">
                  <div className="flex items-start gap-2">
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        Punto óptimo sugerido: {fmt(optimalPoint.price)}
                      </p>
                      {optimalPoint.price !== price ? (
                        <p className="mt-0.5 text-xs text-gray-600">
                          Proyección: {fmt(optimalPoint.profit)}/mes
                          {" · "}
                          <span
                            className={cn(
                              "font-semibold",
                              diffVsCurrent(optimalPoint) > 0
                                ? "text-green-600"
                                : "text-red-600"
                            )}
                          >
                            {diffVsCurrent(optimalPoint) > 0 ? "+" : ""}
                            {fmt(diffVsCurrent(optimalPoint))} vs precio actual
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-gray-600">
                          El precio actual ya es el óptimo según los parámetros ingresados.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              Ingresa precio y costo para ver la simulación.
            </div>
          )}
        </div>
      </div>

      {/* Simulation table */}
      {simPoints.length > 0 && currentPoint && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-semibold text-gray-800">
              Tabla de simulación
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Precio", "Variación", "Ventas/mes", "Ganancia/mes", "vs Actual"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left font-semibold text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {simPoints.map((p, i) => {
                  const diff = diffVsCurrent(p);
                  const isCurrent = i === 4;
                  const isOptimal = i === optimalIndex;
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "transition",
                        isOptimal && "bg-secondary/5",
                        isCurrent && "bg-primary/5"
                      )}
                    >
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {fmt(p.price)}
                        {isOptimal && (
                          <Star className="ml-1 inline h-3 w-3 text-secondary" />
                        )}
                        {isCurrent && (
                          <span className="ml-1 text-[10px] text-primary">(actual)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{p.label}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {Math.round(monthlySales * p.salesMultiplier)}
                      </td>
                      <td className="px-4 py-2 font-semibold text-gray-800">
                        {fmt(p.profit)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 font-semibold",
                          isCurrent
                            ? "text-gray-400"
                            : diff > 0
                            ? "text-green-600"
                            : "text-red-600"
                        )}
                      >
                        {isCurrent ? "-" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
