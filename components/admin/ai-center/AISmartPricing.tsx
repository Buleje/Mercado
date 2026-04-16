"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight,
  RefreshCw, Zap, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

interface PriceSuggestion {
  productId: number | string;
  name: string;
  currentPrice: number;
  costPrice: number;
  suggestedPrice: number;
  currentMargin: number;
  suggestedMargin: number;
  reason: string;
  impact: string;
  direction: "up" | "down" | "keep";
}

function generatePriceSuggestions(data: BusinessData): PriceSuggestion[] {
  const suggestions: PriceSuggestion[] = [];

  // Build sales data per product
  const productSales: Record<string, { qty: number; revenue: number }> = {};
  for (const sale of data.sales) {
    for (const item of sale.items) {
      const pid = String(item.productId);
      if (!productSales[pid]) productSales[pid] = { qty: 0, revenue: 0 };
      productSales[pid].qty += item.quantity;
      productSales[pid].revenue += item.price * item.quantity;
    }
  }

  for (const product of data.products) {
    if (!product.active || !product.price || !product.costPrice || product.costPrice <= 0) continue;

    const pid = String(product.id);
    const sales = productSales[pid] ?? { qty: 0, revenue: 0 };
    const currentMargin = ((product.price - product.costPrice) / product.price) * 100;

    // ── Low margin + high sales → raise price ──────────────────────
    if (currentMargin < 15 && sales.qty > 3) {
      const targetMargin = 25;
      const suggestedPrice = Math.ceil((product.costPrice / (1 - targetMargin / 100)) * 100) / 100;
      const diff = suggestedPrice - product.price;
      if (diff > 0.5) {
        suggestions.push({
          productId: product.id,
          name: product.name,
          currentPrice: product.price,
          costPrice: product.costPrice,
          suggestedPrice,
          currentMargin,
          suggestedMargin: targetMargin,
          reason: `Margen solo ${currentMargin.toFixed(0)}% y se vende bien (${sales.qty} uds). Puedes subir el precio sin perder clientes.`,
          impact: `+S/${(diff * sales.qty).toFixed(0)}/período de ganancia extra`,
          direction: "up",
        });
      }
    }

    // ── High margin + low sales → lower price to sell more ─────────
    if (currentMargin > 50 && sales.qty < 2 && product.stock && product.stock > 5) {
      const targetMargin = 35;
      const suggestedPrice = Math.ceil((product.costPrice / (1 - targetMargin / 100)) * 100) / 100;
      if (product.price - suggestedPrice > 0.5) {
        suggestions.push({
          productId: product.id,
          name: product.name,
          currentPrice: product.price,
          costPrice: product.costPrice,
          suggestedPrice,
          currentMargin,
          suggestedMargin: targetMargin,
          reason: `Margen alto (${currentMargin.toFixed(0)}%) pero casi no se vende. Bajando el precio puede rotar más rápido.`,
          impact: `Mover ${product.stock} unidades estancadas`,
          direction: "down",
        });
      }
    }

    // ── Good margin, good sales → highlight as optimal ─────────────
    if (currentMargin >= 20 && currentMargin <= 40 && sales.qty >= 5) {
      suggestions.push({
        productId: product.id,
        name: product.name,
        currentPrice: product.price,
        costPrice: product.costPrice,
        suggestedPrice: product.price,
        currentMargin,
        suggestedMargin: currentMargin,
        reason: `Precio óptimo — buen margen y buena rotación.`,
        impact: `Mantener — genera S/${sales.revenue.toFixed(0)} en ventas`,
        direction: "keep",
      });
    }
  }

  // Sort: low margin first (most actionable), then high margin with low sales
  return suggestions.sort((a, b) => {
    if (a.direction === "up" && b.direction !== "up") return -1;
    if (b.direction === "up" && a.direction !== "up") return 1;
    if (a.direction === "down" && b.direction === "keep") return -1;
    return a.currentMargin - b.currentMargin;
  });
}

