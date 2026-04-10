"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { X, Package, Truck, CheckCircle2, Clock, ShoppingBag, MapPin, Phone, User, Receipt, Star, ArrowRight, Hash, CreditCard, Calendar } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const Confetti  = dynamic(() => import("./Confetti"),   { ssr: false });

type OrderItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  qty?: number; // backward-compat: old orders saved as { qty }
  unit: string;
  image: string;
};

type TrackedOrder = {
  id: string;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  createdAt: string;
  items?: OrderItem[];
  total?: number;
  customer?: {
    name?: string;
    phone?: string;
    location?: string;
    reference?: string;
  };
  paymentMethod?: string;
  deliveryLocation?: { lat: number; lon: number };
};

const STATUS_STEPS = [
  { key: "pendiente",  label: "Recibido",   sublabel: "Pedido registrado",  icon: Receipt,       color: "#00B4A6", bg: "bg-primary",      ringColor: "ring-primary/30"    },
  { key: "confirmado", label: "Confirmado", sublabel: "Preparando ítems",  icon: CheckCircle2,  color: "#10b981", bg: "bg-emerald-500", ringColor: "ring-emerald-300" },
  { key: "en_camino",  label: "En camino",  sublabel: "Delivery salió",    icon: Truck,         color: "#f4a261", bg: "bg-secondary",   ringColor: "ring-secondary/30"   },
  { key: "entregado",  label: "Entregado",  sublabel: "¡Listo!",           icon: CheckCircle2,  color: "#22c55e", bg: "bg-green-500",  ringColor: "ring-green-300"   },
] as const;

const STATUS_INDEX: Record<string, number> = { pendiente: 0, confirmado: 1, en_camino: 2, entregado: 3 };

const ETA: Record<string, string> = {
  pendiente: "30–45 min", confirmado: "20–30 min", en_camino: "10–15 min", entregado: "Entregado ✓",
};

const STATUS_MESSAGE: Record<string, string> = {
  pendiente:  "Hemos recibido tu pedido y lo estamos registrando.",
  confirmado: "¡Confirmado! Estamos preparando tus productos.",
  en_camino:  "¡Tu delivery ya está en camino hacia ti!",
  entregado:  "¡Pedido entregado con éxito!",
};

const PAY_LABELS: Record<string, string> = {
  efectivo: "Efectivo", yape: "Yape", plin: "Plin",
  tarjeta: "Tarjeta", transferencia: "Transferencia",
};

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

// Store location (Buleje)
const STORE_LAT = -8.3791;
const STORE_LON = -74.5539;

function getStoredOrder(): TrackedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    // Try full order data first — use pendiente as initial status (real status fetched on first poll)
    const lastOrderRaw = localStorage.getItem("bsm-last-order");
    if (lastOrderRaw) {
      const lastOrder = JSON.parse(lastOrderRaw);
      // If we already have a live status cached in bsm-active-order, prefer it
      const activeRaw = localStorage.getItem("bsm-active-order");
      let cachedStatus: TrackedOrder["status"] = "pendiente";
      if (activeRaw) {
        try {
          const active = JSON.parse(activeRaw) as TrackedOrder;
          if (active.id === lastOrder.id) cachedStatus = active.status;
        } catch {}
      }
      return {
        id: lastOrder.id,
        status: cachedStatus,
        createdAt: lastOrder.createdAt ?? new Date().toISOString(),
        items: lastOrder.items,
        total: lastOrder.total,
      };
    }
    
    // Fallback to minimal tracking data
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

/** Reads customerPhone from bsm-last-order so the public lookup can prove ownership. */
function getStoredPhone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bsm-last-order");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { customerPhone?: string };
    return parsed.customerPhone ?? null;
  } catch {
    return null;
  }
}

async function fetchLiveStatus(orderId: string): Promise<TrackedOrder["status"] | null> {
  try {
    const phone = getStoredPhone();
    const url = phone
      ? `/api/orders/${orderId}/public?phone=${encodeURIComponent(phone)}`
      : `/api/orders/${orderId}/public`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // Order no longer exists on the server (purged, expired, or never persisted) —
      // clear stale tracking data so we stop hammering a dead endpoint.
      if (res.status === 404 && typeof window !== "undefined") {
        try {
          localStorage.removeItem("bsm-active-order");
          localStorage.removeItem("bsm-last-order");
        } catch {}
      }
      return null;
    }
    const data = await res.json() as { status: TrackedOrder["status"] };
    return data.status ?? null;
  } catch {
    return null;
  }
}

