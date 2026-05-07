"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Brain, Loader2, TrendingUp, ShoppingCart, Calendar, AlertTriangle, Package, ClipboardList } from "@buleje/design-system/icons";
import * as Sentry from "@sentry/nextjs";
import type { Product, Sale } from "@/types/erp";
import { csrfHeaders } from "@/lib/csrf-client";

type Prediction = { prediction: { productId: number; productName: string; estimatedDemand: number; confidence: string }[]; peakDays: string[]; purchaseSuggestions: string[]; summary: string };

type StockAlert = { product: Product; dailyAvg: number; daysUntilStockout: number };

export default function DemandPredictionTab() {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("7");
  const [error, setError] = useState("");
  
  // Stock alert states
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [generatingPO, setGeneratingPO] = useState<number | null>(null);
  const [generatingBulk, setGeneratingBulk] = useState(false);

  // Fetch products and sales data on mount
  useEffect(() => {
    const fetchStockData = async () => {
      try {
        const [productsRes, salesRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/sales?limit=500")
        ]);
        
        if (!productsRes.ok || !salesRes.ok) {
          setError("Error al cargar datos de productos o ventas");
          setLoadingAlerts(false);
          return;
        }

        const products: Product[] = await productsRes.json();
        const sales: Sale[] = await salesRes.json();

        // Calculate stockout predictions
        const alerts = calculateStockAlerts(products, sales);
        setStockAlerts(alerts);
      } catch (err) {
        setError("Error al calcular alertas de stock");
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      }
      setLoadingAlerts(false);
    };

    fetchStockData();
  }, []);

  const calculateStockAlerts = (products: Product[], sales: Sale[]): StockAlert[] => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Calculate daily sales per product
    const salesByProduct: Record<number, number> = {};
    
    sales.forEach(sale => {
      const saleDate = new Date(sale.createdAt);
      if (saleDate >= thirtyDaysAgo) {
        (sale.items ?? []).forEach(item => {
          if (item.productId == null) return;
          const pid = Number(item.productId);
          salesByProduct[pid] = (salesByProduct[pid] || 0) + item.quantity;
        });
      }
    });

    // Calculate alerts
    const alerts: StockAlert[] = [];

    products.forEach(product => {
      const stock = product.stock ?? 0;
      if (stock > 0) {
        const totalSales = salesByProduct[Number(product.id)] || 0;
        const dailyAvg = totalSales / 30;

        if (dailyAvg > 0) {
          const daysUntilStockout = stock / dailyAvg;
          alerts.push({ product, dailyAvg, daysUntilStockout });
        }
      }
    });

    // Sort by urgency (fewest days first)
    return alerts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  };

  const generatePurchaseOrder = async (stockAlert: StockAlert) => {
    setGeneratingPO(Number(stockAlert.product.id));
    try {
      const suggestedQty = Math.ceil(stockAlert.dailyAvg * 14); // 2 weeks supply
      const unitCost = stockAlert.product.costPrice || stockAlert.product.price * 0.7;

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: "",
          items: [{
            productId: stockAlert.product.id,
            name: stockAlert.product.name,
            quantity: suggestedQty,
            unitCost,
            unit: stockAlert.product.unit
          }],
          notes: "OC automática - stock bajo"
        })
      });

      if (!res.ok) throw new Error("Error al generar OC");
      
      window.alert("Orden de compra generada exitosamente");
    } catch (err) {
      window.alert("Error al generar la orden de compra");
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    }
    setGeneratingPO(null);
  };

  const generateBulkPurchaseOrders = async () => {
    setGeneratingBulk(true);
    const criticalAlerts = stockAlerts.filter(a => a.daysUntilStockout < 7);
    
    let successCount = 0;
    for (const alert of criticalAlerts) {
      try {
        await generatePurchaseOrder(alert);
        successCount++;
      } catch (err) {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      }
    }
    
    alert(`${successCount} órdenes generadas de ${criticalAlerts.length}`);
    setGeneratingBulk(false);
  };

  const analyze = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/demand-prediction", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ days: Number(period) }) });
      if (!res.ok) throw new Error("Error al analizar");
      setPrediction(await res.json());
    } catch { setError("No se pudo generar la predicción. Verifica la configuración de IA."); }
    setLoading(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Brain className="h-6 w-6 text-primary" />Predicción de Demanda (IA)</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm">
            <option value="7">Próximos 7 días</option>
            <option value="14">Próximos 14 días</option>
            <option value="30">Próximos 30 días</option>
          </select>
          <button onClick={analyze} disabled={loading} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}Analizar
          </button>
        </div>
      </div>

      {error && <div className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-4 text-sm text-[var(--data-error-500)]">{error}</div>}

      {/* Stock Alerts Section */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="font-extrabold text-lg text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Package className="h-5 w-5 text-[var(--data-warning-500)]" />
            Alertas de Stock
          </CardTitle>
          {stockAlerts.filter(a => a.daysUntilStockout < 7).length > 0 && (
            <button
              onClick={generateBulkPurchaseOrders}
              disabled={generatingBulk}
              className="flex flex-wrap items-center gap-2 bg-[var(--data-warning-500)] text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-[var(--data-warning-500)] transition disabled:opacity-50"
            >
              {generatingBulk ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="h-4 w-4" />
              )}
              Generar todas las OC
            </button>
          )}
        </div>

        {loadingAlerts ? (
          <LoadingState message="Calculando alertas..." />
        ) : stockAlerts.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] dark:text-muted">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">No hay alertas de stock en este momento</p>
            <p className="text-xs mt-1">Todos los productos tienen stock suficiente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stockAlerts.map((alert) => {
              const isUrgent = alert.daysUntilStockout < 3;
              const isWarning = alert.daysUntilStockout >= 3 && alert.daysUntilStockout < 7;
              const showPOButton = alert.daysUntilStockout < 7;
              
              return (
                <div
                  key={alert.product.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isUrgent
                      ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]"
                      : isWarning
                      ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]"
                      : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                  }`}
                >
                  {(isUrgent || isWarning) && (
                    <AlertTriangle
                      className={`h-5 w-5 shrink-0 ${
                        isUrgent ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]"
                      }`}
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground truncate">
                      {alert.product.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-xs text-[var(--text-secondary)] dark:text-muted">
                      <span>Stock: <strong>{alert.product.stock}</strong> {alert.product.unit}</span>
                      <span>Promedio diario: <strong>{Number(alert.dailyAvg).toFixed(1)}</strong></span>
                      <span className={`font-extrabold ${
                        isUrgent ? "text-[var(--data-error-500)]" : isWarning ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]"
                      }`}>
                        ~{Math.floor(alert.daysUntilStockout)} días restantes
                      </span>
                    </div>
                  </div>

                  {showPOButton && (
                    <button
                      onClick={() => generatePurchaseOrder(alert)}
                      disabled={generatingPO === alert.product.id}
                      className="flex flex-wrap items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 transition disabled:opacity-50 shrink-0"
                    >
                      {generatingPO === alert.product.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ClipboardList className="h-3 w-3" />
                      )}
                      Generar OC
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Prediction Section */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
        <CardTitle className="font-extrabold text-lg text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-primary" />
          Predicción con Inteligencia Artificial
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mb-4">
          Utiliza IA para analizar patrones de venta y predecir demanda futura
        </p>
      </div>

      {!prediction && !loading && !error && (
        <div className="text-center py-12 text-[var(--text-tertiary)] dark:text-muted">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold">Haz clic en &ldquo;Analizar&rdquo; para generar predicciones</p>
          <p className="text-sm mt-1">La IA analizará las ventas recientes para predecir la demanda futura</p>
        </div>
      )}

      {prediction && (
        <div className="space-y-3 sm:space-y-6">
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
            <p className="text-sm text-[var(--text-primary)] dark:text-foreground leading-relaxed">{prediction.summary}</p>
          </div>

          {prediction.prediction?.length > 0 && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
              <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-primary" />Demanda Estimada</CardTitle>
              <div className="space-y-2">
                {prediction.prediction.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex-1 truncate font-medium">{p.productName}</span>
                    <span className="font-extrabold text-primary">{p.estimatedDemand} uds</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.confidence === "alta" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : p.confidence === "media" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-gray-100 text-[var(--text-secondary)]"}`}>{p.confidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prediction.peakDays?.length > 0 && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
              <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-3"><Calendar className="h-4 w-4 text-primary" />Días Pico</CardTitle>
              <div className="flex flex-wrap gap-2">
                {prediction.peakDays.map((d, i) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold">{d}</span>
                ))}
              </div>
            </div>
          )}

          {prediction.purchaseSuggestions?.length > 0 && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
              <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-3"><ShoppingCart className="h-4 w-4 text-primary" />Sugerencias de Compra</CardTitle>
              <ul className="space-y-1">
                {prediction.purchaseSuggestions.map((s, i) => (
                  <li key={i} className="text-sm text-[var(--text-secondary)] dark:text-muted flex flex-wrap items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

