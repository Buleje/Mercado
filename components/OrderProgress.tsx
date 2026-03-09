"use client";

import { useState, useEffect, startTransition } from "react";
import { Package, Truck, CheckCircle2, Clock, X, ChevronDown, ChevronUp } from "lucide-react";

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

export default function OrderProgress() {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
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
        startTransition(() => { setOrder(newOrder); setDismissed(false); });
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
  }, []);

  if (!order || dismissed || order.status === "entregado") return null;

  const currentIdx = STATUS_INDEX[order.status] ?? 0;

  return (
    <div className="fixed top-20 right-4 z-40 w-72 sm:w-80 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Pedido #{order.id.slice(-6)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setExpanded(!expanded)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {expanded && (
        <div className="px-4 py-4 space-y-3">
          {/* Steps */}
          <div className="space-y-0">
            {STEPS.slice(0, 3).map((step, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              const StepIcon = step.icon;

              return (
                <div key={step.key} className="flex items-start gap-3">
                  {/* Dot + line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      done ? "bg-primary text-white" : "bg-gray-200 dark:bg-white/10 text-muted"
                    } ${active ? "ring-2 ring-primary/30" : ""}`}>
                      <StepIcon className="w-3 h-3" />
                    </div>
                    {i < 2 && (
                      <div className={`w-0.5 h-5 ${done ? "bg-primary" : "bg-gray-200 dark:bg-white/10"}`} />
                    )}
                  </div>
                  {/* Label */}
                  <div className="pt-0.5">
                    <p className={`text-xs font-semibold ${done ? "text-foreground" : "text-muted"}`}>
                      {step.label}
                    </p>
                    {active && (
                      <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" /> En progreso...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ETA */}
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Tiempo estimado: {currentIdx < 2 ? "30-45 min" : "10-15 min"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