interface OrderStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Sound feedback using Web Audio API ───────────────────────────────────────
// Shared AudioContext — created on first user gesture to avoid autoplay policy warning
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_audioCtx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      _audioCtx = new AudioCtx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
    return _audioCtx;
  } catch { return null; }
}

// Prime the AudioContext on first click anywhere so it's ready for status sounds
if (typeof window !== "undefined") {
  const primeAudio = () => { getAudioCtx(); window.removeEventListener("click", primeAudio); };
  window.addEventListener("click", primeAudio, { once: true });
}

function playStatusSound(status: TrackedOrder["status"]) {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const tone = (freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.28) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    };

    // ✅ confirmado — warm ascending triad (C5 → E5 → G5)
    if (status === "confirmado") {
      tone(523, 0,    0.18);
      tone(659, 0.18, 0.18);
      tone(784, 0.36, 0.28);
    }
    // 🚚 en_camino — upbeat two-note motif (A4 → E5)
    else if (status === "en_camino") {
      tone(440, 0,    0.12);
      tone(659, 0.15, 0.22);
    }
    // 🎉 entregado — full fanfare (C5 → E5 → G5 → C6)
    else if (status === "entregado") {
      tone(523,  0,    0.12, "sine", 0.3);
      tone(659,  0.13, 0.12, "sine", 0.3);
      tone(784,  0.26, 0.12, "sine", 0.3);
      tone(1047, 0.39, 0.35, "sine", 0.4);
    }
    // 🔔 pendiente — soft single ping
    else if (status === "pendiente") {
      tone(880, 0, 0.18, "sine", 0.2);
    }

    // keep shared ctx alive for future sounds
  } catch { /* AudioContext blocked or unsupported — silent fallback */ }
}

