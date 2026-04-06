"use client";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Tag, BarChart3, History, Percent, Ticket, FlaskConical } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PriceBenchmarkTab = dynamic(() => import("@/components/admin/PriceBenchmarkTab"), { loading: S });
const PriceHistoryTab = dynamic(() => import("@/components/admin/PriceHistoryTab"), { loading: S });
const PromotionsTab = dynamic(() => import("@/components/admin/PromotionsTab"), { loading: S });
const CouponsTab = dynamic(() => import("@/components/admin/CouponsTab"), { loading: S });
const ABTestsTab = dynamic(() => import("@/components/admin/ABTestsTab"), { loading: S });

const MODULE_ID = "precios-promos";

const TABS = [
  { id: "benchmark", label: "Benchmark", icon: BarChart3 },
  { id: "historial", label: "Historial", icon: History },
  { id: "promociones", label: "Promociones", icon: Percent },
  { id: "cupones", label: "Cupones", icon: Ticket },
  { id: "ab-tests", label: "A/B Tests", icon: FlaskConical },
];

// ── Bulk Price Editor ────────────────────────────────────────────────────────

interface PreviewProduct {
  id: number;
  name: string;
  category: string;
  currentPrice: number;
  newPrice: number;
}

function BulkPriceEditor({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("");
  const [percentage, setPercentage] = useState("");
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const loadCategories = useCallback(async () => {
    if (categoriesLoaded) return;
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const products = await res.json();
      const cats = Array.from(new Set(
        (Array.isArray(products) ? products : [])
          .map((p: { category?: string }) => p.category)
          .filter(Boolean)
      )) as string[];
      setCategories(cats.sort());
      setCategoriesLoaded(true);
    } catch {
      // ignore
    }
  }, [categoriesLoaded]);

  // Load categories on mount
  useState(() => { void loadCategories(); });

  const pct = parseFloat(percentage);
  const validPct = !isNaN(pct) && pct !== 0;

  const handlePreview = async () => {
    if (!validPct) return;
    setLoadingPreview(true);
    setError(null);
    setPreview([]);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Error al cargar productos");
      const products = await res.json();
      const arr = Array.isArray(products) ? products : [];
      const filtered = category
        ? arr.filter((p: { category?: string }) => p.category === category)
        : arr;

      const previewed: PreviewProduct[] = filtered.map((p: { id: number; name: string; category: string; price: number }) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        currentPrice: p.price,
        newPrice: Math.round(p.price * (1 + pct / 100) * 100) / 100,
      }));

      setPreview(previewed);
    } catch {
      setError("No se pudieron cargar los productos");
    }
    setLoadingPreview(false);
  };

  const handleApply = async () => {
    if (preview.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/products/bulk-price", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          percentage: pct,
          category: category || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al aplicar los cambios");
      }
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aplicar");
    }
    setApplying(false);
  };

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900">Edicion Masiva de Precios</h3>
          <p className="text-xs text-gray-500 mt-0.5">Aplica un porcentaje de aumento o descuento a multiples productos</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          aria-label="Cerrar"
        >
          &times;
        </button>
      </div>

      {applied ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-sm font-bold text-emerald-700">Precios actualizados correctamente</p>
          <p className="text-xs text-emerald-600 mt-1">{preview.length} producto{preview.length !== 1 ? "s" : ""} modificado{preview.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => {
              setApplied(false);
              setPreview([]);
              setPercentage("");
              setCategory("");
            }}
            className="mt-3 px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors"
          >
            Nueva edicion
          </button>
        </div>
      ) : (
        <>
          {/* Inputs row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">Categoria</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPreview([]); }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white outline-none focus:border-primary transition-colors"
              >
                <option value="">Todas las categorias</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-bold text-gray-600 mb-1">% de cambio</label>
              <input
                type="number"
                step="0.1"
                value={percentage}
                onChange={(e) => { setPercentage(e.target.value); setPreview([]); }}
                placeholder="Ej: 10 o -5"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white outline-none focus:border-primary transition-colors"
              />
              {validPct && (
                <p className={`text-[11px] mt-1 font-semibold ${pct > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {pct > 0 ? `+${pct}% aumento` : `${pct}% descuento`}
                </p>
              )}
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handlePreview}
                disabled={!validPct || loadingPreview}
                className="px-4 py-2 rounded-xl text-sm font-bold text-primary bg-white border border-primary/30 hover:bg-primary/5 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loadingPreview ? "Cargando..." : "Vista previa"}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">
              {error}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-bold text-gray-500">Producto</th>
                        <th className="text-right px-3 py-2 text-xs font-bold text-gray-500">Precio actual</th>
                        <th className="text-right px-3 py-2 text-xs font-bold text-gray-500">Precio nuevo</th>
                        <th className="text-right px-3 py-2 text-xs font-bold text-gray-500">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.map(p => {
                        const diff = p.newPrice - p.currentPrice;
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <span className="font-semibold text-gray-900">{p.name}</span>
                              <span className="ml-2 text-[11px] text-gray-400">{p.category}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-600">{fmt(p.currentPrice)}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(p.newPrice)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${diff > 0 ? "text-red-500" : "text-emerald-600"}`}>
                              {diff > 0 ? "+" : ""}{fmt(diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 border-t border-gray-200">
                  {preview.length} producto{preview.length !== 1 ? "s" : ""} afectado{preview.length !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                onClick={handleApply}
                disabled={applying}
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-50 text-sm font-bold text-white transition-colors"
              >
                {applying ? "Aplicando cambios..." : `Aplicar a ${preview.length} producto${preview.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Module ─────────────────────────────────────────────────────────────

export default function PreciosPromosModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Precios & Promociones"
        description="Benchmark, historial de precios, promociones, cupones y A/B tests"
        icon={Tag}
      >
        <button
          onClick={() => setShowBulkEdit(!showBulkEdit)}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
            showBulkEdit
              ? "text-white bg-primary"
              : "text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20"
          }`}
        >
          Edicion Masiva
        </button>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {showBulkEdit && <BulkPriceEditor onClose={() => setShowBulkEdit(false)} />}

      {sub === "benchmark" && <PriceBenchmarkTab />}
      {sub === "historial" && <PriceHistoryTab />}
      {sub === "promociones" && <PromotionsTab />}
      {sub === "cupones" && <CouponsTab />}
      {sub === "ab-tests" && <ABTestsTab />}
    </div>
  );
}
