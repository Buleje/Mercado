"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { X, Package, Truck, CheckCircle2, Clock, ShoppingBag, MapPin, Phone, User, Receipt, Star, ArrowRight, Hash, CreditCard, Calendar, ChefHat, ClipboardCheck, PackageCheck, Navigation } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";

const LeafletMap = dynamic(() => import("./LeafletMap"), {});
const Confetti  = dynamic(() => import("./Confetti"),   {});

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
  { key: "pendiente",  label: "Recibido",   sublabel: "Pedido registrado",  icon: Receipt,       color: "var(--accent)", bg: "bg-primary",      ringColor: "ring-primary/30"    },
  { key: "confirmado", label: "Confirmado", sublabel: "Preparando ítems",  icon: CheckCircle2,  color: "#10b981", bg: "bg-[var(--data-success-500)]", ringColor: "ring-emerald-300" },
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

/**
 * Personalidad visual por estado — icono Lucide + título corto que cambia
 * con el estado actual. Hace que el modal se sienta vivo en cada paso.
 */
type StatusVibe = {
  Icon: typeof ClipboardCheck;
  title: string;
  tagline: string;
  progress: number;
};

const STATUS_VIBE: Record<string, StatusVibe> = {
  pendiente:  { Icon: ClipboardCheck, title: "Pedido recibido",       tagline: "Validando tu orden",          progress: 15 },
  confirmado: { Icon: ChefHat,        title: "Preparando tu pedido",  tagline: "Cocinando con cariño",        progress: 45 },
  en_camino:  { Icon: Truck,          title: "Tu pedido va en camino", tagline: "El repartidor se aproxima",  progress: 80 },
  entregado:  { Icon: PackageCheck,   title: "Pedido entregado",      tagline: "Gracias por tu compra",       progress: 100 },
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
    const lastOrderRaw = localStorage.getItem("buleje-last-order");
    if (lastOrderRaw) {
      const lastOrder = JSON.parse(lastOrderRaw);
      // If we already have a live status cached in buleje-active-order, prefer it
      const activeRaw = localStorage.getItem("buleje-active-order");
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
    const raw = localStorage.getItem("buleje-active-order");
    if (!raw) return null;
    const order = JSON.parse(raw) as TrackedOrder;
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

/** Reads customerPhone from buleje-last-order so the public lookup can prove ownership. */
function getStoredPhone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("buleje-last-order");
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
          localStorage.removeItem("buleje-active-order");
          localStorage.removeItem("buleje-last-order");
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
  const { businessName, storeTheme } = useSettings();
  const storeName = storeTheme?.name || businessName || "Tu tienda";
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  // Multi-order: lista de pedidos activos del cliente cuando tiene 2+
  // simultáneos (ej: pidió pollo y luego un postre antes de recibir el primero).
  const [activeOrders, setActiveOrders] = useState<TrackedOrder[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "detail">("detail");
  const [flyTarget, setFlyTarget] = useState<{ x: number; y: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatusRef = useRef<TrackedOrder["status"] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch ALL active orders del cliente (no solo el último) — permite que
  // el modal muestre lista cuando hay 2+ pedidos no entregados aún.
  const loadActiveOrders = useCallback(async (signal?: AbortSignal): Promise<TrackedOrder[] | null> => {
    const phoneRaw = (() => {
      try {
        const raw = localStorage.getItem("buleje-last-order");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.customerPhone || parsed?.customer?.phone || null;
      } catch { return null; }
    })();
    if (!phoneRaw) return null;
    try {
      const res = await fetch(
        `/api/orders?phone=${encodeURIComponent(phoneRaw)}&limit=50`,
        { signal, credentials: "include" },
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return (data as TrackedOrder[]).filter(
        (o) => o.status !== "entregado" && o.status !== "cancelado",
      );
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    loadActiveOrders(ctrl.signal).then((active) => {
      if (!active) return;
      setActiveOrders(active);
      // Si hay 2+ activos, abrir en modo lista. Si 1, modo detalle directo.
      if (active.length > 1) setViewMode("list");
      else setViewMode("detail");
    });
    return () => ctrl.abort();
  }, [isOpen, loadActiveOrders]);

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
        const lastOrderRaw = localStorage.getItem("buleje-last-order");
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
        localStorage.setItem("buleje-active-order", JSON.stringify(orderData));
        startTransition(() => { setOrder(orderData); });
        // Refrescar la lista de pedidos activos: si ahora hay 2+, mostrar
        // el selector. Si hay 1, mantener el detalle del recién creado.
        loadActiveOrders().then((active) => {
          if (!active) return;
          setActiveOrders(active);
          if (active.length > 1) setViewMode("list");
        });
      }
    };
    window.addEventListener("buleje:orderCreated", handleNewOrder);
    return () => window.removeEventListener("buleje:orderCreated", handleNewOrder);
  }, [loadActiveOrders]);

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
        localStorage.setItem("buleje-active-order", JSON.stringify(current));
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
        {/* TODO(#1): dark:bg-[#0f1117] and dark:bg-[#1a1f2e] = custom dark surfaces, add token when standardized. bg-[#25D366] = WhatsApp brand green, intentional. */}
        <m.div
          id="osm-card"
          ref={cardRef}
          initial={{ opacity: 0, y: 48 }}
          animate={cardAnimate}
          transition={cardTransition}
          onAnimationComplete={handleFlyComplete}
          className="relative rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg lg:max-w-3xl max-h-[94vh] overflow-hidden flex flex-col dark:bg-[#0f1117]"
          style={{
            zIndex: 2147483647,
            background:
              "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, white)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ══ HEADER ══ */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00B4A6) 55%, color-mix(in oklch, var(--color-primary, #00B4A6) 70%, white) 100%)",
            }}
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
                            <span className="text-[length:var(--ts-2xs)] text-white/60">
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
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/30 backdrop-blur">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">¡Entregado!</span>
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
                          <span className={cn("text-[length:var(--ts-2xs)] font-bold leading-tight text-center whitespace-nowrap", done ? "text-white" : "text-white/35")}>{step.label}</span>
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
            {/* ═══ LIST VIEW — múltiples pedidos activos ═══ */}
            {viewMode === "list" && activeOrders.length > 1 ? (
              <div className="p-4 lg:p-6 space-y-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h3
                    className="text-base font-extrabold uppercase tracking-wider"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    {activeOrders.length} pedidos activos
                  </h3>
                  <span className="text-xs text-muted">
                    Tocá uno para ver detalle
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeOrders.map((o) => {
                    const idx = STATUS_INDEX[o.status] ?? 0;
                    const step = STATUS_STEPS[idx];
                    const StepIcon = step.icon;
                    const itemCount =
                      o.items?.reduce(
                        (s, i) => s + (i.quantity ?? i.qty ?? 0),
                        0,
                      ) ?? 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setOrder(o);
                          setViewMode("detail");
                        }}
                        className="text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                        style={{
                          background: "var(--color-card)",
                          border:
                            "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                          boxShadow:
                            "0 4px 12px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full text-white"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                            }}
                          >
                            <StepIcon
                              className="h-3 w-3"
                              strokeWidth={2.5}
                            />
                            {step.label}
                          </span>
                          <span
                            className="text-xs font-mono font-bold tabular-nums"
                            style={{
                              color: "var(--color-primary-dark, #009690)",
                            }}
                          >
                            #{o.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {itemCount}{" "}
                          {itemCount === 1 ? "producto" : "productos"}
                        </p>
                        {o.items?.[0] && (
                          <p className="text-xs text-muted truncate mt-0.5">
                            {o.items[0].name}
                            {o.items.length > 1
                              ? ` y ${o.items.length - 1} más`
                              : ""}
                          </p>
                        )}
                        {o.total != null && (
                          <p
                            className="text-base font-extrabold tabular-nums mt-2"
                            style={{
                              color: "var(--color-primary-dark, #009690)",
                            }}
                          >
                            S/ {o.total.toFixed(2)}
                          </p>
                        )}
                        <p className="text-xs text-muted mt-2">
                          {ETA[o.status]}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : order && !isTerminal ? (
              <div className="p-4 lg:p-6">
                {/* Botón "Volver a la lista" — visible solo si hay 2+ activos */}
                {activeOrders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className="inline-flex items-center gap-1.5 mb-3 text-xs font-extrabold hover:underline"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    ← Ver todos mis pedidos ({activeOrders.length})
                  </button>
                )}
                {/* ═══ HERO MAP — protagonista visual ═══ */}
                {(() => {
                  const vibe = STATUS_VIBE[order.status];
                  if (!vibe) return null;
                  const StatusIcon = vibe.Icon;
                  const isOnWay = order.status === "en_camino";
                  return (
                    <m.div
                      key={order.status}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="relative rounded-3xl overflow-hidden mb-4"
                      style={{
                        boxShadow:
                          "0 18px 36px -14px color-mix(in oklch, var(--color-primary, #00B4A6) 30%, transparent)",
                        border:
                          "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                      }}
                    >
                      {/* MAPA grande como hero */}
                      <div className="relative h-64 sm:h-80 bg-[var(--surface-sunken)]">
                        <LeafletMap lat={STORE_LAT} lon={STORE_LON} zoom={15} height={320} />

                        {/* Overlay degradado para legibilidad de chips */}
                        <div
                          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 100%)",
                          }}
                          aria-hidden="true"
                        />
                        <div
                          className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)",
                          }}
                          aria-hidden="true"
                        />

                        {/* Pill superior — En vivo */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                          <div
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md"
                            style={{
                              background: "rgba(255,255,255,0.95)",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full animate-pulse"
                              style={{ background: "var(--color-primary, #00B4A6)" }}
                            />
                            <span
                              className="text-xs font-extrabold uppercase tracking-wider"
                              style={{ color: "var(--color-primary-dark, #009690)" }}
                            >
                              En vivo · {currentStep?.label}
                            </span>
                          </div>
                          {isOnWay && (
                            <div
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md text-white"
                              style={{
                                background:
                                  "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
                              }}
                            >
                              <Navigation
                                className="h-3.5 w-3.5"
                                strokeWidth={2.5}
                              />
                              <span className="text-xs font-extrabold">
                                Ruta activa
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Floating ETA — esquina inferior izquierda del mapa */}
                        <div
                          className="absolute bottom-3 left-3 rounded-2xl px-4 py-3 backdrop-blur-md flex items-center gap-3"
                          style={{
                            background: "rgba(255,255,255,0.95)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.20)",
                          }}
                        >
                          <m.div
                            animate={
                              isOnWay
                                ? { x: [0, 4, 0] }
                                : order.status === "confirmado"
                                  ? { rotate: [-3, 3, -3] }
                                  : { scale: [1, 1.05, 1] }
                            }
                            transition={{
                              duration: 1.8,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                            }}
                          >
                            <StatusIcon
                              className="h-5 w-5 text-white"
                              strokeWidth={2.25}
                            />
                          </m.div>
                          <div>
                            <p
                              className="text-xs font-extrabold uppercase tracking-wider"
                              style={{
                                color: "var(--color-primary-dark, #009690)",
                              }}
                            >
                              Llega en
                            </p>
                            <p className="text-xl font-extrabold text-foreground tabular-nums leading-none mt-0.5">
                              {ETA[order.status]}
                            </p>
                          </div>
                        </div>

                        {/* Status text bottom-right */}
                        <div className="absolute bottom-3 right-3 text-right max-w-[55%]">
                          <p className="text-base font-extrabold text-white leading-tight drop-shadow-md">
                            {vibe.title}
                          </p>
                          <p className="text-xs text-white/90 mt-0.5 drop-shadow">
                            {vibe.tagline}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar abajo del mapa */}
                      <div
                        className="relative h-1.5"
                        style={{
                          background:
                            "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                        }}
                      >
                        <m.div
                          className="absolute inset-y-0 left-0"
                          style={{
                            background:
                              "linear-gradient(90deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                          }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${vibe.progress}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                        />
                        <m.div
                          className="absolute inset-y-0 w-1/3"
                          style={{
                            background:
                              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
                          }}
                          animate={{ x: ["-100%", "300%"] }}
                          transition={{
                            duration: 2.4,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          aria-hidden="true"
                        />
                      </div>
                    </m.div>
                  );
                })()}

                {/* Single column — todo apilado para no dejar huecos blancos */}
                <div className="space-y-4">

                {/* Products table */}
                {order.items && order.items.length > 0 && (
                  <div
                    className="rounded-2xl overflow-hidden shadow-sm"
                    style={{
                      background: "var(--color-card)",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                    }}
                  >
                    <div
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 6%, transparent)",
                        borderBottom:
                          "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ShoppingBag
                          className="h-4 w-4"
                          strokeWidth={2.25}
                          style={{ color: "var(--color-primary-dark, #009690)" }}
                        />
                        <span
                          className="text-xs font-extrabold uppercase tracking-wider"
                          style={{ color: "var(--color-primary-dark, #009690)" }}
                        >
                          Productos del pedido
                        </span>
                      </div>
                      <span
                        className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white tabular-nums"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                        }}
                      >
                        {order.items.length} ítem{order.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Cards visuales — image-first, no más table */}
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {order.items.map((item, idx) => {
                        const qty = item.quantity ?? item.qty ?? 0;
                        const subtotal = item.price * qty;
                        return (
                          <m.div
                            key={idx}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="relative flex items-center gap-3 rounded-2xl p-2.5 transition-colors"
                            style={{
                              background:
                                "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, var(--color-card))",
                              border:
                                "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                            }}
                          >
                            {/* Imagen prominente con badge cantidad */}
                            <div
                              className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0"
                              style={{
                                background:
                                  "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, var(--surface-sunken))",
                                border:
                                  "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                              }}
                            >
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt={item.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Package
                                    className="h-6 w-6"
                                    strokeWidth={2}
                                    style={{
                                      color: "var(--color-primary-dark, #009690)",
                                    }}
                                  />
                                </div>
                              )}
                              {/* Badge cantidad flotante */}
                              <span
                                className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full text-xs font-extrabold tabular-nums text-white shadow-md"
                                style={{
                                  background:
                                    "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                                }}
                              >
                                {qty}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-foreground truncate leading-tight">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted mt-0.5 tabular-nums">
                                {item.unit} · S/{item.price.toFixed(2)} c/u
                              </p>
                              <p
                                className="text-base font-extrabold tabular-nums mt-0.5"
                                style={{
                                  color: "var(--color-primary-dark, #009690)",
                                }}
                              >
                                S/{subtotal.toFixed(2)}
                              </p>
                            </div>
                          </m.div>
                        );
                      })}
                    </div>
                    {/* Totals */}
                    <div
                      className="px-4 py-3 space-y-1.5"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, var(--color-card))",
                        borderTop:
                          "1px dashed color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                      }}
                    >
                      <div className="flex items-center justify-between text-sm text-muted">
                        <span>Subtotal ({order.items.length} ítems)</span>
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: "var(--color-primary-dark, #009690)" }}
                        >
                          S/{subtotal.toFixed(2)}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between text-sm"
                        style={{ color: "var(--data-success-700)" }}
                      >
                        <span className="font-semibold">✓ Delivery gratuito</span>
                        <span className="font-bold tabular-nums">— S/ 0.00</span>
                      </div>
                      {order.paymentMethod && (
                        <div className="flex items-center justify-between text-sm text-muted">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5" strokeWidth={2} /> Método
                          </span>
                          <span
                            className="font-semibold"
                            style={{
                              color: "var(--color-primary-dark, #009690)",
                            }}
                          >
                            {PAY_LABELS[order.paymentMethod] ?? order.paymentMethod}
                          </span>
                        </div>
                      )}
                      <div
                        className="flex items-baseline justify-between pt-2 mt-1"
                        style={{
                          borderTop:
                            "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 25%, transparent)",
                        }}
                      >
                        <span
                          className="text-sm font-extrabold uppercase tracking-wider"
                          style={{ color: "var(--color-primary-dark, #009690)" }}
                        >
                          Total
                        </span>
                        <span
                          className="text-2xl font-extrabold tabular-nums"
                          style={{ color: "var(--color-primary-dark, #009690)" }}
                        >
                          {fmt(order.total ?? subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer info */}
                {order.customer && (order.customer.name || order.customer.phone || order.customer.location) && (
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "var(--color-card)",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                    }}
                  >
                    <div
                      className="px-4 py-2.5"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 6%, transparent)",
                        borderBottom:
                          "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                      }}
                    >
                      <p
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: "var(--color-primary-dark, #009690)" }}
                      >
                        <Package className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Datos de entrega
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      {order.customer.name && (
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background:
                                "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                            }}
                          >
                            <User
                              className="h-4 w-4"
                              strokeWidth={2.25}
                              style={{ color: "var(--color-primary-dark, #009690)" }}
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted">Nombre</p>
                            <p className="text-sm font-bold text-foreground">{order.customer.name}</p>
                          </div>
                        </div>
                      )}
                      {order.customer.phone && (
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background:
                                "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                            }}
                          >
                            <Phone
                              className="h-4 w-4"
                              strokeWidth={2.25}
                              style={{ color: "var(--color-primary-dark, #009690)" }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted">Teléfono</p>
                            <p className="text-sm font-bold text-foreground tabular-nums">
                              {order.customer.phone}
                            </p>
                          </div>
                          <a
                            href={`tel:${order.customer.phone}`}
                            className="ml-auto inline-flex h-9 px-3 items-center justify-center rounded-xl text-xs font-extrabold text-white shrink-0 active:scale-95 transition-transform"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                            }}
                          >
                            Llamar
                          </a>
                        </div>
                      )}
                      {order.customer.location && (
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              background:
                                "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                            }}
                          >
                            <MapPin
                              className="h-4 w-4"
                              strokeWidth={2.25}
                              style={{ color: "var(--color-primary-dark, #009690)" }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted">Dirección</p>
                            <p className="text-sm font-bold text-foreground leading-snug">
                              {order.customer.location}
                            </p>
                            {order.customer.reference && (
                              <p className="text-xs text-muted mt-0.5">
                                Ref: {order.customer.reference}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                </div>
              </div>
            ) : (
              /* Terminal / no-order state */
              <div className="p-8 flex flex-col items-center justify-center text-center min-h-70">
                {order?.status === "cancelado" ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                      <X className="w-10 h-10 text-[var(--data-error-500)]" />
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
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                        boxShadow:
                          "0 14px 30px -10px color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
                      }}
                    >
                      <PackageCheck
                        className="h-12 w-12 text-white"
                        strokeWidth={2.25}
                      />
                    </m.div>
                    <p
                      className="text-2xl font-extrabold tracking-tight"
                      style={{ color: "var(--color-primary-dark, #009690)" }}
                    >
                      ¡Pedido entregado!
                    </p>
                    <p className="text-sm text-muted mt-2 max-w-xs mx-auto">
                      Tu pedido #{order.id.slice(-6)} llegó con éxito. ¡Gracias por confiar en nosotros!
                    </p>
                    {order.items && order.items.length > 0 && (
                      <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="mt-5 w-full max-w-xs text-left rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                          <p className="text-[length:var(--ts-2xs)] font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Resumen de entrega</p>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-card-border/50">
                          {order.items.slice(0, 4).map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">{item.name} ×{(item.quantity ?? item.qty ?? 0)}</span>
                              <span className="text-xs font-bold text-gray-800 dark:text-foreground ml-2 shrink-0">S/{(item.price * (item.quantity ?? item.qty ?? 0)).toFixed(2)}</span>
                            </div>
                          ))}
                          {order.items.length > 4 && <div className="px-3 py-1.5 text-center text-[length:var(--ts-2xs)] text-gray-400">+{order.items.length - 4} más</div>}
                        </div>
                        {order.total && (
                          <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 flex justify-between">
                            <span className="text-xs font-bold text-[var(--data-success-700)] dark:text-emerald-400">Total pagado</span>
                            <span className="text-xs font-extrabold text-[var(--data-success-700)] dark:text-emerald-400">{fmt(order.total)}</span>
                          </div>
                        )}
                      </m.div>
                    )}
                    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-5 flex flex-col gap-3 w-full max-w-xs">
                      <div className="flex items-center gap-1 justify-center">
                        {[1,2,3,4,5].map(s => <Star key={s} className="h-5 w-5 text-amber-400 fill-amber-400" />)}
                      </div>
                      <a href={`https://wa.me/?text=${encodeURIComponent(`¡Me acaba de llegar mi pedido de ${storeName}! 🛒🎉 Los recomiendo al 100%`)}`}
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

        </m.div>
      </m.div>

      {showConfetti && <Confetti active={showConfetti} />}
    </AnimatePresence>
  );
}