export default function OrderStatusModal({ isOpen, onClose }: OrderStatusModalProps) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ x: number; y: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatusRef = useRef<TrackedOrder["status"] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Play sound + trigger confetti whenever order status TRANSITIONS (not on initial load).
  // prevStatusRef starts as null — the first time we receive an order we record the status
  // silently so subsequent changes trigger the sound/confetti.
  useEffect(() => {
    if (!order) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = order.status;
    // Skip sound on first load (prev === null); only play on real status transitions
    if (prev !== null && order.status !== prev) {
      playStatusSound(order.status);
      if (order.status === "entregado") {
        startTransition(() => setShowConfetti(true));
        setTimeout(() => startTransition(() => setShowConfetti(false)), 5000);
      }
    }
  }, [order]);

  // Single polling loop: 30s background, 10s when modal is open. No duplicate intervals.
  useEffect(() => {
    const stored = getStoredOrder();
    if (stored) startTransition(() => setOrder(stored));

    const handleNewOrder = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        const lastOrderRaw = localStorage.getItem("bsm-last-order");
        let orderData: TrackedOrder = {
          id: detail.orderId,
          status: "pendiente",  // real status will be fetched on next poll
          createdAt: new Date().toISOString(),
        };
        if (lastOrderRaw) {
          try {
            const parsed = JSON.parse(lastOrderRaw);
            orderData = { ...orderData, items: parsed.items, total: parsed.total, createdAt: parsed.createdAt ?? orderData.createdAt };
          } catch {}
        }
        localStorage.setItem("bsm-active-order", JSON.stringify(orderData));
        startTransition(() => { setOrder(orderData); });
      }
    };
    window.addEventListener("bsm:orderCreated", handleNewOrder);
    return () => window.removeEventListener("bsm:orderCreated", handleNewOrder);
  }, []);

  // Adaptive poll: 10s when open (for visibility), 30s in background
  useEffect(() => {
    const interval = isOpen ? 10_000 : 30_000;
    const poll = setInterval(async () => {
      const current = getStoredOrder();
      if (!current) return;
      if (current.status === "entregado" || current.status === "cancelado") return;
      const liveStatus = await fetchLiveStatus(current.id);
      if (liveStatus && liveStatus !== current.status) {
        current.status = liveStatus;
        localStorage.setItem("bsm-active-order", JSON.stringify(current));
        startTransition(() => setOrder({ ...current }));
      }
    }, interval);
    return () => clearInterval(poll);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) startTransition(() => { setFlyTarget(null); });
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

  const currentIdx = order ? (STATUS_INDEX[order.status] ?? 0) : 0;
  const currentStep = STATUS_STEPS[currentIdx];
  const isTerminal = order?.status === "entregado" || order?.status === "cancelado";
  const subtotal = order?.items?.reduce((s, i) => s + i.price * (i.quantity ?? i.qty ?? 0), 0) ?? 0;
  const cardAnimate = flyTarget
    ? { x: flyTarget.x, y: flyTarget.y, scale: 0.08, opacity: 0 }
    : { x: 0, y: 0, scale: 1, opacity: 1 };
  const cardTransition = flyTarget
    ? { duration: 0.42, ease: [0.4, 0, 1, 1] as [number, number, number, number] }
    : { type: "spring" as const, damping: 26, stiffness: 300 };

  return (
    <AnimatePresence>
      <style dangerouslySetInnerHTML={{ __html: `
        #osm-overlay { cursor: default !important; transform: translateZ(0) !important; }
        #osm-card, #osm-card * { cursor: inherit !important; pointer-events: auto !important; }
        #osm-card button, #osm-card a { cursor: pointer !important; }
      `}} />
      <m.div
        id="osm-overlay"
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
        style={{ zIndex: 2147483646 }}
        onClick={handleClose}
      >
        <m.div
          id="osm-card"
          ref={cardRef}
          initial={{ opacity: 0, y: 48 }}
          animate={cardAnimate}
          transition={cardTransition}
          onAnimationComplete={handleFlyComplete}
          className="relative bg-white dark:bg-[#0f1117] rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg lg:max-w-3xl max-h-[94vh] overflow-hidden flex flex-col"
          style={{ zIndex: 2147483647 }}
          onClick={e => e.stopPropagation()}
        >
          {/* ══ HEADER ══ */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0a3d38 0%, #00B4A6 55%, #00d4c4 100%)" }}
          >
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute -bottom-4 -left-8 w-24 h-24 rounded-full bg-white/5" />
            <div className="relative px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white leading-tight">Estado del Pedido</h2>
                    {order && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Hash className="h-3 w-3 text-white/60" />
                        <span className="text-xs text-white/70 font-mono font-semibold">{order.id.slice(-8).toUpperCase()}</span>
                        {order.createdAt && (
                          <>
                            <span className="text-white/30">·</span>
                            <Calendar className="h-3 w-3 text-white/60" />
                            <span className="text-[10px] text-white/60">
                              {new Date(order.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={handleClose} className="p-2 rounded-2xl bg-white/15 hover:bg-white/25 transition-colors border border-white/20" aria-label="Cerrar">
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
              {order && !isTerminal && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">{currentStep.label}</span>
                  <ArrowRight className="h-3 w-3 text-white/60" />
                  <span className="text-xs text-white/70">{ETA[order.status]}</span>
                </div>
              )}
              {order?.status === "entregado" && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/30 border border-emerald-300/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-xs font-bold text-emerald-200 uppercase tracking-wide">¡Entregado!</span>
                </div>
              )}
            </div>
            {/* Horizontal stepper */}
            {order && !isTerminal && (
              <div className="px-5 pb-5">
                <div className="flex items-center gap-0">
                  {STATUS_STEPS.map((step, i) => {
                    const done = i <= currentIdx;
                    const active = i === currentIdx;
                    const StepIcon = step.icon;
                    return (
                      <div key={step.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 border-2",
                            done ? "bg-white/20 border-white/50" : "bg-white/5 border-white/15",
                            active && "ring-2 ring-white/40 scale-110 shadow-lg"
                          )}>
                            <StepIcon className={cn("w-4 h-4", done ? "text-white" : "text-white/35")} />
                          </div>
                          <span className={cn("text-[9px] font-bold leading-tight text-center whitespace-nowrap", done ? "text-white" : "text-white/35")}>{step.label}</span>
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className={cn("flex-1 h-0.5 mx-1 rounded-full transition-all duration-500", done && i < currentIdx ? "bg-white/60" : "bg-white/15")} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ══ SCROLLABLE BODY ══ */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {order && !isTerminal ? (
              <div className="p-4 lg:p-6">
                {/* ETA card — spans full width */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-linear-to-r from-primary/5 to-teal-50 dark:from-primary/10 dark:to-teal-950/30 border border-primary/20 dark:border-primary/30 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-primary/15 flex items-center justify-center shadow-sm shrink-0">
                    <Clock className="h-5 w-5 text-primary dark:text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-primary dark:text-primary uppercase tracking-wide">Tiempo estimado</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-foreground mt-0.5">{ETA[order.status]} · {STATUS_MESSAGE[order.status]}</p>
                  </div>
                </div>

                {/* Desktop: 2-column grid | Mobile: single column */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT COLUMN: Products */}
                <div className="space-y-4">

                {/* Products table */}
                {order.items && order.items.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-card-border">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Productos del pedido</span>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-muted bg-gray-200 dark:bg-surface px-2 py-0.5 rounded-full">
                        {order.items.length} ítem{order.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Column headers */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50/50 dark:bg-[#1a1f2e]/50 border-b border-gray-100 dark:border-card-border/50">
                      <div className="col-span-6 sm:col-span-5 text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Producto</div>
                      <div className="col-span-3 sm:col-span-2 text-[10px] font-bold text-gray-400 dark:text-muted uppercase text-center">Cant.</div>
                      <div className="hidden sm:block col-span-2 text-[10px] font-bold text-gray-400 dark:text-muted uppercase text-right">P. Unit.</div>
                      <div className="col-span-3 text-[10px] font-bold text-gray-400 dark:text-muted uppercase text-right">Subtotal</div>
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-gray-100 dark:divide-card-border/50">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                          <div className="col-span-6 sm:col-span-5 flex items-center gap-2.5 min-w-0">
                            {item.image ? (
                              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-surface overflow-hidden shrink-0 relative border border-gray-200 dark:border-card-border">
                                <Image src={item.image} alt={item.name} fill className="object-cover" unoptimized onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0">
                                <Package className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate leading-snug">{item.name}</p>
                              <p className="text-[10px] text-gray-400 dark:text-muted">{item.unit}</p>
                            </div>
                          </div>
                          <div className="col-span-3 sm:col-span-2 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold">{(item.quantity ?? item.qty ?? 0)}</span>
                          </div>
                          <div className="hidden sm:block col-span-2 text-right">
                            <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">S/{item.price.toFixed(2)}</span>
                          </div>
                          <div className="col-span-3 text-right">
                            <span className="text-xs font-bold text-gray-900 dark:text-foreground">S/{(item.price * (item.quantity ?? item.qty ?? 0)).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Totals */}
                    <div className="px-4 py-3 bg-linear-to-r from-primary/5 to-indigo-500/5 dark:from-primary/10 dark:to-indigo-500/10 border-t border-gray-200 dark:border-card-border space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-muted">
                        <span>Subtotal ({order.items.length} ítems)</span>
                        <span className="font-medium">S/{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="font-medium">✓ Delivery gratuito</span>
                        <span className="font-medium">— S/ 0.00</span>
                      </div>
                      {order.paymentMethod && (
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-muted">
                          <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> Método de pago</span>
                          <span className="font-semibold">{PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-card-border">
                        <span className="text-sm font-bold text-gray-800 dark:text-foreground">Total del pedido</span>
                        <span className="text-lg font-extrabold text-primary">{fmt(order.total ?? subtotal)}</span>
                      </div>
                    </div>
                  </div>
                )}

                </div>
                {/* RIGHT COLUMN: Map + Customer info + Share */}
                <div className="space-y-4">
                {/* Map */}
                <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-card-border shadow-sm">
                  <div className="px-4 py-2.5 flex items-center justify-between bg-linear-to-r from-slate-700 to-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center">
                        <MapPin className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{order.status === "en_camino" ? "🚚 Delivery en ruta" : "📍 Buleje"}</p>
                        <p className="text-[10px] text-white/60">Jr. San Martín · Callería, Ucayali</p>
                      </div>
                    </div>
                    {order.status === "en_camino" && (
                      <div className="flex items-center gap-1.5 bg-emerald-500/25 rounded-full px-2.5 py-1 border border-emerald-400/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-300">En vivo</span>
                      </div>
                    )}
                  </div>
                  <div className="h-44 sm:h-65">
                    <LeafletMap lat={STORE_LAT} lon={STORE_LON} zoom={15} height={260} />
                  </div>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-[#1a1f2e] flex items-center justify-between border-t border-gray-200 dark:border-card-border">
                    <span className="text-xs text-gray-500 dark:text-muted">Tiempo estimado de entrega</span>
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      order.status === "en_camino"
                        ? "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300"
                        : "text-primary bg-primary/10 dark:bg-primary/20 dark:text-primary"
                    )}>{ETA[order.status]}</span>
                  </div>
                </div>

                {/* Customer info */}
                {order.customer && (order.customer.name || order.customer.phone || order.customer.location) && (
                  <div className="rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-card-border">
                      <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Datos de entrega</p>
                    </div>
                    <div className="p-4 space-y-2.5">
                      {order.customer.name && (
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div><p className="text-[10px] text-gray-400 dark:text-muted">Nombre</p><p className="text-sm font-semibold text-gray-800 dark:text-foreground">{order.customer.name}</p></div>
                        </div>
                      )}
                      {order.customer.phone && (
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                            <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div><p className="text-[10px] text-gray-400 dark:text-muted">Teléfono</p><p className="text-sm font-semibold text-gray-800 dark:text-foreground">{order.customer.phone}</p></div>
                        </div>
                      )}
                      {order.customer.location && (
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                            <MapPin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-muted">Dirección</p>
                            <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{order.customer.location}</p>
                            {order.customer.reference && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Ref: {order.customer.reference}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* WhatsApp share */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🛝 Mi pedido en Buleje #${order.id.slice(-6)}\nEstado: ${currentStep?.label ?? order.status}\n⏱ ETA: ${ETA[order.status]}\n¡Encúentralos en buleje.pe!`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-2xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1eb858] transition-all shadow-md"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Compartir en WhatsApp
                </a>
                </div>
                </div>
              </div>
            ) : (
              /* Terminal / no-order state */
              <div className="p-8 flex flex-col items-center justify-center text-center min-h-70">
                {order?.status === "cancelado" ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                      <X className="w-10 h-10 text-red-500" />
                    </div>
                    <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">Pedido cancelado</p>
                    <p className="text-sm text-gray-500 dark:text-muted mt-2 max-w-xs">Este pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.</p>
                  </>
                ) : order?.status === "entregado" ? (
                  <>
                    <m.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 14, stiffness: 220 }}
                      className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4"
                    >
                      <span className="text-5xl">🎉</span>
                    </m.div>
                    <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">¡Pedido entregado!</p>
                    <p className="text-sm text-gray-500 dark:text-muted mt-2 max-w-xs mx-auto">
                      Tu pedido #{order.id.slice(-6)} llegó con éxito. ¡Gracias por confiar en Buleje!
                    </p>
                    {order.items && order.items.length > 0 && (
                      <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="mt-5 w-full max-w-xs text-left rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                          <p className="text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Resumen de entrega</p>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-card-border/50">
                          {order.items.slice(0, 4).map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">{item.name} ×{(item.quantity ?? item.qty ?? 0)}</span>
                              <span className="text-xs font-bold text-gray-800 dark:text-foreground ml-2 shrink-0">S/{(item.price * (item.quantity ?? item.qty ?? 0)).toFixed(2)}</span>
                            </div>
                          ))}
                          {order.items.length > 4 && <div className="px-3 py-1.5 text-center text-[10px] text-gray-400">+{order.items.length - 4} más</div>}
                        </div>
                        {order.total && (
                          <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 flex justify-between">
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Total pagado</span>
                            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">{fmt(order.total)}</span>
                          </div>
                        )}
                      </m.div>
                    )}
                    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-5 flex flex-col gap-3 w-full max-w-xs">
                      <div className="flex items-center gap-1 justify-center">
                        {[1,2,3,4,5].map(s => <Star key={s} className="h-5 w-5 text-amber-400 fill-amber-400" />)}
                      </div>
                      <a href={`https://wa.me/?text=${encodeURIComponent("¡Me acaba de llegar mi pedido de Buleje! 🛒🎉 Los recomiendo al 100%")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-2xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1eb858] transition-all"
                      >📲 Compartir con amigos</a>
                    </m.div>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-surface flex items-center justify-center mb-4">
                      <ShoppingBag className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">Sin pedidos activos</p>
                    <p className="text-sm text-gray-500 dark:text-muted mt-2">Haz un pedido y podrás seguirlo aquí en tiempo real</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ══ FOOTER ══ */}
          <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-card-border bg-white dark:bg-[#0f1117]">
            <button onClick={handleClose}
              className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-surface text-gray-700 dark:text-foreground font-bold text-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" /> Cerrar
            </button>
          </div>
        </m.div>
      </m.div>

      {showConfetti && <Confetti active={showConfetti} />}
    </AnimatePresence>
  );
}

