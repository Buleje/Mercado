"use client";

import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { BusinessData, Product } from "../ai-center.types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubTab = "margenes" | "simulador" | "calculadora";

interface ProductWithMargin extends Product {
  price: number;
  costPrice: number;
  margin: number;
}

interface SimulatorResult {
  oldPrice: number;
  newPrice: number;
  oldMargin: number;
  newMargin: number;
  monthlyImpact: number;
  qty30d: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcMargin(price: number, costPrice: number): number {
  if (price <= 0) return 0;
  return ((price - costPrice) / price) * 100;
}

function suggestedPriceAt15(costPrice: number): number {
  // price = cost / (1 - 0.15)
  return costPrice / 0.85;
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "margenes", label: "Margenes" },
  { id: "simulador", label: "Simulador" },
  { id: "calculadora", label: "Calculadora" },
];

function SubTabBar({
  active,
  onChange,
}: {
  active: SubTab;
  onChange: (t: SubTab) => void;
}) {
  return (
    <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-4">
      {SUBTABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === tab.id
              ? "text-emerald-600 border-emerald-500 dark:text-emerald-400"
              : "text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Sub-tab 1: Margenes ──────────────────────────────────────────────────────

function MargenesTab({ products }: { products: ProductWithMargin[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? products : products.slice(0, 20);
  const hasMore = products.length > 20;

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
        No hay productos con precio y costo definidos
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Producto
              </th>
              <th className="text-right py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Costo
              </th>
              <th className="text-right py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Precio
              </th>
              <th className="text-right py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Margen
              </th>
              <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Recomendacion
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const isLow = p.margin < 10;
              const isMid = p.margin >= 10 && p.margin <= 20;
              return (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-2.5 pr-4 text-gray-800 dark:text-gray-200 max-w-[180px] truncate">
                    {p.name}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                    {formatCurrency(p.costPrice)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                    {formatCurrency(p.price)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium",
                        isLow
                          ? "text-red-600 dark:text-red-400"
                          : isMid
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {isLow ? (
                        <TrendingDown className="w-3.5 h-3.5" />
                      ) : isMid ? (
                        <Minus className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingUp className="w-3.5 h-3.5" />
                      )}
                      {p.margin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-xs">
                    {isLow ? (
                      <span className="text-red-600 dark:text-red-400">
                        Subir precio &mdash; sugerido{" "}
                        {formatCurrency(suggestedPriceAt15(p.costPrice))}
                      </span>
                    ) : isMid ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Revisar
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Saludable
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {expanded
            ? "Ver menos"
            : `Ver todos (${products.length - 20} mas)`}
        </button>
      )}
    </div>
  );
}

// ─── Sub-tab 2: Simulador ─────────────────────────────────────────────────────

function SimuladorTab({
  products,
  data,
}: {
  products: ProductWithMargin[];
  data: BusinessData;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    products[0] ? String(products[0].id) : "",
  );
  const [pctChange, setPctChange] = useState<string>("5");
  const [result, setResult] = useState<SimulatorResult | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === selectedId) ?? null,
    [products, selectedId],
  );

  function handleSimulate() {
    if (!selectedProduct) return;
    const pct = parseFloat(pctChange);
    if (isNaN(pct)) return;

    const oldPrice = selectedProduct.price;
    const newPrice = oldPrice * (1 + pct / 100);
    const oldMargin = selectedProduct.margin;
    const newMargin = calcMargin(newPrice, selectedProduct.costPrice);

    // Qty sold in last 30 days for this product
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let qty30d = 0;
    for (const sale of data.sales) {
      if (sale.createdAt && new Date(sale.createdAt).getTime() < cutoff)
        continue;
      for (const item of sale.items) {
        if (String(item.productId) === String(selectedProduct.id)) {
          qty30d += item.quantity;
        }
      }
    }

    const monthlyImpact = (newPrice - oldPrice) * qty30d;

    setResult({ oldPrice, newPrice, oldMargin, newMargin, monthlyImpact, qty30d });
  }

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
        No hay productos con precio y costo definidos
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Inputs row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Producto
          </label>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setResult(null);
            }}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {products.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Cambio de precio
          </label>
          <div className="relative">
            <input
              type="number"
              value={pctChange}
              onChange={(e) => {
                setPctChange(e.target.value);
                setResult(null);
              }}
              placeholder="5"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-7 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              %
            </span>
          </div>
        </div>

        <button
          onClick={handleSimulate}
          disabled={!selectedProduct}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Simular
        </button>
      </div>

      {/* Result card */}
      {result && selectedProduct && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Precio actual
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                {formatCurrency(result.oldPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Precio nuevo
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                {formatCurrency(result.newPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Margen actual
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                {result.oldMargin.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Margen nuevo
              </p>
              <p
                className={cn(
                  "text-sm font-medium tabular-nums",
                  result.newMargin > result.oldMargin
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {result.newMargin.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              Impacto mensual estimado
              <span className="text-gray-400 dark:text-gray-500">
                {" "}({result.qty30d} unid. vendidas en 30d)
              </span>
            </p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums",
                result.monthlyImpact >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {result.monthlyImpact >= 0 ? "+" : ""}
              {formatCurrency(result.monthlyImpact)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-tab 3: Calculadora ───────────────────────────────────────────────────

function CalculadoraTab() {
  const [cost, setCost] = useState<string>("");
  const [desiredMargin, setDesiredMargin] = useState<string>("20");

  const calc = useMemo(() => {
    const c = parseFloat(cost);
    const m = parseFloat(desiredMargin);
    if (isNaN(c) || isNaN(m) || c <= 0) return null;
    if (m <= 0 || m >= 100) return null;
    const price = c / (1 - m / 100);
    const profit = price - c;
    return { price, profit };
  }, [cost, desiredMargin]);

  const marginNum = parseFloat(desiredMargin);
  const showWarning =
    desiredMargin !== "" &&
    (isNaN(marginNum) || marginNum <= 0 || marginNum >= 100);

  return (
    <div className="max-w-sm">
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Calculadora de margen
        </p>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Costo (S/)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Margen deseado (%)
          </label>
          <input
            type="number"
            min="1"
            max="99"
            step="1"
            value={desiredMargin}
            onChange={(e) => setDesiredMargin(e.target.value)}
            className={cn(
              "w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500",
              showWarning
                ? "border-red-300 dark:border-red-700"
                : "border-gray-200 dark:border-gray-700",
            )}
          />
          {showWarning && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              El margen debe estar entre 1% y 99%
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
          {calc ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Precio sugerido
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(calc.price)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Ganancia por unidad
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                  {formatCurrency(calc.profit)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Ingresa el costo para ver el precio sugerido
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalisisSection({ data }: { data: BusinessData }) {
  const [activeTab, setActiveTab] = useState<SubTab>("margenes");

  const pricedProducts = useMemo<ProductWithMargin[]>(() => {
    return data.products
      .filter(
        (p): p is Product & { price: number; costPrice: number } =>
          p.price !== undefined &&
          p.price !== null &&
          p.costPrice !== undefined &&
          p.costPrice !== null &&
          p.price > 0,
      )
      .map((p) => ({
        ...p,
        price: p.price,
        costPrice: p.costPrice,
        margin: calcMargin(p.price, p.costPrice),
      }))
      .sort((a, b) => a.margin - b.margin);
  }, [data.products]);

  return (
    <div>
      <SubTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "margenes" && (
        <MargenesTab products={pricedProducts} />
      )}
      {activeTab === "simulador" && (
        <SimuladorTab products={pricedProducts} data={data} />
      )}
      {activeTab === "calculadora" && <CalculadoraTab />}
    </div>
  );
}
