"use client";

import { useState, useEffect, startTransition } from "react";
import { X, Package, Truck, CheckCircle2, Clock } from "lucide-react";

type TrackedOrder = {
  id: string;
  status: "confirmado" | "preparando" | "en_camino" | "entregado";
  createdAt: string;
};

const STEPS = [
  { key: "confirmado", label: "Confirmado", icon: CheckCircle2 },
  { key: "preparando", label: "Preparando", icon: Package },
  { key: "en_camino", label: "En camino", icon: Truck },
  { key: "entregado", label: "Entregado", icon: CheckCircle2 },
] as const;

const STATUS_INDEX: Record<string, number> = { confirmado: 0, preparando: 1, en_camino: 2, entregado: 3 };

function getStoredOrder(): TrackedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bsm-active-order");
    if (!raw) return null;
    const order = JSON.parse(raw) as TrackedOrder;
    // Auto-expire after 2 hours
    const age = Date.now() - new Date(order.createdAt).getTime();
    if (age > 7_200_000) {
      localStorage.removeItem("bsm-active-order");
      return null;
    }
    return order;
  } catch {
    return null;
  }
}

/* Simulate progress: advance status every ~15 min from creation */
function simulateProgress(order: TrackedOrder): TrackedOrder["status"] {
  const age = Date.now() - new Date(order.createdAt).getTime();
  const mins = age / 60_000;
  if (mins > 45) return "entregado";
  if (mins > 25) return "en_camino";
  if (mins > 10) return "preparando";
  return "confirmado";
}

interface OrderStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderStatusModal({ isOpen, onClose }: OrderStatusModalProps) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const stored = getStoredOrder();
    if (stored) startTransition(() => setOrder(stored));

    // Listen for new orders
    const handleNewOrder = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        const newOrder: TrackedOrder = {
          id: detail.orderId,
          status: "confirmado",
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem("bsm-active-order", JSON.stringify(newOrder));
        startTransition(() => setOrder(newOrder));
      }
    };
    window.addEventListener("bsm:orderCreated", handleNewOrder);

    // Poll for progress updates
    const poll = setInterval(() => {
      const current = getStoredOrder();
      if (current) {
        const simStatus = simulateProgress(current);
        if (simStatus !== current.status) {
          current.status = simStatus;
          localStorage.setItem("bsm-active-order", JSON.stringify(current));
        }
        startTransition(() => setOrder({ ...current }));
      }
    }, 30_000);

    return () => {
      window.removeEventListener("bsm:orderCreated", handleNewOrder);
      clearInterval(poll);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentIdx = order ? STATUS_INDEX[order.status] ?? 0 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-[scaleIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Estado del Pedido</h2>
              {order && (
                <p className="text-xs text-muted">Pedido #{order.id.slice(-6)}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          {order && order.status !== "entregado" ? (
            <div className="space-y-6">
              {/* Steps */}
              <div className="space-y-0">
                {STEPS.slice(0, 3).map((step, i) => {
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  const StepIcon = step.icon;

                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      {/* Dot + line */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          done ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-gray-200 dark:bg-white/10 text-muted"
                        } ${active ? "ring-4 ring-primary/30 scale-110" : ""}`}>
                          <StepIcon className="w-5 h-5" />
                        </div>
                        {i < 2 && (
                          <div className={`w-1 h-12 transition-all ${done ? "bg-primary" : "bg-gray-200 dark:bg-white/10"}`} />
                        )}
                      </div>
                      {/* Label */}
                      <div className="pt-2 flex-1">
                        <p className={`text-base font-bold ${done ? "text-foreground" : "text-muted"}`}>
                          {step.label}
                        </p>
                        {active && (
                          <p className="text-sm text-primary flex items-center gap-1.5 mt-1">
                            <Clock className="w-4 h-4 animate-pulse" /> En progreso...
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ETA */}
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl px-4 py-3 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Tiempo estimado: {currentIdx < 2 ? "30-45 minutos" : "10-15 minutos"}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-bold text-foreground">No hay pedidos activos</p>
              <p className="text-sm text-muted mt-2">Realiza un pedido para ver el estado aquí</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
