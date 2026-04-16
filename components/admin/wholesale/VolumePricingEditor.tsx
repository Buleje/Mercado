"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VolumeTier {
  minQty:   number;
  discount: number;
}

interface VolumePricingEditorProps {
  productId:      number;
  productName:    string;
  wholesalePrice: number | null;
  /** Callback cuando se guardan los tiers exitosamente */
  onSaved?: (tiers: VolumeTier[]) => void;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function calcResultingPrice(basePrice: number | null, discountPct: number): string {
  if (!basePrice || basePrice <= 0) return "—";
  const result = basePrice * (1 - discountPct / 100);
  return `S/ ${result.toFixed(2)}`;
}

function createEmptyTier(): VolumeTier {
  return { minQty: 1, discount: 0 };
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function VolumePricingEditor({
  productId,
  productName,
  wholesalePrice,
  onSaved,
}: VolumePricingEditorProps) {
  const [tiers,   setTiers]   = useState<VolumeTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  // ── Cargar tiers existentes ──────────────────────────────────────────────

  const fetchTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/wholesale/pricing?productId=${productId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "Error al cargar");
      setTiers((json.data?.tiers as VolumeTier[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAddTier() {
    setTiers((prev) => [...prev, createEmptyTier()]);
  }

  function handleRemoveTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChangeTier(index: number, field: keyof VolumeTier, raw: string) {
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    setTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res  = await fetch("/api/wholesale/pricing", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productId, tiers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "Error al guardar");
      const savedTiers = (json.data?.tiers as VolumeTier[]) ?? tiers;
      setTiers(savedTiers);
      setSaved(true);
      onSaved?.(savedTiers);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Precios por volumen
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {productName}
            {wholesalePrice != null && (
              <span className="ml-2 text-[#00B4A6] font-medium">
                Precio base mayorista: S/ {wholesalePrice.toFixed(2)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchTiers}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Recargar tramos"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Aviso si no hay precio base */}
      {wholesalePrice == null && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Este producto no tiene precio mayorista base. El precio resultante no se puede calcular.
          </span>
        </div>
      )}

      {/* Tabla de tramos */}
      {tiers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2.5 text-left">Cantidad mínima</th>
                <th className="px-4 py-2.5 text-left">Descuento %</th>
                <th className="px-4 py-2.5 text-left">Precio resultante</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {tiers.map((tier, i) => (
                <tr key={i} className="bg-white dark:bg-gray-900">
                  {/* Cantidad mínima */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={tier.minQty}
                      onChange={(e) => handleChangeTier(i, "minQty", e.target.value)}
                      className="w-24 px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
                    />
                  </td>
                  {/* Descuento % */}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={tier.discount}
                        onChange={(e) => handleChangeTier(i, "discount", e.target.value)}
                        className="w-20 px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
                      />
                      <span className="text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  {/* Precio resultante (preview) */}
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "font-medium text-sm",
                        tier.discount > 0
                          ? "text-[#00B4A6]"
                          : "text-gray-400",
                      )}
                    >
                      {calcResultingPrice(wholesalePrice, tier.discount)}
                    </span>
                    {tier.discount > 0 && wholesalePrice != null && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        en vez de S/ {wholesalePrice.toFixed(2)}
                      </p>
                    )}
                  </td>
                  {/* Eliminar */}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleRemoveTier(i)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Eliminar tramo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          Sin tramos de precio por volumen. Agrega uno para empezar.
        </p>
      )}

      {/* Preview de ejemplo con el mayor tier */}
      {tiers.length > 0 && wholesalePrice != null && (() => {
        const best = [...tiers].sort((a, b) => b.minQty - a.minQty)[0];
        if (!best || best.discount <= 0) return null;
        const resultingPrice = (wholesalePrice * (1 - best.discount / 100)).toFixed(2);
        return (
          <div className="p-3 rounded-lg bg-[#00B4A6]/10 border border-[#00B4A6]/20 text-xs text-[#00B4A6] dark:text-green-400">
            Si compran {best.minQty}+, pagan{" "}
            <strong>S/ {resultingPrice}</strong>{" "}
            en vez de S/ {wholesalePrice.toFixed(2)}
          </div>
        );
      })()}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleAddTier}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#00B4A6] text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar tramo
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors",
            saved
              ? "bg-green-600"
              : saving
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#00B4A6] hover:bg-[#1e4d38]",
          )}
        >
          {saving ? (
            <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "Guardado" : saving ? "Guardando..." : "Guardar tramos"}
        </button>
      </div>
    </div>
  );
}
