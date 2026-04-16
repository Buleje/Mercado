"use client";

import React, { useState, useCallback } from "react";
import {
  TrendingUp, Lightbulb, Package, Target, RefreshCw,
  ShoppingCart, Star, AlertTriangle, DollarSign, Zap,
  Plus, Check, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

interface AIInsight {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: "combo" | "pricing" | "product" | "strategy" | "alert";
  urgency: "high" | "medium" | "low";
  action?: string;
  comboProducts?: { productId: number; name: string; price: number; quantity: number }[];
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  combo: { icon: Package, label: "Combo sugerido", color: "text-primary bg-primary/10 border-primary/20" },
  pricing: { icon: DollarSign, label: "Precio", color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-400" },
  product: { icon: ShoppingCart, label: "Producto", color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-400" },
  strategy: { icon: Target, label: "Estrategia", color: "text-violet-600 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800/40 dark:text-violet-400" },
  alert: { icon: AlertTriangle, label: "Atención", color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/40 dark:text-red-400" },
};

const URGENCY_BADGE: Record<string, string> = {
  high: "bg-red-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-gray-400 text-white",
};

function generateLocalInsights(data: BusinessData): AIInsight[] {
  const insights: AIInsight[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const salesToday = data.sales.filter(s => (s.createdAt ?? "").slice(0, 10) === today);

  // Analyze product co-purchases for combo suggestions
  const coPurchases: Record<string, { pair: [string, string]; pairIds: [number | string, number | string]; pairPrices: [number, number]; count: number }> = {};
  for (const sale of data.sales) {
    const items = sale.items;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = [items[i].name, items[j].name].sort().join("|||");
        if (!coPurchases[key]) coPurchases[key] = {
          pair: [items[i].name, items[j].name],
          pairIds: [items[i].productId, items[j].productId],
          pairPrices: [items[i].price, items[j].price],
          count: 0,
        };
        coPurchases[key].count++;
      }
    }
  }

  const topPairs = Object.values(coPurchases).sort((a, b) => b.count - a.count).slice(0, 3);
  for (const pair of topPairs) {
    if (pair.count >= 3) {
      const comboPrice = (pair.pairPrices[0] + pair.pairPrices[1]) * 0.93; // 7% off
      insights.push({
        id: `combo-${pair.pair[0]}-${pair.pair[1]}`,
        title: `Combo: ${pair.pair[0]} + ${pair.pair[1]}`,
        description: `Estos 2 productos se compran juntos ${pair.count} veces. Crear un combo con descuento puede aumentar el ticket promedio.`,
        impact: `Se vendieron juntos ${pair.count} veces`,
        category: "combo",
        urgency: pair.count >= 8 ? "high" : "medium",
        action: `Crear combo a S/${comboPrice.toFixed(2)} (7% dto)`,
        comboProducts: [
          { productId: Number(pair.pairIds[0]), name: pair.pair[0], price: pair.pairPrices[0], quantity: 1 },
          { productId: Number(pair.pairIds[1]), name: pair.pair[1], price: pair.pairPrices[1], quantity: 1 },
        ],
      });
    }
  }

  // Low stock products that sell well
  const productSales: Record<string, number> = {};
  for (const sale of data.sales) {
    for (const item of sale.items) {
      const pid = String(item.productId);
      productSales[pid] = (productSales[pid] ?? 0) + item.quantity;
    }
  }

  for (const product of data.products) {
    const pid = String(product.id);
    const sales = productSales[pid] ?? 0;
    if (product.stock != null && product.stockMin != null && product.stock <= product.stockMin && sales > 5) {
      insights.push({
        id: `stock-alert-${pid}`,
        title: `${product.name} se va a agotar`,
        description: `Vendiste ${sales} unidades pero solo quedan ${product.stock}. Este producto es popular — no dejes que se agote.`,
        impact: `${sales} ventas, solo ${product.stock} en stock`,
        category: "alert",
        urgency: "high",
        action: "Reabastecer esta semana",
      });
    }
  }

  // Products with high margin opportunity
  for (const product of data.products) {
    if (product.price && product.costPrice && product.costPrice > 0) {
      const margin = ((product.price - product.costPrice) / product.price) * 100;
      if (margin < 15 && (productSales[String(product.id)] ?? 0) > 3) {
        insights.push({
          id: `margin-${product.id}`,
          title: `${product.name} tiene margen bajo (${margin.toFixed(0)}%)`,
          description: `Vendés este producto seguido pero ganas poco. Un aumento de 5-10% casi no se nota y mejora tu ganancia.`,
          impact: `Margen actual: ${margin.toFixed(0)}% — podrías ganar +S/${((product.price * 0.08) * (productSales[String(product.id)] ?? 1)).toFixed(0)}/mes`,
          category: "pricing",
          urgency: "medium",
          action: `Subir precio de S/${product.price.toFixed(2)} a S/${(product.price * 1.08).toFixed(2)}`,
        });
      }
    }
  }

  // Day analysis
  const ventasHoy = salesToday.reduce((s, sl) => s + sl.total, 0);
  const promedioPorVenta = salesToday.length > 0 ? ventasHoy / salesToday.length : 0;

  if (salesToday.length > 0 && promedioPorVenta < 20) {
    insights.push({
      id: "avg-ticket-low",
      title: "El ticket promedio está bajo hoy",
      description: `Cada cliente gasta en promedio S/${promedioPorVenta.toFixed(0)}. Ofrece combos o sugerencias al momento de cobrar para subir el ticket.`,
      impact: `Ticket promedio: S/${promedioPorVenta.toFixed(0)} — subir a S/25 = +S/${((25 - promedioPorVenta) * salesToday.length).toFixed(0)} hoy`,
      category: "strategy",
      urgency: "medium",
    });
  }

  // Top product not being promoted
  const topSold = Object.entries(productSales).sort(([, a], [, b]) => b - a).slice(0, 1);
  if (topSold.length > 0) {
    const [topPid, topQty] = topSold[0];
    const topProd = data.products.find(p => String(p.id) === topPid);
    if (topProd) {
      insights.push({
        id: `promote-top-${topPid}`,
        title: `"${topProd.name}" es tu producto estrella`,
        description: `Es tu producto más vendido con ${topQty} unidades. Ponlo en lugar visible, úsalo en combos y ofrécelo primero.`,
        impact: `${topQty} unidades vendidas — tu best seller`,
        category: "product",
        urgency: "low",
        action: "Destacar en la página principal",
      });
    }
  }

  // Inactive customers
  const inactiveCount = data.customers.filter(c => {
    if (!c.lastPurchase) return true;
    const daysSince = (Date.now() - new Date(c.lastPurchase).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 30;
  }).length;

  if (inactiveCount > 5) {
    insights.push({
      id: "inactive-customers",
      title: `${inactiveCount} clientes no compran hace +30 días`,
      description: `Esos clientes ya compraron antes pero dejaron de venir. Un mensaje por WhatsApp con una oferta puede traerlos de vuelta.`,
      impact: `${inactiveCount} clientes que recuperar — potencial S/${(inactiveCount * 15).toFixed(0)}+ en ventas`,
      category: "strategy",
      urgency: "medium",
      action: "Enviar WhatsApp con cupón de reactivación",
    });
  }

  return insights.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

export default function AIMarketResearch({ data }: { data: BusinessData }) {
  const [insights, setInsights] = useState<AIInsight[]>(() => generateLocalInsights(data));
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [creatingCombo, setCreatingCombo] = useState<string | null>(null);
  const [comboCreated, setComboCreated] = useState<Set<string>>(new Set());
  const [alertsSent, setAlertsSent] = useState(false);
  const [sendingAlerts, setSendingAlerts] = useState(false);

  // Check AI availability
  React.useEffect(() => {
    fetch("/api/ai/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => setAiAvailable(d?.hasAI ?? false))
      .catch(() => setAiAvailable(false));
  }, []);

  const refreshInsights = useCallback(() => {
    setInsights(generateLocalInsights(data));
  }, [data]);

  const sendAlerts = useCallback(async () => {
    setSendingAlerts(true);
    try {
      const res = await fetch("/api/cron/market-alerts");
      if (res.ok) setAlertsSent(true);
    } catch { /* silent */ }
    finally { setSendingAlerts(false); }
  }, []);

  const createCombo = useCallback(async (insight: AIInsight) => {
    if (!insight.comboProducts || creatingCombo === insight.id) return;
    setCreatingCombo(insight.id);
    try {
      const totalPrice = insight.comboProducts.reduce((s, p) => s + p.price * p.quantity, 0);
      const comboPrice = Math.round(totalPrice * 0.93 * 100) / 100; // 7% discount
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Combo: ${insight.comboProducts.map(p => p.name).join(" + ")}`,
          description: `Combo sugerido por IA — ${insight.comboProducts.map(p => p.name).join(" + ")} con 7% de descuento`,
          price: comboPrice,
          items: insight.comboProducts.map(p => ({ productId: p.productId, quantity: p.quantity })),
        }),
      });
      if (res.ok) {
        setComboCreated(prev => new Set(prev).add(insight.id));
      }
    } catch {
      // silently fail
    } finally {
      setCreatingCombo(null);
    }
  }, [creatingCombo]);

  const askAI = useCallback(async () => {
    setLoading(true);
    try {
      const salesSummary = data.sales.slice(0, 20).map(s =>
        `${s.items.map(i => `${i.name} x${i.quantity}`).join(", ")} = S/${s.total.toFixed(0)}`
      ).join("; ");

      const topProducts = data.products
        .filter(p => p.active !== false)
        .slice(0, 10)
        .map(p => `${p.name} (stock:${p.stock ?? "?"}, precio:S/${p.price?.toFixed(0) ?? "?"})`)
        .join(", ");

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Analiza mi negocio como consultor de mercado experto. Datos:
- Ventas recientes: ${salesSummary}
- Productos principales: ${topProducts}
- Total clientes: ${data.customers.length}

Dame exactamente 5 recomendaciones concretas y accionables para:
1. Qué combos crear y a qué precio
2. Qué productos subir o bajar de precio
3. Qué estrategia de la semana implementar
4. Cómo recuperar clientes inactivos
5. Qué producto nuevo considerar

Formato: título | explicación breve | impacto estimado en soles.
Responde en español, directo, sin rodeos.`,
          mode: "coach",
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setAiInsights(result.response ?? result.data?.response ?? "Sin respuesta de IA");
      } else {
        setAiInsights("No se pudo consultar la IA. Verifica que tengas una API key configurada.");
      }
    } catch {
      setAiInsights("Error al conectar con la IA.");
    } finally {
      setLoading(false);
    }
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Investigación de Mercado IA</h2>
            <p className="text-xs text-gray-500">Análisis automático de tu negocio con sugerencias accionables</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshInsights}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="Refrescar análisis"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={sendAlerts}
            disabled={sendingAlerts || alertsSent}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors border",
              alertsSent
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                : "border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            )}
            title="Revisar stock, márgenes y clientes y crear alertas"
          >
            {alertsSent ? <><Check className="w-3.5 h-3.5" /> Alertas enviadas</> : sendingAlerts ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</> : "Generar alertas"}
          </button>
          {aiAvailable && (
            <button
              onClick={askAI}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {loading ? "Analizando..." : "Consultar IA"}
            </button>
          )}
        </div>
      </div>

      {/* AI availability badge */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border",
        aiAvailable
          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400"
      )}>
        <span className={cn("h-2 w-2 rounded-full", aiAvailable ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
        {aiAvailable
          ? "IA conectada — análisis con datos reales + inteligencia artificial"
          : "Sin API de IA — mostrando análisis basado en datos locales"}
      </div>

      {/* AI insights (when available) */}
      {aiInsights && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-primary">Recomendaciones de la IA</h3>
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
            {aiInsights}
          </div>
        </div>
      )}

      {/* Local insights grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map(insight => {
          const config = CATEGORY_CONFIG[insight.category] ?? CATEGORY_CONFIG.strategy;
          const Icon = config.icon;
          return (
            <div
              key={insight.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className={cn("shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{insight.title}</h4>
                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", URGENCY_BADGE[insight.urgency])}>
                      {insight.urgency === "high" ? "Urgente" : insight.urgency === "medium" ? "Pronto" : "Idea"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{insight.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Star className="w-3 h-3 text-amber-500" />
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{insight.impact}</span>
                  </div>
                  {insight.action && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                      Acción: {insight.action}
                    </div>
                  )}
                  {insight.category === "combo" && insight.comboProducts && (
                    <button
                      onClick={() => createCombo(insight)}
                      disabled={creatingCombo === insight.id || comboCreated.has(insight.id)}
                      className={cn(
                        "mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                        comboCreated.has(insight.id)
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                          : "bg-primary text-white hover:bg-primary/90  hover:shadow-sm"
                      )}
                    >
                      {comboCreated.has(insight.id) ? (
                        <><Check className="w-3.5 h-3.5" /> Combo creado</>
                      ) : creatingCombo === insight.id ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creando...</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5" /> Crear este combo</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {insights.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No hay suficientes datos para generar insights</p>
          <p className="text-xs mt-1">Registra más ventas y productos para ver recomendaciones</p>
        </div>
      )}
    </div>
  );
}
