"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  Clock,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type StockAlert = {
  productId: number;
  productName: string;
  currentStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
  reorderQuantity: number;
  urgency: "critico" | "urgente";
};

type AlertsResponse = {
  alerts: StockAlert[];
  total: number;
  criticos: number;
  urgentes: number;
};

// ── Clave de sesión para el estado de dismiss ──────────────────────────────────

const DISMISSED_KEY = "stock-alerts-dismissed";

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // sessionStorage no disponible (SSR / iframe sandbox) — ignorar silenciosamente
  }
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function StockAlertsBanner() {
  const router = useRouter();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissedState] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stock-alerts", { cache: "no-store" });
      if (!res.ok) return;
      const json: AlertsResponse = await res.json();
      setData(json);
    } catch {
      // Fallo silencioso — el banner no debe romper el layout admin
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Verificar dismiss antes de hacer la petición
    if (isDismissed()) {
      setDismissedState(true);
      setLoading(false);
      return;
    }
    fetchAlerts();
  }, [fetchAlerts]);

  const handleDismiss = () => {
    setDismissed();
    setDismissedState(true);
  };

  const handleProductClick = (productId: number) => {
    router.push(`/admin/inventario?producto=${productId}`);
  };

  // No renderizar: cargando, sin datos, sin alertas, o cerrado
  if (loading || dismissed || !data || data.total === 0) return null;

  const hasCriticos = data.criticos > 0;

  return (
    <div
      className={cn(
        "w-full rounded-xl border shadow-sm overflow-hidden",
        hasCriticos
          ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
          : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Cabecera del banner */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={cn(
              "h-5 w-5 shrink-0",
              hasCriticos
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-sm font-semibold",
              hasCriticos
                ? "text-red-800 dark:text-red-200"
                : "text-amber-800 dark:text-amber-200",
            )}
          >
            {data.total === 1
              ? "1 producto necesita reposición"
              : `${data.total} productos necesitan reposición`}
            {data.criticos > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                {data.criticos} {data.criticos === 1 ? "crítico" : "críticos"}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              hasCriticos
                ? "hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300",
            )}
            aria-expanded={expanded}
            aria-label={expanded ? "Colapsar lista" : "Ver lista completa"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            onClick={handleDismiss}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              hasCriticos
                ? "hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300"
                : "hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300",
            )}
            aria-label="Cerrar alerta de stock"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Lista expandible */}
      {expanded && (
        <div className="border-t border-inherit px-4 pb-3 pt-2">
          <ul className="space-y-2" role="list">
            {data.alerts.map((alert) => {
              const isCritico = alert.urgency === "critico";
              return (
                <li key={alert.productId}>
                  <button
                    onClick={() => handleProductClick(alert.productId)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left transition-colors",
                      isCritico
                        ? "hover:bg-red-100 dark:hover:bg-red-900/40"
                        : "hover:bg-amber-100 dark:hover:bg-amber-900/40",
                    )}
                    aria-label={`Ver producto ${alert.productName} en inventario`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Nombre e ícono */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Package
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isCritico
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            isCritico
                              ? "text-red-900 dark:text-red-100"
                              : "text-amber-900 dark:text-amber-100",
                          )}
                        >
                          {alert.productName}
                        </span>
                      </div>

                      {/* Badge urgencia */}
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                          isCritico
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white",
                        )}
                      >
                        {isCritico ? "Crítico" : "Urgente"}
                      </span>
                    </div>

                    {/* Métricas en fila */}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {/* Stock actual */}
                      <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <Package className="h-3 w-3" aria-hidden="true" />
                        Stock:{" "}
                        <strong className="text-gray-800 dark:text-gray-200">
                          {alert.currentStock}
                        </strong>
                      </span>

                      {/* Días para agotarse */}
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium",
                          isCritico
                            ? "text-red-700 dark:text-red-300"
                            : "text-amber-700 dark:text-amber-300",
                        )}
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {alert.daysUntilStockout === 0
                          ? "Sin stock"
                          : `${alert.daysUntilStockout} día${alert.daysUntilStockout !== 1 ? "s" : ""} restante${alert.daysUntilStockout !== 1 ? "s" : ""}`}
                      </span>

                      {/* Cantidad sugerida */}
                      <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                        Reponer:{" "}
                        <strong className="text-gray-800 dark:text-gray-200">
                          {alert.reorderQuantity} uds.
                        </strong>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
