"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, Star, DollarSign, Clock, Package,
  CreditCard, RefreshCw, AlertTriangle, ShoppingCart } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplierEvalAverages {
  punctuality: number; // 1-5
  quality: number;     // 1-5
  price: number;       // 1-5 (5 = precio bajo = bueno)
}

interface Supplier {
  id: string;
  name: string;
  categoria?: string | null;
  condicionPago?: string | null;
  diasCredito?: number | null;
  totalPurchases?: number;
  avgDeliveryDays?: number | null;
  productCount?: number;
  averagePurchasePrice?: number;
  evaluations?: SupplierEvalAverages | null;
}

interface SupplierWithScore extends Supplier {
  score: number;
  scoreCalidad: number;
  scorePrecio: number;
  scoreTiempo: number;
  scoreCondicion: number;
  scoreVariedad: number;
}

// ── Score ─────────────────────────────────────────────────────────────────────

function calcScore(s: Supplier): SupplierWithScore {
  const ev = s.evaluations;
  // Calidad 40%
  const scoreCalidad = ev ? (ev.quality / 5) * 100 : 50;
  // Precio 30% — ev.price 5=bueno
  const scorePrecio = ev ? (ev.price / 5) * 100 : 50;
  // Tiempo de entrega 20% — más rápido es mejor (si >0)
  const delivDays = s.avgDeliveryDays ?? 3;
  const scoreTiempo = delivDays <= 0 ? 80 : Math.max(10, 100 - (delivDays - 1) * 15);
  // Condición de pago 10% — crédito > contado (mayor días = mejor para comprador)
  const dias = s.diasCredito ?? 0;
  const scoreCondicion = Math.min(100, dias * 3 + (s.condicionPago === "credito" ? 30 : 10));
  // Variedad (para radar) — basado en productCount
  const scoreVariedad = Math.min(100, (s.productCount ?? 1) * 5);

  const score =
    scoreCalidad * 0.4 +
    scorePrecio  * 0.3 +
    scoreTiempo  * 0.2 +
    scoreCondicion * 0.1;

  return { ...s, score, scoreCalidad, scorePrecio, scoreTiempo, scoreCondicion, scoreVariedad };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  const colors: Record<string, string> = {
    A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    B: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    D: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-extrabold", colors[grade])}>
      {grade}
    </span>
  );
}

// ── Radar Chart for single supplier ──────────────────────────────────────────

