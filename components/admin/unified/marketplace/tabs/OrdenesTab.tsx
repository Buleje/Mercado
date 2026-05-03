"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  MapPin,
  Star,
  X,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { TableSkeleton, type MarketplaceOrder } from "../types";

// ── Constantes y helpers ────────────────────────────────────────────────────

const ORDER_STAGES: Array<{ id: string; label: string; tone: string; next: string | null }> = [
  { id: "pendiente",  label: "Pendiente",  tone: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", next: "confirmado" },
  { id: "confirmado", label: "Confirmado", tone: "bg-blue-100 text-blue-700",                                next: "preparando" },
  { id: "preparando", label: "Preparando", tone: "bg-[var(--data-info-100)] text-[var(--data-info)]",        next: "en_camino" },
  { id: "en_camino",  label: "En camino",  tone: "bg-amber-100 text-amber-700",                              next: "entregado" },
  { id: "entregado",  label: "Entregado",  tone: "bg-[var(--accent-soft)] text-[var(--data-success)]",      next: null },
];

const WHATSAPP_TEMPLATES: Array<{ id: string; label: string; build: (o: MarketplaceOrder) => string }> = [
  {
    id: "confirm",
    label: "Confirmar pedido",
    build: (o) => `Hola ${o.customerName}, recibimos tu pedido #${o.id.slice(-8).toUpperCase()} por S/${o.total.toFixed(2)}. Lo estamos preparando. ¡Gracias por tu compra!`,
  },
  {
    id: "ready",
    label: "Pedido listo",
    build: (o) => `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} ya está listo y saliendo en camino.`,
  },
  {
    id: "delivered",
    label: "Entregado",
    build: (o) => `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} fue entregado. ¡Gracias por tu preferencia! Si tienes 1 minuto, ¿nos dejarías una reseña?`,
  },
  {
    id: "no-stock",
    label: "Sin stock",
    build: (o) => `Hola ${o.customerName}, lamentamos avisarte que tu pedido #${o.id.slice(-8).toUpperCase()} tiene un producto sin stock. ¿Quieres que te llamemos para acordar reemplazo?`,
  },
  {
    id: "review",
    label: "Pedir reseña ⭐",
    build: (o) => {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const link = `${base}/pedido/${o.id}#reseña`;
      return `Hola ${o.customerName} 🙌. ¿Nos cuentas cómo te fue con tu pedido #${o.id.slice(-8).toUpperCase()}? Tu reseña ayuda a que más vecinos confíen en nosotros: ${link}`;
    },
  },
];

function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("51") || digits.length > 10 ? digits : `51${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d} d`;
}

// ── Sub-componentes ─────────────────────────────────────────────────────────

