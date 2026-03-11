"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { X, Package, Truck, CheckCircle2, Clock, ShoppingBag } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";

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
  const [isNew, setIsNew] = useState(false);
  // null = normal (open), {x,y} = flying to nav button (close animation)
  const [flyTarget, setFlyTarget] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredOrder();
    if (stored) startTransition(() => setOrder(stored));

    const handleNewOrder = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        const newOrder: TrackedOrder = {
          id: detail.orderId,
          status: "confirmado",
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem("bsm-active-order", JSON.stringify(newOrder));
        startTransition(() => { setOrder(newOrder); setIsNew(true); });
      }
    };
    window.addEventListener("bsm:orderCreated", handleNewOrder);

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

  // Reset flags when modal closes
  useEffect(() => {
    if (!isOpen) {
      startTransition(() => { setIsNew(false); setFlyTarget(null); });
    }
  }, [isOpen]);

  // Fast-poll (5 s) while modal is open for real-time feel
  useEffect(() => {
    if (!isOpen) return;
    const fastPoll = setInterval(() => {
      const current = getStoredOrder();
      if (current) {
        const simStatus = simulateProgress(current);
        if (simStatus !== current.status) {
          current.status = simStatus;
          localStorage.setItem("bsm-active-order", JSON.stringify(current));
        }
        startTransition(() => setOrder({ ...current }));
      }
    }, 5_000);
    return () => clearInterval(fastPoll);
  }, [isOpen]);

  const handleClose = () => {
    const mobileBtn = document.getElementById("order-status-nav-btn-mobile");
    const navBtn = (mobileBtn && mobileBtn.offsetParent) ? mobileBtn : document.getElementById("order-status-nav-btn");
    if (navBtn && cardRef.current) {
      const btnRect = navBtn.getBoundingClientRect();
      const cardRect = cardRef.current.getBoundingClientRect();
      setFlyTarget({
        x: btnRect.left + btnRect.width / 2 - (cardRect.left + cardRect.width / 2),
        y: btnRect.top + btnRect.height / 2 - (cardRect.top + cardRect.height / 2),
      });
      // onClose() will be called in onAnimationComplete
    } else {
      onClose();
    }
  };

  const handleFlyComplete = () => {
    if (!flyTarget) return;
    const mobileBtn = document.getElementById("order-status-nav-btn-mobile");
    const navBtn = (mobileBtn && mobileBtn.offsetParent) ? mobileBtn : document.getElementById("order-status-nav-btn");
    if (navBtn) {
      navBtn.classList.add("animate-[ping_0.3s_ease-out]");
      setTimeout(() => navBtn.classList.remove("animate-[ping_0.3s_ease-out]"), 300);
    }
    setFlyTarget(null);
    onClose();
  };

  if (!isOpen) return null;

  const currentIdx = order ? STATUS_INDEX[order.status] ?? 0 : 0;

  // Declarative animate targets — framer-motion resolves these when features are ready
  const cardAnimate = flyTarget
    ? { x: flyTarget.x, y: flyTarget.y, scale: 0.08, opacity: 0 }
    : { x: 0, y: 0, scale: 1, opacity: 1 };
  const cardTransition = flyTarget
    ? { duration: 0.42, ease: [0.4, 0, 1, 1] as [number, number, number, number] }
    : { type: "spring" as const, damping: 26, stiffness: 300 };

  return (
    <AnimatePresence>
      <m.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        style={{ zIndex: 99999 }}
        onClick={handleClose}
      >
        <m.div
          ref={cardRef}
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={cardAnimate}
          transition={cardTransition}
          onAnimationComplete={handleFlyComplete}
          className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Celebration header — shown right after placing order */}
          {isNew && (
            <div className="px-6 pt-5 pb-4 text-center bg-linear-to-b from-emerald-50 to-transparent dark:from-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/30">
              <m.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 14, stiffness: 260, delay: 0.1 }}
                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-3"
              >
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              </m.div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">¡Pedido enviado!</h2>
              <p className="text-sm text-gray-500 dark:text-muted mt-1">
                Tu pedido <span className="font-bold text-primary">#{order?.id.slice(-6)}</span> fue recibido correctamente
              </p>
            </div>
          )}

          {/* Standard header — shown on manual open */}
          {!isNew && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Estado del Pedido</h2>
                  {order && <p className="text-xs text-muted">Pedido #{order.id.slice(-6)}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Close button — always top-right */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors z-10"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>

          {/* Content */}
          <div className="px-6 py-6">
            {order && order.status !== "entregado" ? (
              <div className="space-y-5">
                {/* Progress steps */}
                <div className="space-y-0">
                  {STEPS.slice(0, 3).map((step, i) => {
                    const done = i <= currentIdx;
                    const active = i === currentIdx;
                    const StepIcon = step.icon;
                    return (
                      <div key={step.key} className="flex items-start gap-4">
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
                        <div className="pt-2 flex-1">
                          <p className={`text-base font-bold ${done ? "text-foreground" : "text-muted"}`}>{step.label}</p>
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
                    Tiempo estimado: {currentIdx < 2 ? "30–45 minutos" : "10–15 minutos"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-surface mb-4">
                  <ShoppingBag className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-lg font-bold text-foreground">No hay pedidos activos</p>
                <p className="text-sm text-muted mt-2">Realiza un pedido para ver el estado aquí</p>
              </div>
            )}
          </div>

          {/* Footer action */}
          <div className="px-6 pb-6">
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}

