"use client";

import { useState, useEffect, startTransition, useCallback } from "react";
import { Package, Truck, CheckCircle2, Clock, X, ChevronDown, ChevronUp, AlertCircle, Star, Printer, Sparkles } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

type TrackedOrder = {
  id: string;
  status: "confirmado" | "preparando" | "en_camino" | "entregado";
  createdAt: string;
  customerName?: string;
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
    const raw = localStorage.getItem("buleje-active-order");
    if (!raw) return null;
    const order = JSON.parse(raw) as TrackedOrder;
    // Auto-expire after 2 hours
    const age = Date.now() - new Date(order.createdAt).getTime();
    if (age > 7_200_000) {
      localStorage.removeItem("buleje-active-order");
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
  const [showAsModal, setShowAsModal] = useState(false);
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
          customerName: detail.customerName,
        };
        localStorage.setItem("buleje-active-order", JSON.stringify(newOrder));
        startTransition(() => { setOrder(newOrder); setDismissed(false); setShowAsModal(true); });
      }
    };
    window.addEventListener("buleje:orderCreated", handleNewOrder);

    // Poll for progress updates
    const poll = setInterval(() => {
      const current = getStoredOrder();
      if (current) {
        const simStatus = simulateProgress(current);
        if (simStatus !== current.status) {
          current.status = simStatus;
          localStorage.setItem("buleje-active-order", JSON.stringify(current));
        }
        startTransition(() => setOrder({ ...current }));
      }
    }, 30_000);

    return () => {
      window.removeEventListener("buleje:orderCreated", handleNewOrder);
      clearInterval(poll);
    };
  }, []);

  /* AA3: NPS survey after delivery */
  const [npsRating, setNpsRating] = useState(0);
  const [npsSent, setNpsSent] = useState(false);
  const [npsHover, setNpsHover] = useState(0);
  const [npsComment, setNpsComment] = useState("");
  const [npsStep, setNpsStep] = useState<"rate" | "comment">("rate");

  const submitNps = useCallback((rating: number, comment?: string) => {
    setNpsRating(rating);
    setNpsSent(true);
    try { localStorage.setItem(`buleje-nps-${order?.id}`, String(rating)); } catch { /* silent */ }
    // Persist to backend
    fetch("/api/surveys", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        orderId: order?.id,
        phone: order?.customerName, // best approximation from tracked data
        rating,
        comment: comment ?? "",
      }),
    }).catch(() => { /* silent – localStorage is fallback */ });
  }, [order]);

  /* AC2: Downloadable receipt */
  const printReceipt = useCallback(() => {
    if (!order) return;
    const now = new Date().toLocaleString("es-PE");
    const html = `<html><head><title>Recibo</title><style>body{font-family:monospace;width:280px;margin:0 auto;padding:16px;color:#1a1a1a}h3{text-align:center;margin:0 0 4px}p{margin:2px 0;font-size:11px}.line{border-top:1px dashed #999;margin:8px 0}.total{font-size:14px;font-weight:bold;text-align:right}@media print{body{padding:8px}}</style></head><body><h3>🛒 Buleje</h3><p style="text-align:center;color:#666">Recibo de pedido</p><div class="line"></div><p><b>Pedido:</b> #${order.id.slice(-6)}</p><p><b>Fecha:</b> ${now}</p>${order.customerName ? `<p><b>Cliente:</b> ${order.customerName}</p>` : ""}<div class="line"></div><p class="total">¡Gracias por tu compra!</p></body></html>`;
    const w = window.open("", "_blank", "width=320,height=400");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }, [order]);

  if (!order || dismissed) return null;

  // Show NPS survey when delivered
  if (order.status === "entregado") {
    const alreadyRated = (() => { try { return !!localStorage.getItem(`buleje-nps-${order.id}`); } catch { return false; } })();
    if (alreadyRated && !npsSent) return null;
    if (npsSent) {
      // Brief thank-you then auto-hide
      return (
        <div className="fixed top-20 right-4 z-40 w-72 bg-card border border-border rounded-2xl shadow-2xl p-4 text-center animate-[fadeDown_0.3s_ease-out]">
          <p className="text-sm font-bold text-foreground">¡Gracias por tu calificación! ⭐</p>
          <p className="text-xs text-muted mt-1">{npsRating >= 4 ? "¡Nos alegra que te gustó!" : "Trabajaremos en mejorar."}</p>
          <button onClick={() => setDismissed(true)} className="mt-2 text-xs text-primary font-semibold hover:underline">Cerrar</button>
        </div>
      );
    }
    return (
      <div className="fixed top-20 right-4 z-40 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-[fadeDown_0.3s_ease-out]">
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/10 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[var(--data-success-500)]" />
            <span className="text-xs font-bold text-foreground">¡Pedido entregado!</span>
          </div>
          <button onClick={() => setDismissed(true)} className="p-1 rounded-lg hover:bg-black/5 transition-colors">
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>
        <div className="px-4 py-4 text-center space-y-3">
          {npsStep === "rate" ? (
            <>
              <p className="text-sm font-semibold text-foreground">¿Cómo fue tu experiencia?</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onMouseEnter={() => setNpsHover(s)} onMouseLeave={() => setNpsHover(0)} onClick={() => { setNpsRating(s); setNpsStep("comment"); }} className="p-1 transition-transform hover:scale-125">
                    <Star className={`w-7 h-7 ${s <= (npsHover || npsRating) ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"}`} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-4 h-4 ${s <= npsRating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                ))}
              </div>
              <textarea
                value={npsComment}
                onChange={e => setNpsComment(e.target.value)}
                placeholder="¿Algún comentario? (opcional)"
                maxLength={500}
                rows={2}
                className="w-full text-xs rounded-lg border border-border bg-background p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2 justify-center">
                <button onClick={() => submitNps(npsRating, npsComment)} className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                  Enviar
                </button>
                <button onClick={() => submitNps(npsRating)} className="px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors">
                  Omitir
                </button>
              </div>
            </>
          )}
          <button onClick={printReceipt} className="flex items-center gap-1.5 mx-auto text-[length:var(--ts-2xs)] text-muted hover:text-primary transition-colors">
            <Printer className="h-3 w-3" /> Descargar recibo
          </button>
        </div>
      </div>
    );
  }

  const currentIdx = STATUS_INDEX[order.status] ?? 0;

  // Reusable progress content
  const progressContent = (
    <div className="space-y-0">
      {STEPS.slice(0, 3).map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const StepIcon = step.icon;
        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                done ? "bg-primary text-white" : "bg-gray-200 dark:bg-white/10 text-muted"
              } ${active ? "ring-2 ring-primary/30" : ""}`}>
                <StepIcon className="w-3.5 h-3.5" />
              </div>
              {i < 2 && (
                <div className={`w-0.5 h-6 ${done ? "bg-primary" : "bg-gray-200 dark:bg-white/10"}`} />
              )}
            </div>
            <div className="pt-1">
              <p className={`text-sm font-semibold ${done ? "text-foreground" : "text-muted"}`}>{step.label}</p>
              {active && (
                <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> En progreso...
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Show as centered modal when order just created
  if (showAsModal) {
    return (
      <div className="fixed inset-0 z-6002 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAsModal(false)} />
        <div className="relative bg-white dark:bg-card rounded-3xl shadow-2xl border border-gray-100 dark:border-card-border w-full max-w-sm overflow-hidden animate-[scaleIn_0.25s_ease-out]">
          {/* Modal header */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-card-border bg-linear-to-b from-primary/5 to-transparent">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="relative">
                <AlertCircle className="w-8 h-8 text-[var(--data-warning-500)] animate-pulse" />
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)] animate-ping" />
              </div>
            </div>
            <h3 className="text-xl font-extrabold text-foreground">
              {order.customerName ? `¡Gracias, ${order.customerName}!` : "¡Pedido recibido!"}
            </h3>
            {order.customerName && <p className="text-xs text-primary font-semibold mt-0.5 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />Tu pedido está en camino</p>}
            <p className="text-sm text-muted mt-1">
              Pedido <span className="font-bold text-primary">#{order.id.slice(-6)}</span> — Confirmado
            </p>
            <button
              onClick={() => setShowAsModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>

          {/* Progress steps */}
          <div className="px-6 py-5 space-y-4">
            {progressContent}
            {/* ETA */}
            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl px-4 py-3 border border-amber-100 dark:border-[var(--data-warning-500)]/30">
              <p className="text-sm text-[var(--data-warning-700)] dark:text-amber-400 font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                Tiempo estimado: {currentIdx < 2 ? "30-45 min" : "10-15 min"}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={() => { setShowAsModal(false); setDismissed(true); }}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={() => setShowAsModal(false)}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/25"
            >
              Seguir comprando
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Floating widget (after modal dismissed)
  return (
    <div className="fixed top-20 right-4 z-40 w-72 sm:w-80 bg-card border border-border rounded-2xl shadow-2xl shadow-black/8 overflow-hidden animate-[fadeDown_0.3s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <AlertCircle className="w-5 h-5 text-[var(--data-warning-500)] animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--data-warning-500)] animate-ping" />
          </div>
          <span className="text-xs font-bold text-foreground">Pedido #{order.id.slice(-6)}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }} 
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {expanded && (
        <div className="px-4 py-4 space-y-3">
          <div className="space-y-0">
            {STEPS.slice(0, 3).map((step, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              const StepIcon = step.icon;
              return (
                <div key={step.key} className="flex items-start gap-3">
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
                  <div className="pt-0.5">
                    <p className={`text-xs font-semibold ${done ? "text-foreground" : "text-muted"}`}>{step.label}</p>
                    {active && (
                      <p className="text-[length:var(--ts-2xs)] text-primary flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" /> En progreso...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-2">
            <p className="text-xs text-[var(--data-warning-700)] dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Tiempo estimado: {currentIdx < 2 ? "30-45 min" : "10-15 min"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