function NewOrderToast({ count, onView, onDismiss }: { count: number; onView: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-primary/40 rounded-xl shadow-2xl p-4 flex items-center gap-3 max-w-sm anim-fadeup">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <ShoppingCart className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">{count} pedido{count !== 1 ? "s" : ""} nuevo{count !== 1 ? "s" : ""}</p>
        <p className="text-xs text-[var(--text-secondary)]">Revisa la columna Pendiente</p>
      </div>
      <button onClick={onView} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark">Ver</button>
      <button onClick={onDismiss} aria-label="Cerrar" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function OrderCard({
  order, onAdvance, onWhatsApp, onRequestReview, advancing,
}: {
  order: MarketplaceOrder;
  onAdvance: () => void;
  onWhatsApp: () => void;
  onRequestReview: () => void;
  advancing: boolean;
}) {
  const stage = ORDER_STAGES.find((s) => s.id === order.status);
  const nextStage = stage?.next ? ORDER_STAGES.find((s) => s.id === stage.next) : null;
  const isDelivered = order.status === "entregado";
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-[var(--text-secondary)]">#{order.id.slice(-8).toUpperCase()}</p>
          <p className="text-sm font-bold text-[var(--text-primary)] truncate">{order.customerName}</p>
        </div>
        <span className="text-sm font-bold text-primary whitespace-nowrap">S/{order.total.toFixed(2)}</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {order.itemsCount} producto{order.itemsCount !== 1 ? "s" : ""} · {relativeTime(order.createdAt)}
      </p>
      {order.customerLocation && (
        <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="truncate">{order.customerLocation}</span>
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-1">
        {nextStage && (
          <button onClick={onAdvance} disabled={advancing} title={`Pasar a ${nextStage.label}`}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition disabled:opacity-50">
            {advancing
              ? <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><ArrowRight className="h-3 w-3" /> {nextStage.label}</>}
          </button>
        )}
        {isDelivered && order.customerPhone && (
          <button onClick={onRequestReview} title="Pedir reseña al cliente"
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--data-warning)] text-white text-xs font-bold hover:brightness-110 transition">
            <Star className="h-3 w-3 fill-white" /> Pedir reseña
          </button>
        )}
        {order.customerPhone && (
          <button onClick={onWhatsApp} title="Mensaje por WhatsApp"
            className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:brightness-110 transition">
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function WhatsAppPicker({ order, onClose }: { order: MarketplaceOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[var(--rule-base)] w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">WhatsApp a {order.customerName}</CardTitle>
            <p className="text-xs text-[var(--text-secondary)]">{order.customerPhone}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {WHATSAPP_TEMPLATES.map((t) => {
            const msg = t.build(order);
            return (
              <a key={t.id} href={buildWhatsAppUrl(order.customerPhone ?? "", msg)} target="_blank" rel="noreferrer" onClick={onClose}
                className="block px-3 py-2 rounded-lg border border-[var(--rule-base)] hover:border-[#25D366] hover:bg-[#25D366]/5 transition">
                <p className="text-sm font-bold text-[var(--text-primary)]">{t.label}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{msg}</p>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OrdenesTab
// ─────────────────────────────────────────────
export default function OrdenesTab() {
  const [orders, setOrders]       = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [waOrder, setWaOrder]     = useState<MarketplaceOrder | null>(null);
  const [knownIds, setKnownIds]   = useState<Set<string> | null>(null);
  const [newCount, setNewCount]   = useState(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/marketplace/orders");
      if (!r.ok) throw new Error("fail");
      const d = (await r.json()) as MarketplaceOrder[];
      setOrders(Array.isArray(d) ? d : []);

      if (knownIds === null) {
        setKnownIds(new Set(d.map((o) => o.id)));
      } else {
        const fresh = d.filter((o) => !knownIds.has(o.id));
        if (fresh.length > 0) {
          setNewCount((c) => c + fresh.length);
          try {
            const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
            if (Ctx) {
              const ctx = new Ctx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.05;
              osc.start();
              osc.stop(ctx.currentTime + 0.18);
            }
          } catch { /* noop */ }
        }
        setKnownIds(new Set(d.map((o) => o.id)));
      }
    } catch {
      if (!opts?.silent) setError("No se pudieron cargar las órdenes del marketplace.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [knownIds]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => { load({ silent: true }); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const advance = async (order: MarketplaceOrder) => {
    const stage = ORDER_STAGES.find((s) => s.id === order.status);
    if (!stage?.next) return;
    setAdvancingId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: stage.next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "fail");
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: stage.next! } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo avanzar el pedido.");
    } finally {
      setAdvancingId(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-sm">Pipeline de pedidos</CardTitle>
          <p className="text-xs text-[var(--text-secondary)]">{orders.length} pedido{orders.length !== 1 ? "s" : ""} · auto-refresh 30s</p>
        </div>
        <button onClick={() => load()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition">
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => load()} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {ORDER_STAGES.map((stage) => {
            const stageOrders = orders.filter((o) => o.status === stage.id);
            return (
              <div key={stage.id} className="bg-[var(--surface-sunken)] rounded-xl p-3 min-h-[200px]">
                <div className="flex items-center justify-between mb-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", stage.tone)}>{stage.label}</span>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{stageOrders.length}</span>
                </div>
                <div className="space-y-2">
                  {stageOrders.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] text-center py-6">Sin pedidos</p>
                  ) : (
                    stageOrders.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        onAdvance={() => advance(o)}
                        onWhatsApp={() => setWaOrder(o)}
                        onRequestReview={() => {
                          if (!o.customerPhone) return;
                          const tpl = WHATSAPP_TEMPLATES.find((t) => t.id === "review");
                          if (!tpl) return;
                          window.open(buildWhatsAppUrl(o.customerPhone, tpl.build(o)), "_blank", "noopener");
                        }}
                        advancing={advancingId === o.id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newCount > 0 && (
        <NewOrderToast
          count={newCount}
          onView={() => { setNewCount(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDismiss={() => setNewCount(0)}
        />
      )}

      {waOrder && <WhatsAppPicker order={waOrder} onClose={() => setWaOrder(null)} />}
    </div>
  );
}
