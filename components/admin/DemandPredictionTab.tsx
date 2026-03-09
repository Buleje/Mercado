"use client";

import { useState } from "react";
import { Brain, Loader2, TrendingUp, ShoppingCart, Calendar } from "lucide-react";

type Prediction = { prediction: { productId: number; productName: string; estimatedDemand: number; confidence: string }[]; peakDays: string[]; purchaseSuggestions: string[]; summary: string };

export default function DemandPredictionTab() {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("7");
  const [error, setError] = useState("");

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