const DIRECTION_CONFIG = {
  up: { icon: TrendingUp, label: "Subir precio", color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-400" },
  down: { icon: TrendingDown, label: "Bajar precio", color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-400" },
  keep: { icon: Check, label: "Precio óptimo", color: "text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-800/30 dark:border-gray-700/40 dark:text-gray-400" },
};

export default function AISmartPricing({ data }: { data: BusinessData }) {
  const suggestions = useMemo(() => generatePriceSuggestions(data), [data]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  React.useEffect(() => {
    fetch("/api/ai/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => setAiAvailable(d?.hasAI ?? false))
      .catch(() => setAiAvailable(false));
  }, []);

  const askAIPricing = useCallback(async () => {
    setLoading(true);
    try {
      const productSummary = suggestions.slice(0, 15).map(s =>
        `${s.name}: costo S/${s.costPrice.toFixed(2)}, precio S/${s.currentPrice.toFixed(2)}, margen ${s.currentMargin.toFixed(0)}%, sugerido S/${s.suggestedPrice.toFixed(2)}`
      ).join("\n");

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Eres un experto en pricing para bodegas y tiendas de abarrotes en Pucallpa, Perú. Analiza estos productos y dame recomendaciones de precios considerando:
- Competencia local (bodegas en barrio)
- Temporada actual (zona tropical)
- Psicología de precios (precios terminados en .90, .50)
- Productos que se compran juntos (bundles)

PRODUCTOS:
${productSummary}

Dame 5 recomendaciones concretas de pricing. Para cada una: producto, precio sugerido, por qué, ganancia extra estimada.
Responde en español, directo, sin rodeos.`,
          mode: "coach",
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setAiAnalysis(result.response ?? result.data?.response ?? "Sin respuesta");
      } else {
        setAiAnalysis("No se pudo consultar la IA");
      }
    } catch {
      setAiAnalysis("Error al conectar con la IA");
    } finally {
      setLoading(false);
    }
  }, [suggestions]);

  const upCount = suggestions.filter(s => s.direction === "up").length;
  const downCount = suggestions.filter(s => s.direction === "down").length;
  const potentialGain = suggestions
    .filter(s => s.direction === "up")
    .reduce((acc, s) => acc + (s.suggestedPrice - s.currentPrice), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Optimización de Precios IA</h2>
            <p className="text-xs text-gray-500">Sugerencias automáticas basadas en margen, ventas y competencia</p>
          </div>
        </div>
        {aiAvailable && (
          <button
            onClick={askAIPricing}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? "Analizando..." : "Consultar IA"}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
          <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{upCount}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Subir precio</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
          <TrendingDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{downCount}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Bajar precio</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
          <ArrowUpRight className="w-5 h-5 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">+S/{potentialGain.toFixed(0)}</p>
          <p className="text-[10px] text-amber-600 dark:text-amber-500">Ganancia potencial</p>
        </div>
      </div>

      {/* AI analysis */}
      {aiAnalysis && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-primary">Análisis de la IA</h3>
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
            {aiAnalysis}
          </div>
        </div>
      )}

      {/* Product cards */}
      <div className="space-y-3">
        {suggestions.slice(0, 12).map(s => {
          const config = DIRECTION_CONFIG[s.direction];
          const Icon = config.icon;
          const priceDiff = s.suggestedPrice - s.currentPrice;

          return (
            <div key={`price-${s.productId}`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className={cn("shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border", config.color)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <span className="text-gray-500">Costo: S/{s.costPrice.toFixed(2)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">Actual: S/{s.currentPrice.toFixed(2)}</span>
                    {s.direction !== "keep" && (
                      <span className={cn("font-bold", s.direction === "up" ? "text-emerald-600" : "text-emerald-600")}>
                        → S/{s.suggestedPrice.toFixed(2)} ({priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{s.reason}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[10px] font-medium text-gray-400">
                      Margen: {s.currentMargin.toFixed(0)}%{s.direction !== "keep" ? ` → ${s.suggestedMargin.toFixed(0)}%` : ""}
                    </span>
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {s.impact}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {suggestions.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No hay suficientes datos de costos para analizar precios</p>
          <p className="text-xs mt-1">Agrega el precio de costo a tus productos para ver sugerencias</p>
        </div>
      )}
    </div>
  );
}
