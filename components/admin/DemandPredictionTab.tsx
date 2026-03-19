"use client";

import { useState, useEffect } from "react";
import { Brain, Loader2, TrendingUp, ShoppingCart, Calendar, AlertTriangle, Package, ClipboardList } from "lucide-react";

type Prediction = { prediction: { productId: number; productName: string; estimatedDemand: number; confidence: string }[]; peakDays: string[]; purchaseSuggestions: string[]; summary: string };

type Product = { id: number; name: string; stock: number; costPrice?: number; price: number; unit: string };
type Sale = { items: { productId: number; quantity: number }[]; createdAt: string };
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
          console.error("Error fetching data");
          setLoadingAlerts(false);
          return;
        }

        const products: Product[] = await productsRes.json();
        const sales: Sale[] = await salesRes.json();

        // Calculate stockout predictions
        const alerts = calculateStockAlerts(products, sales);
        setStockAlerts(alerts);
      } catch (err) {
        console.error("Error calculating stock alerts:", err);
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
        sale.items.forEach(item => {
          salesByProduct[item.productId] = (salesByProduct[item.productId] || 0) + item.quantity;
        });
      }
    });

    // Calculate alerts
    const alerts: StockAlert[] = [];
    
    products.forEach(product => {
      if (product.stock > 0) {
        const totalSales = salesByProduct[product.id] || 0;
        const dailyAvg = totalSales / 30;
        
        if (dailyAvg > 0) {
          const daysUntilStockout = product.stock / dailyAvg;
          alerts.push({ product, dailyAvg, daysUntilStockout });
        }
      }
    });

    // Sort by urgency (fewest days first)
    return alerts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  };

  const generatePurchaseOrder = async (stockAlert: StockAlert) => {
    setGeneratingPO(stockAlert.product.id);
    try {
      const suggestedQty = Math.ceil(stockAlert.dailyAvg * 14); // 2 weeks supply
      const unitCost = stockAlert.product.costPrice || stockAlert.product.price * 0.7;

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      
      window.alert("✅ Orden de compra generada exitosamente");
    } catch (err) {
      window.alert("❌ Error al generar la orden de compra");
      console.error(err);
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
        console.error("Error generating PO for", alert.product.name, err);
      }
    }
    
    alert(`✅ ${successCount} órdenes generadas de ${criticalAlerts.length}`);
    setGeneratingBulk(false);
  };

  const analyze = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/demand-prediction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: Number(period) }) });
      if (!res.ok) throw new Error("Error al analizar");
      setPrediction(await res.json());
    } catch { setError("No se pudo generar la predicción. Verifica la configuración de IA."); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Brain className="h-6 w-6 text-primary" />Predicción de Demanda (IA)</h2>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm">
            <option value="7">Próximos 7 días</option>
            <option value="14">Próximos 14 días</option>
            <option value="30">Próximos 30 días</option>
          </select>
          <button onClick={analyze} disabled={loading} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}Analizar
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-sm text-red-600">{error}</div>}

      {/* Stock Alerts Section */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-lg text-gray-900 dark:text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            Alertas de Stock
          </h3>
          {stockAlerts.filter(a => a.daysUntilStockout < 7).length > 0 && (
            <button
              onClick={generateBulkPurchaseOrders}
              disabled={generatingBulk}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 transition disabled:opacity-50"
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
          <div className="flex items-center justify-center py-8 text-gray-400 dark:text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm">Calculando alertas...</span>
          </div>
        ) : stockAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-muted">
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
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : isWarning
                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                      : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                  }`}
                >
                  {(isUrgent || isWarning) && (
                    <AlertTriangle
                      className={`h-5 w-5 shrink-0 ${
                        isUrgent ? "text-red-600" : "text-amber-600"
                      }`}
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 dark:text-foreground truncate">
                      {alert.product.name}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 dark:text-muted">
                      <span>Stock: <strong>{alert.product.stock}</strong> {alert.product.unit}</span>
                      <span>Promedio diario: <strong>{alert.dailyAvg.toFixed(1)}</strong></span>
                      <span className={`font-extrabold ${
                        isUrgent ? "text-red-600" : isWarning ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        ~{Math.floor(alert.daysUntilStockout)} días restantes
                      </span>
                    </div>
                  </div>

                  {showPOButton && (
                    <button
                      onClick={() => generatePurchaseOrder(alert)}
                      disabled={generatingPO === alert.product.id}
                      className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 transition disabled:opacity-50 shrink-0"
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
      <div className="bg-linear-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 rounded-2xl p-6">
        <h3 className="font-extrabold text-lg text-gray-900 dark:text-foreground flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-primary" />
          Predicción con Inteligencia Artificial
        </h3>
        <p className="text-sm text-gray-600 dark:text-muted mb-4">
          Utiliza IA para analizar patrones de venta y predecir demanda futura
        </p>
      </div>

      {!prediction && !loading && !error && (
        <div className="text-center py-12 text-gray-400 dark:text-muted">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold">Haz clic en &ldquo;Analizar&rdquo; para generar predicciones</p>
          <p className="text-sm mt-1">La IA analizará las ventas recientes para predecir la demanda futura</p>
        </div>
      )}

      {prediction && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
            <p className="text-sm text-gray-700 dark:text-foreground leading-relaxed">{prediction.summary}</p>
          </div>

          {prediction.prediction?.length > 0 && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-primary" />Demanda Estimada</h3>
              <div className="space-y-2">
                {prediction.prediction.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 truncate font-medium">{p.productName}</span>
                    <span className="font-extrabold text-primary">{p.estimatedDemand} uds</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.confidence === "alta" ? "bg-emerald-100 text-emerald-700" : p.confidence === "media" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{p.confidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prediction.peakDays?.length > 0 && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex items-center gap-2 mb-3"><Calendar className="h-4 w-4 text-primary" />Días Pico</h3>
              <div className="flex flex-wrap gap-2">
                {prediction.peakDays.map((d, i) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold">{d}</span>
                ))}
              </div>
            </div>
          )}

          {prediction.purchaseSuggestions?.length > 0 && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex items-center gap-2 mb-3"><ShoppingCart className="h-4 w-4 text-primary" />Sugerencias de Compra</h3>
              <ul className="space-y-1">
                {prediction.purchaseSuggestions.map((s, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-muted flex items-start gap-2">
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