function SupplierRadar({ supplier }: { supplier: SupplierWithScore }) {
  const data = [
    { axis: "Precio",   value: Math.round(supplier.scorePrecio) },
    { axis: "Calidad",  value: Math.round(supplier.scoreCalidad) },
    { axis: "Tiempo",   value: Math.round(supplier.scoreTiempo) },
    { axis: "Variedad", value: Math.round(supplier.scoreVariedad) },
    { axis: "Pago",     value: Math.round(supplier.scoreCondicion) },
  ];
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--card-border, #e5e7eb)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 10, fill: "var(--muted, #9ca3af)" }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: "var(--muted, #9ca3af)" }}
            tickCount={3}
          />
          <Radar dataKey="value" stroke="#00B4A6" fill="#00B4A6" fillOpacity={0.2} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card, #fff)",
              border: "1px solid var(--card-border, #e5e7eb)",
              borderRadius: "0.5rem",
              fontSize: 11,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SupplierComparator() {
  const [suppliers, setSuppliers] = useState<SupplierWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "name" | "precio">("score");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [suppRes, evalRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/supplier-evaluations"),
      ]);

      const suppJson = suppRes.ok ? await suppRes.json() : [];
      const evalJson = evalRes.ok ? await evalRes.json() : [];

      const rawSuppliers: Supplier[] = suppJson.suppliers ?? suppJson.data ?? suppJson ?? [];
      const rawEvals: Array<{ supplierId: string; quality: number; price: number; punctuality: number }> =
        evalJson.evaluations ?? evalJson ?? [];

      // Compute averages per supplier
      const evalMap: Record<string, { quality: number[]; price: number[]; punctuality: number[] }> = {};
      rawEvals.forEach(e => {
        if (!evalMap[e.supplierId]) evalMap[e.supplierId] = { quality: [], price: [], punctuality: [] };
        evalMap[e.supplierId].quality.push(e.quality);
        evalMap[e.supplierId].price.push(e.price);
        evalMap[e.supplierId].punctuality.push(e.punctuality);
      });

      const avg = (arr: number[]) => arr.length === 0 ? 3 : arr.reduce((s, v) => s + v, 0) / arr.length;

      const scored = rawSuppliers.map(s => {
        const ev = evalMap[s.id];
        return calcScore({
          ...s,
          evaluations: ev
            ? { quality: avg(ev.quality), price: avg(ev.price), punctuality: avg(ev.punctuality) }
            : null,
        });
      });

      setSuppliers(scored);
      if (scored.length > 0 && !selectedId) setSelectedId(scored[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = useMemo(() => {
    const filtered = productFilter.trim()
      ? suppliers.filter(s => s.name.toLowerCase().includes(productFilter.toLowerCase()))
      : suppliers;
    return [...filtered].sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "precio") return (a.averagePurchasePrice ?? 0) - (b.averagePurchasePrice ?? 0);
      return 0;
    });
  }, [suppliers, sortBy, productFilter]);

  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === selectedId) ?? null, [suppliers, selectedId]);

  const handleCreateOC = useCallback(async (supplier: SupplierWithScore) => {
    if (!confirm(`¿Crear orden de compra para ${supplier.name}?`)) return;
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: supplier.id, supplierName: supplier.name }),
      });
      if (!res.ok) throw new Error("No se pudo crear la OC");
      const json = await res.json();
      alert(`Orden de compra creada: ${json.id ?? json.orderNumber ?? "OK"}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al crear OC");
    }
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button onClick={fetchData} className="text-xs text-[#00B4A6] hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center shadow-sm shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Comparador de Proveedores</h2>
            <p className="text-xs text-gray-500 dark:text-muted">Score: calidad (40%) + precio (30%) + tiempo (20%) + pago (10%)</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center self-end"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Filter & Sort */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          placeholder="Buscar proveedor o producto..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400 uppercase font-bold">Ordenar:</span>
          {(["score", "name", "precio"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                sortBy === s
                  ? "bg-[#00B4A6] text-white"
                  : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-muted hover:bg-gray-200 dark:hover:bg-white/10",
              )}
            >
              {s === "score" ? "Score" : s === "name" ? "Nombre" : "Precio"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
          {sorted.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-muted">Sin proveedores registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-card-border">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-gray-400">Proveedor</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-gray-400 hidden sm:table-cell">Prods.</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase text-gray-400 hidden md:table-cell">Precio prom.</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-gray-400 hidden sm:table-cell">Tiempo</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase text-gray-400 hidden lg:table-cell">Pago</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-gray-400">Score</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase text-gray-400">OC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {sorted.map((s, idx) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        "cursor-pointer transition-colors",
                        selectedId === s.id
                          ? "bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10"
                          : "hover:bg-gray-50 dark:hover:bg-white/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {idx === 0 && (
                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-white">{s.name}</p>
                            {s.categoria && (
                              <p className="text-[10px] text-gray-400 dark:text-muted">{s.categoria}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{s.productCount ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                          {s.averagePurchasePrice ? fmt(s.averagePurchasePrice) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {s.avgDeliveryDays != null ? `${s.avgDeliveryDays}d` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {s.condicionPago ?? "—"}{s.diasCredito ? ` (${s.diasCredito}d)` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <ScoreBadge score={s.score} />
                          <span className="text-[10px] font-bold text-gray-500 dark:text-muted">{s.score.toFixed(0)}pts</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); handleCreateOC(s); }}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-[#00B4A6] bg-[#00B4A6]/10 hover:bg-[#00B4A6]/20 transition-colors min-h-[32px]"
                          title="Crear orden de compra"
                        >
                          <ShoppingCart className="h-3 w-3" /> OC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Radar detail */}
        {selectedSupplier && (
          <div className="w-full lg:w-64 shrink-0 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{selectedSupplier.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <ScoreBadge score={selectedSupplier.score} />
                <span className="text-xs text-gray-500 dark:text-muted">{selectedSupplier.score.toFixed(1)} puntos</span>
              </div>
            </div>

            <div className="px-3 pt-3">
              <SupplierRadar supplier={selectedSupplier} />
            </div>

            {/* Metrics bars */}
            <div className="px-4 pb-4 space-y-2.5 mt-1">
              {[
                { label: "Calidad", value: selectedSupplier.scoreCalidad, icon: Star, color: "bg-emerald-500" },
                { label: "Precio", value: selectedSupplier.scorePrecio, icon: DollarSign, color: "bg-[#00B4A6]" },
                { label: "Tiempo", value: selectedSupplier.scoreTiempo, icon: Clock, color: "bg-emerald-500" },
                { label: "Variedad", value: selectedSupplier.scoreVariedad, icon: Package, color: "bg-purple-500" },
                { label: "Cond. pago", value: selectedSupplier.scoreCondicion, icon: CreditCard, color: "bg-orange-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1 text-gray-500 dark:text-muted font-medium">
                      <Icon className="h-3 w-3" /> {label}
                    </span>
                    <span className="font-bold text-gray-700 dark:text-gray-300">{value.toFixed(0)}%</span>
                  </div>
                  <ScoreBar value={value} color={color} />
                </div>
              ))}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={() => handleCreateOC(selectedSupplier)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white bg-[#00B4A6] hover:bg-[#009690] transition-colors min-h-[40px]"
              >
                <ShoppingCart className="h-4 w-4" /> Crear Orden de Compra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
