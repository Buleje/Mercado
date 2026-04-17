"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Package, Clock, CheckCircle2, Truck, XCircle,
  ClipboardList, Search, RotateCcw, ChevronDown,
  ArrowLeft, ShoppingBag, ArrowRight, ShoppingCart,
  Share2,
} from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import dynamic from "next/dynamic";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const QuickReorderModal = dynamic(() => import("@/components/QuickReorderModal"));

// ADR-065 Ola F — ilustraciones custom
import { PedidoLlegando, LupaConfundida, IllustrationCard } from "@/components/ui-system/illustrations";

// ── Types ──────────────────────────────────────────────────────────
type OrderItem = {
  productId?: number; name: string; price?: number;
  quantity: number; unit: string; image: string;
};
type Order = {
  id: string; items?: OrderItem[]; total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string;
  notes?: string;
};

// ── Config ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  pendiente:  { label: "Pendiente",  cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",       dot: "bg-amber-400",   Icon: Clock },
  confirmado: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",           dot: "bg-emerald-400",    Icon: CheckCircle2 },
  en_camino:  { label: "En camino",  cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",   dot: "bg-indigo-400",  Icon: Truck },
  entregado:  { label: "Entregado",  cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", dot: "bg-emerald-400", Icon: CheckCircle2 },
  cancelado:  { label: "Cancelado",  cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",               dot: "bg-red-400",     Icon: XCircle },
} as const;

const ACTIVE_STATUSES = ["pendiente", "confirmado", "en_camino"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

const FILTERS = [
  { key: "todos",     label: "Todos" },
  { key: "en_curso",  label: "En curso" },
  { key: "entregado", label: "Entregados" },
  { key: "cancelado", label: "Cancelados" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────
function fmt(n?: number | null) { return `S/${(n ?? 0).toFixed(2)}`; }
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

// ── Order Progress Bar ────────────────────────────────────────────
const ORDER_PROGRESS_STEPS = [
  { status: "pendiente"  as const, label: "Recibido",   icon: Clock        },
  { status: "confirmado" as const, label: "Confirmado", icon: CheckCircle2 },
  { status: "en_camino"  as const, label: "En camino",  icon: Truck        },
  { status: "entregado"  as const, label: "Entregado",  icon: Package      },
];

function OrderProgressBar({ status }: { status: Order["status"] }) {
  if (status === "cancelado") return null;
  const currentIdx = ORDER_PROGRESS_STEPS.findIndex(s => s.status === status);
  return (
    <div className="flex items-center mb-1">
      {ORDER_PROGRESS_STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive  = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.status} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                isCurrent ? "bg-primary text-white shadow-sm shadow-primary/30"
                          : isActive ? "bg-primary/20 text-primary" : "bg-gray-100 dark:bg-surface text-gray-300"
              )}>
                <Icon className="h-3 w-3" />
              </div>
              <span className={cn("text-[9px] mt-0.5 font-medium text-center",
                isCurrent ? "text-primary" : isActive ? "text-gray-500 dark:text-muted" : "text-gray-300"
              )}>
                {step.label}
              </span>
            </div>
            {i < ORDER_PROGRESS_STEPS.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-1 rounded-full -mt-3.5 transition-colors",
                i < currentIdx ? "bg-primary/40" : "bg-gray-100 dark:bg-surface"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── OrderCard ──────────────────────────────────────────────────────
function OrderCard({ order: o, onReorder, onCancel }: { order: Order; onReorder?: (items: OrderItem[], orderId?: string, orderDate?: string) => void; onCancel?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const st = STATUS_CFG[o.status] ?? STATUS_CFG.pendiente;
  const { Icon: StIcon } = st;
  const items = o.items ?? [];
  const isActive = ACTIVE_STATUSES.includes(o.status as ActiveStatus);

  return (
    <div className={cn(
      "bg-white dark:bg-card rounded-2xl border transition-all duration-200 overflow-hidden",
      isActive
        ? "border-indigo-200 dark:border-indigo-700/50 shadow-md shadow-indigo-100/50 dark:shadow-none"
        : "border-gray-100 dark:border-card-border hover:border-gray-200 dark:hover:border-card-border/80"
    )}>
      {/* Active bar */}
      {isActive && <div className="h-0.5 bg-linear-to-r from-indigo-500 to-indigo-400" />}

      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left group"
      >
        {/* Status icon pill */}
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
          o.status === "en_camino"  ? "bg-indigo-50 dark:bg-indigo-900/20" :
          o.status === "entregado"  ? "bg-emerald-50 dark:bg-emerald-900/20" :
          o.status === "cancelado"  ? "bg-red-50 dark:bg-red-900/20" :
          o.status === "confirmado" ? "bg-emerald-50 dark:bg-emerald-900/20" :
                                      "bg-amber-50 dark:bg-amber-900/20"
        )}>
          <StIcon className={cn("h-5 w-5",
            o.status === "en_camino"  ? "text-indigo-500" :
            o.status === "entregado"  ? "text-emerald-500" :
            o.status === "cancelado"  ? "text-red-500" :
            o.status === "confirmado" ? "text-emerald-500" :
                                        "text-amber-500"
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full", st.cls)}>
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", st.dot)} />
              {st.label}
            </span>
            {o.paymentMethod && (
              <span className="text-[10px] text-muted bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded-full">
                {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {items.length} producto{items.length !== 1 ? "s" : ""}&nbsp;&middot;&nbsp;{fmtDate(o.createdAt)}
          </p>
        </div>

        {/* Total + toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-extrabold text-foreground">{fmt(o.total)}</span>
          <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-surface flex items-center justify-center group-hover:bg-primary/8 transition-colors">
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform duration-200", expanded && "rotate-180")} />
          </div>
        </div>
      </button>

      {/* Expanded: items + actions */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 dark:border-card-border space-y-3">
          {/* Progress bar */}
          {o.status !== "cancelado" && (
            <div className="pt-3">
              <OrderProgressBar status={o.status} />
            </div>
          )}
          {/* Items list */}
          <div className="space-y-2.5">
            {items.map((item, idx) => (
              <div key={`${o.id}-${item.productId ?? item.name}-${idx}`} className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-surface shrink-0">
                  {item.image ? (
                    <Image src={item.image} alt={item.name} fill className="object-cover" sizes="40px" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Package className="h-5 w-5 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted">{item.quantity} {item.unit}</p>
                </div>
                <p className="text-sm font-bold text-foreground shrink-0">{fmt((item.price ?? 0) * item.quantity)}</p>
              </div>
            ))}
          </div>

          {/* Total row */}
          <div className="flex items-center justify-between pt-2.5 border-t border-gray-50 dark:border-card-border">
            <span className="text-xs text-muted font-medium">Total del pedido</span>
            <span className="text-sm font-extrabold text-foreground">{fmt(o.total)}</span>
          </div>

          {/* Notes row (F1) */}
          {o.notes && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 rounded-xl px-3 py-2.5 border border-amber-100 dark:border-amber-800/30">
              <span className="text-base leading-none mt-0.5">📝</span>
              <p className="text-xs text-amber-800 dark:text-amber-300">{o.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isActive && (
              <Link
                href={`/pedido/${o.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors shadow-sm shadow-primary/20"
              >
                <Truck className="h-3.5 w-3.5" />
                Seguir pedido
              </Link>
            )}
            {o.status !== "cancelado" && onReorder && (
              <button
                onClick={() => onReorder(items, o.id, o.createdAt)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Volver a pedir
              </button>
            )}
            <button
              onClick={() => {
                const lines = [
                  `Pedido #${o.id.slice(-6).toUpperCase()}`,
                  `${new Date(o.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}`,
                  "",
                  ...items.map(i => `- ${i.quantity}${i.unit} ${i.name}`),
                  "",
                  `Total: S/${(o.total ?? 0).toFixed(2)}`,
                ];
                const text = lines.join("\n");
                if (navigator.share) {
                  navigator.share({ text }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(text).catch(() => {});
                }
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-card-bg text-muted text-xs font-bold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
              title="Compartir pedido"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            {/* Q2: Cancel own pending order */}
            {o.status === "pendiente" && onCancel && (
              confirmingCancel ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { onCancel(o.id); setConfirmingCancel(false); }}
                    className="flex items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Sí, cancelar
                  </button>
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-card-bg text-muted text-xs font-bold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingCancel(true)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  title="Cancelar pedido"
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancelar
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function OrderSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-surface" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-gray-100 dark:bg-surface rounded-full" />
          <div className="h-2.5 w-40 bg-gray-100 dark:bg-surface rounded-full" />
        </div>
        <div className="h-5 w-16 bg-gray-100 dark:bg-surface rounded-full" />
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────
function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <IllustrationCard
      size="md"
      illustration={
        isFiltered ? <LupaConfundida size={140} /> : <PedidoLlegando size={160} />
      }
      kicker={isFiltered ? "Sin resultados" : "Mis pedidos"}
      title={isFiltered ? "Nada coincide con este filtro" : "Hacé tu primer pedido"}
      description={
        isFiltered
          ? "Probá cambiando el filtro para ver otros pedidos."
          : "Realizá tu primer pedido y verás acá el historial con estado y tiempo de entrega."
      }
      primaryAction={
        !isFiltered && (
          <Link
            href="/tienda"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
            Ir a comprar
          </Link>
        )
      }
    />
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MisPedidosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();
  const { addMultiple } = useCart();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identified, setIdentified] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todos");

  // Quick reorder modal state
  const [reorderModal, setReorderModal] = useState<{ items: OrderItem[]; orderId: string; orderDate: string } | null>(null);

  const loadOrders = useCallback(async (phoneNum: string) => {
    const clean = phoneNum.replace(/\D/g, "");
    if (clean.length < 6) { setError("Ingresa tu número completo (mínimo 6 dígitos)"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(clean)}/orders`);
      if (!res.ok) throw new Error();
      const data: Order[] = await res.json();
      startTransition(() => { setOrders(data); setIdentified(true); });
    } catch {
      setError("No pudimos cargar tus pedidos. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-identify from customer context
  useEffect(() => {
    if (customer?.phone && !identified) {
      loadOrders(customer.phone);
    }
  }, [customer, identified, loadOrders]);

  // Auto-open customer modal if no phone is known
  useEffect(() => {
    if (!customer?.phone && !identified && !loading) {
      const t = setTimeout(() => openCustomerModal("profile"), 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReorder = useCallback((items: OrderItem[], orderId?: string, orderDate?: string) => {
    setReorderModal({
      items,
      orderId: orderId ?? "unknown",
      orderDate: orderDate ? fmtDate(orderDate) : "Pedido anterior",
    });
  }, []);

  /* Q2: Cancel own pending order */
  const handleCancel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" }),
      });
      if (!res.ok) return;
      setOrders((prev) => prev?.map((o) => o.id === id ? { ...o, status: "cancelado" as const, updatedAt: new Date().toISOString() } : o) ?? null);
    } catch { /* silent */ }
  }, []);

  // Computed values
  const safeOrders = orders ?? [];
  const activeOrders = safeOrders.filter((o) => ACTIVE_STATUSES.includes(o.status as ActiveStatus));
  const completedOrders = safeOrders.filter((o) => o.status !== "cancelado");
  const totalSpent = completedOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

  const filtered = safeOrders.filter((o) => {
    if (filter === "todos") return true;
    if (filter === "en_curso") return ACTIVE_STATUSES.includes(o.status as ActiveStatus);
    return o.status === filter;
  });

  const filterCounts: Record<FilterKey, number> = {
    todos:     safeOrders.length,
    en_curso:  activeOrders.length,
    entregado: safeOrders.filter((o) => o.status === "entregado").length,
    cancelado: safeOrders.filter((o) => o.status === "cancelado").length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">

      {/* ── SEO Breadcrumbs ─────────────────────────────────────── */}
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mis Pedidos", url: "https://www.buleje.pe/mis-pedidos" },
        ]}
      />
      {/* ── Shared navigation ─────────────────────────────────────── */}
      <AnnouncementBar />
      <Header />

      {/* ── Hero header — editorial dark ──────────────────── */}
      <div
        className="pt-32 sm:pt-36 pb-12 sm:pb-16 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/"
              className="p-2 -ml-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-white/45 mb-1">
                Historial
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-[-0.02em]">Mis Pedidos</h1>
            </div>
            {identified && safeOrders.length > 0 && (
              <div className="text-right shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                <p className="text-lg font-extrabold text-white leading-none tabular-nums">{completedOrders.length}</p>
                <p className="text-[10px] text-white/45 mt-1 font-bold uppercase tracking-[0.18em]">pedidos</p>
              </div>
            )}
          </div>

          {/* Stats row — editorial */}
          {identified && orders !== null && !loading && safeOrders.length > 0 && (
            <div className="grid grid-cols-3 gap-0 border-y border-white/10 py-6">
              <div className="text-center px-4">
                <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">{completedOrders.length}</p>
                <p className="text-[10px] text-white/45 font-bold uppercase tracking-[0.18em] mt-2">Realizados</p>
              </div>
              <div className="text-center px-4 border-x border-white/10">
                <p className="text-xl sm:text-2xl font-extrabold text-white tabular-nums tracking-tight">{fmt(totalSpent)}</p>
                <p className="text-[10px] text-white/45 font-bold uppercase tracking-[0.18em] mt-2">Invertido</p>
              </div>
              <div className="text-center px-4">
                <p className={cn(
                  "text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight",
                  activeOrders.length > 0 ? "text-white" : "text-white/70"
                )}>{activeOrders.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] mt-2 text-white/45">En curso</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 space-y-4 pb-28">

        {/* ── No customer identified ───────────────────────────── */}
        {!identified && !loading && (
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <ClipboardList className="h-8 w-8 text-primary/50" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-foreground">Consulta tu historial</h2>
              <p className="text-sm text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                Identifícate desde la barra de navegación para ver todos tus pedidos.
              </p>
            </div>
            <button
              onClick={() => openCustomerModal("profile")}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" />
              Ver mis pedidos
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <OrderSkeleton key={i} />)}
          </div>
        )}

        {/* ── Identified content ────────────────────────────────── */}
        {identified && orders !== null && !loading && (
          <>
            {/* Active orders banner */}
            {activeOrders.length > 0 && (
              <div className="relative overflow-hidden bg-white dark:bg-card rounded-2xl border border-indigo-100 dark:border-indigo-700/40 shadow-sm p-4 flex items-center gap-3">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-primary/5 pointer-events-none" />
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {activeOrders.length === 1 ? "Tienes 1 pedido activo" : `Tienes ${activeOrders.length} pedidos activos`}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">Pronto llegará a tu puerta</p>
                </div>
                <ArrowRight className="h-4 w-4 text-primary/40 shrink-0" />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1.5 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-1.5 overflow-x-auto scrollbar-hide shadow-sm">
              {FILTERS.map(({ key, label }) => {
                const count = filterCounts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200",
                      filter === key
                        ? "bg-primary text-white shadow-md shadow-primary/20"
                        : "text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center h-4.5 min-w-4.5 px-1.5 rounded-full text-[10px] font-bold leading-none",
                        filter === key ? "bg-white/25 text-white" : "bg-gray-100 dark:bg-surface text-muted"
                      )}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Orders list */}
            {filtered.length === 0 ? (
              <EmptyState isFiltered={filter !== "todos"} />
            ) : (
              <div className="space-y-3">
                {filtered.map((o, i) => (
                  <OrderCard key={o.id ?? `order-${i}`} order={o} onReorder={handleReorder} onCancel={handleCancel} />
                ))}
              </div>
            )}

            {/* Bottom CTA — encourage more purchases */}
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm p-5 text-center space-y-3">
              <p className="text-sm font-bold text-foreground">¿Necesitas algo más?</p>
              <p className="text-xs text-muted">Delivery rápido · Paga con Yape o efectivo</p>
              <div className="flex gap-2 justify-center">
                <Link
                  href="/tienda"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Hacer otro pedido
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-surface text-foreground text-sm font-semibold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
                >
                  Ir al inicio
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
      <CartSidebar />
      <MobileBottomNav />

      {/* Quick Reorder Modal */}
      {reorderModal && (
        <QuickReorderModal
          items={reorderModal.items}
          orderId={reorderModal.orderId}
          orderDate={reorderModal.orderDate}
          onClose={() => setReorderModal(null)}
          onConfirm={(selected) => {
            if (selected.length) addMultiple(selected);
          }}
        />
      )}
    </div>
  );
}
