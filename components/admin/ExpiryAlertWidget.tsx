 
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, Tag, RotateCcw, Package } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchItem {
  id: string;
  productName: string;
  batchCode: string;
  expiryDate: string;
  quantity: number;
  unit?: string;
}

type ExpiryLevel = "critical" | "warning" | "soon";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getLevel(days: number): ExpiryLevel | null {
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  if (days <= 15) return "soon";
  return null;
}

const LEVEL_STYLES: Record<ExpiryLevel, { badge: string; row: string; label: string }> = {
  critical: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    row: "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-800",
    label: "Vence pronto",
  },
  warning: {
    badge: "bg-[#f4a261]/10 text-[#f4a261]",
    row: "bg-[#f4a261]/5 border-[#f4a261]/20",
    label: "Esta semana",
  },
  soon: {
    badge: "bg-[#2d6a4f]/10 text-[#2d6a4f] dark:text-[#52b788]",
    row: "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800",
    label: "Proximas 2 semanas",
  },
};

// ── Mock ──────────────────────────────────────────────────────────────────────

function getMockData(): BatchItem[] {
  const today = new Date();
  const d = (n: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().split("T")[0];
  };
  return [
    { id: "1", productName: "Leche Gloria 400g", batchCode: "LT-2024-01", expiryDate: d(2), quantity: 24, unit: "latas" },
    { id: "2", productName: "Pan de molde Bimbo", batchCode: "PM-0045", expiryDate: d(1), quantity: 6, unit: "bolsas" },
    { id: "3", productName: "Yogurt Laive Fresa", batchCode: "YG-221", expiryDate: d(5), quantity: 12, unit: "unidades" },
    { id: "4", productName: "Queso Fresco Bonle", batchCode: "QF-889", expiryDate: d(4), quantity: 3, unit: "kg" },
    { id: "5", productName: "Mantequilla Gloria", batchCode: "MG-556", expiryDate: d(10), quantity: 8, unit: "unidades" },
    { id: "6", productName: "Crema de leche", batchCode: "CL-003", expiryDate: d(13), quantity: 5, unit: "latas" },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpiryAlertWidget() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Record<string, "sale" | "return" | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/batches/expiring", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setItems(json.batches ?? json ?? []);
      } else {
        throw new Error("No data");
      }
    } catch {
      setItems(getMockData());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tagged = useMemo(() => {
    return items
      .map((item) => {
        const days = daysUntil(item.expiryDate);
        const level = getLevel(days);
        return { ...item, days, level };
      })
      .filter((i) => i.level !== null)
      .sort((a, b) => a.days - b.days);
  }, [items]);

  const counts = useMemo(() => ({
    critical: tagged.filter((i) => i.level === "critical").length,
    warning: tagged.filter((i) => i.level === "warning").length,
    soon: tagged.filter((i) => i.level === "soon").length,
  }), [tagged]);

  const setAction = useCallback((id: string, action: "sale" | "return") => {
    setActions((p) => ({ ...p, [id]: p[id] === action ? null : action }));
  }, []);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30">
                <Package className="w-5 h-5 text-red-500" />
              </div>
              {counts.critical > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {counts.critical}
                </span>
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">
                Alertas de vencimiento
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {tagged.length} lote{tagged.length !== 1 ? "s" : ""} proximos a vencer
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Actualizar"
          >
            <RefreshCw
              className={cn("w-5 h-5 text-gray-500", loading && "animate-spin")}
            />
          </button>
        </div>

        {/* Badges */}
        {!loading && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {counts.critical > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold">
                <AlertTriangle className="w-3 h-3" />
                {counts.critical} critico{counts.critical !== 1 ? "s" : ""}
              </span>
            )}
            {counts.warning > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-[#f4a261]/10 text-[#f4a261] text-xs font-bold">
                {counts.warning} esta semana
              </span>
            )}
            {counts.soon > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-[#2d6a4f]/10 text-[#2d6a4f] dark:text-[#52b788] text-xs font-bold">
                {counts.soon} en 2 semanas
              </span>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 flex gap-4 animate-pulse">
              <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded" />
              <div className="w-16 h-5 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ))
        ) : tagged.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay lotes proximos a vencer en los proximos 15 dias.
            </p>
          </div>
        ) : (
          tagged.map((item) => {
            const styles = LEVEL_STYLES[item.level as ExpiryLevel];
            const action = actions[item.id];
            return (
              <div
                key={item.id}
                className={cn(
                  "px-5 py-4 border-l-4",
                  item.level === "critical"
                    ? "border-l-red-500"
                    : item.level === "warning"
                      ? "border-l-[#f4a261]"
                      : "border-l-[#2d6a4f]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Lote: {item.batchCode} — {item.quantity} {item.unit ?? "u"} —{" "}
                      Vence: {new Date(item.expiryDate + "T00:00:00").toLocaleDateString("es-PE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap",
                        styles.badge
                      )}
                    >
                      {item.days <= 0
                        ? "Vencido"
                        : item.days === 1
                          ? "Manana"
                          : `${item.days} dias`}
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setAction(item.id, "sale")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                      action === "sale"
                        ? "bg-[#f4a261] text-white border-[#f4a261]"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#f4a261] hover:text-[#f4a261]"
                    )}
                  >
                    <Tag className="w-3 h-3" />
                    Poner en oferta
                  </button>
                  <button
                    onClick={() => setAction(item.id, "return")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                      action === "return"
                        ? "bg-gray-700 text-white border-gray-700 dark:bg-gray-300 dark:text-gray-900 dark:border-gray-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Devolver proveedor
                  </button>
                </div>
                {action && (
                  <p className="mt-2 text-xs text-[#2d6a4f] dark:text-[#52b788] font-medium">
                    {action === "sale"
                      ? "Marcado para oferta — recuerda actualizar el precio en el sistema"
                      : "Marcado para devolucion — contacta al proveedor"}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
