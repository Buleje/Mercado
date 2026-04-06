"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  CheckCircle2, Clock, Truck, PackageCheck,
  XCircle, ShoppingBag, RefreshCw, AlertCircle,
  Star, Send,
} from "lucide-react";
import type { OrderStatus, DbOrderItem } from "@/lib/jsondb";

type PublicOrder = {
  id: string;
  status: OrderStatus;
  customerName: string;
  items: DbOrderItem[];
  total: number;
  paymentMethod: "yape" | "efectivo" | null;
  notes: string | null;
  deliverySlot: string | null;
  couponDiscount: number | null;
  discountAmount: number | null;
  createdAt: string;
  updatedAt: string;
};

type Step = {
  id: OrderStatus;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
};

const STEPS: Step[] = [
  {
    id: "pendiente",
    label: "Pedido recibido",
    desc: "Tu pedido llegó a la bodega",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
  {
    id: "confirmado",
    label: "Confirmado",
    desc: "Estamos preparando tu pedido",
    icon: CheckCircle2,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  {
    id: "en_camino",
    label: "En camino",
    desc: "Tu pedido está en camino a tu casa",
    icon: Truck,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    id: "entregado",
    label: "Entregado",
    desc: "¡Tu pedido fue entregado!",
    icon: PackageCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
];

const POLL_INTERVAL = 5000; // ms

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PedidoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}/public`, { cache: "no-store" });
      if (!res.ok) {
        setError("No encontramos este pedido. Verifica el enlace.");
        setLoading(false);
        return;
      }
      const data = await res.json() as PublicOrder;
      setOrder(data);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Error de conexión. Reintentando…");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchOrder();
    intervalRef.current = setInterval(() => {
      void fetchOrder();
    }, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrder]);

  // Stop polling when delivered or cancelled
  useEffect(() => {
    if (order?.status === "entregado" || order?.status === "cancelado") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [order?.status]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(45,106,79,0.06), #d1fae5)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
          <p className="text-gray-500 font-medium">Cargando tu pedido…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !order) {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Pedido no encontrado</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{error ?? "No se encontró el pedido."}</p>
        </div>
      </div>
    );
  }

  // ── Cancelled ────────────────────────────────────────────────────────────
  if (order.status === "cancelado") {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-red-500 px-6 py-5 text-white text-center">
            <XCircle className="h-12 w-12 mx-auto mb-2" />
            <h2 className="text-xl font-bold">Pedido cancelado</h2>
            <p className="text-red-100 text-sm mt-1">Nº {order.id}</p>
          </div>
          <div className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">Este pedido fue cancelado. Si tienes dudas, contáctanos.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === order.status);
  const currentStep = STEPS[currentStepIndex] ?? STEPS[0];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, rgba(45,106,79,0.05), #d1fae5)" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-gray-900/20 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-extrabold text-gray-900 dark:text-gray-100 text-sm leading-tight">Buleje</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Seguimiento de pedido</p>
            </div>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En vivo
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ── Status hero card ──────────────────────────────────────────── */}
        <div className={`rounded-2xl p-6 text-center shadow-sm ${currentStep.bg}`}>
          <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-3 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-900/20`}>
            <currentStep.icon className={`h-8 w-8 ${currentStep.color}`} />
          </div>
          <h1 className={`text-2xl font-extrabold ${currentStep.color}`}>{currentStep.label}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{currentStep.desc}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Actualizado: {formatDate(order.updatedAt)} · {formatTime(order.updatedAt)}
          </p>
          {/* P2 — ETA estimado */}
          {order.status === "confirmado" && (
            <p className="text-sm font-semibold text-blue-700 mt-2">
              🕐 Entrega estimada: ~30-45 min
            </p>
          )}
          {order.status === "en_camino" && (() => {
            const updated = new Date(order.updatedAt).getTime();
            const elapsed = Math.floor((Date.now() - updated) / 60000);
            const remaining = Math.max(0, 20 - elapsed);
            return (
              <p className="text-sm font-semibold text-primary mt-2">
                🚚 {remaining > 0 ? `Llega en ~${remaining} min` : "¡Ya casi llega!"}
              </p>
            );
          })()}
        </div>

        {/* ── Progress stepper ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-5">
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Estado del pedido</h2>
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i < currentStepIndex;
              const active = i === currentStepIndex;
              const pending = i > currentStepIndex;
              return (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Icon + connector */}
                  <div className="flex flex-col items-center">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      done
                        ? "bg-primary"
                        : active
                        ? `${step.bg} ring-4 ring-primary/20`
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}>
                      <step.icon className={`h-4 w-4 ${
                        done
                          ? "text-white"
                          : active
                          ? step.color
                          : "text-gray-300"
                      }`} />
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 h-8 mt-0.5 transition-all ${done ? "bg-primary" : "bg-gray-100"}`} />
                    )}
                  </div>
                  {/* Label */}
                  <div className="pt-1.5 pb-6 last:pb-0 flex-1">
                    <p className={`text-sm font-bold ${
                      done ? "text-primary" : active ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600"
                    }`}>
                      {step.label}
                      {active && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Ahora
                        </span>
                      )}
                    </p>
                    <p className={`text-xs mt-0.5 ${pending ? "text-gray-200 dark:text-gray-700" : "text-gray-400 dark:text-gray-500"}`}>{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Order info ────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-5 space-y-3">
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Detalles del pedido</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Número de pedido</span>
            <span className="font-mono font-bold text-primary text-xs">{order.id}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Cliente</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{order.customerName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Fecha del pedido</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(order.createdAt)}, {formatTime(order.createdAt)}</span>
          </div>
          {order.paymentMethod && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Pago</span>
              <span className={`font-semibold text-xs px-2.5 py-1 rounded-full ${
                order.paymentMethod === "yape"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}>
                {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
              </span>
            </div>
          )}
          {order.deliverySlot && order.deliverySlot !== "lo-antes-posible" && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Entrega programada</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{order.deliverySlot}</span>
            </div>
          )}
          {order.notes && (
            <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider mb-1">Notas</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{order.notes}</p>
            </div>
          )}
        </div>

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-5">
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
            Historial
          </h2>
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2.25 top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-gray-700" />

            {/* Current status */}
            {(() => {
              const currentStep = STEPS.find(s => s.id === order.status);
              const Icon = currentStep?.icon ?? Clock;
              return (
                <div className="relative flex items-start gap-3">
                  <span className={`absolute -left-6 top-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center ${currentStep?.bg ?? "bg-gray-100"}`}>
                    <Icon className={`w-3 h-3 ${currentStep?.color ?? "text-gray-500"}`} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{currentStep?.label ?? order.status}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(order.updatedAt)}, {formatTime(order.updatedAt)}</p>
                  </div>
                </div>
              );
            })()}

            {/* Order created */}
            <div className="relative flex items-start gap-3">
              <span className="absolute -left-6 top-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                <ShoppingBag className="w-3 h-3 text-gray-500 dark:text-gray-400" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pedido creado</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(order.createdAt)}, {formatTime(order.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Items ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-5">
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Productos ({order.items.length})
          </h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shrink-0">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{item.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    S/{(item.price ?? 0).toFixed(2)} / {item.unit} · x{item.quantity}
                  </p>
                </div>
                <p className="font-bold text-gray-900 dark:text-gray-100 text-sm shrink-0">
                  S/{((item.price ?? 0) * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              S/{((order.total ?? 0) + (order.couponDiscount ?? 0) + (order.discountAmount ?? 0)).toFixed(2)}
            </span>
          </div>
          {(order.couponDiscount ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-600">🎟️ Descuento cupón</span>
              <span className="text-sm font-bold text-blue-600">-S/{(order.couponDiscount ?? 0).toFixed(2)}</span>
            </div>
          )}
          {(order.discountAmount ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-600">🏷️ Promoción</span>
              <span className="text-sm font-bold text-emerald-600">-S/{(order.discountAmount ?? 0).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Total</span>
            <span className="text-xl font-extrabold text-primary">S/{(order.total ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* ── Post-delivery review form ──────────────────────────────── */}
        {order.status === "entregado" && <PostDeliveryReview orderId={order.id} customerName={order.customerName} />}

        {/* ── Receipt link ──────────────────────────────────────────────── */}
        <a
          href={`/pedido/${order.id}/recibo`}
          className="block text-center bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-4 text-sm font-semibold text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
        >
          🧾 Ver comprobante / Imprimir recibo
        </a>

        {/* ── Footer info ───────────────────────────────────────────────── */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-6">
          Esta página se actualiza automáticamente cada 5 segundos
        </p>
      </div>
    </div>
  );
}

/* ── Post-Delivery Review Form ─────────────────────────────────────── */
function PostDeliveryReview({ orderId, customerName }: { orderId: string; customerName: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(() => {
    try { return localStorage.getItem(`bsm-review-${orderId}`) === "1"; } catch { return false; }
  });
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (rating === 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerName || "Cliente",
          rating,
          text: text.trim() || `Pedido #${orderId.slice(-6)}`,
          location: "",
        }),
      });
      if (res.ok) {
        setSent(true);
        try { localStorage.setItem(`bsm-review-${orderId}`, "1"); } catch {}
      }
    } catch { /* silent */ }
    setSending(false);
  };

  if (sent) {
    return (
      <div className="bg-emerald-50 rounded-2xl p-5 text-center space-y-2">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
        <p className="font-bold text-emerald-700">¡Gracias por tu reseña!</p>
        <p className="text-xs text-emerald-600/70">Tu opinión nos ayuda a mejorar</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-gray-900/20 p-5 space-y-3">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 text-center">¿Cómo estuvo tu pedido?</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Tu opinión nos ayuda a mejorar 🙏</p>

      {/* Star rating */}
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            className="p-1 transition-transform hover:scale-110"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                (hover || rating) >= n
                  ? "text-amber-400 fill-amber-400"
                  : "text-gray-200 dark:text-gray-700"
              }`}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {rating <= 2 ? "Lo sentimos, mejoraremos 💪" : rating <= 3 ? "¡Gracias por tu feedback!" : rating <= 4 ? "¡Muy bien! 👍" : "¡Excelente! 🎉"}
        </p>
      )}

      {/* Comment */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Cuéntanos más sobre tu experiencia (opcional)..."
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        rows={2}
        maxLength={500}
      />

      <button
        onClick={submit}
        disabled={rating === 0 || sending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
      >
        {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar reseña
      </button>
    </div>
  );
}
