"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Package, Clock, CheckCircle2, Truck, XCircle,
  ClipboardList, Search, RotateCcw, ChevronDown,
  ArrowLeft, ShoppingBag, Phone, ArrowRight, ShoppingCart,
} from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────
type OrderItem = {
  productId?: number; name: string; price?: number;
  quantity: number; unit: string; image: string;
};
type Order = {
  id: string; items?: OrderItem[]; total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string;
};

// ── Config ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  pendiente:  { label: "Pendiente",  cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",       dot: "bg-amber-400",   Icon: Clock },
  confirmado: { label: "Confirmado", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",           dot: "bg-blue-400",    Icon: CheckCircle2 },
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

// ── OrderCard ──────────────────────────────────────────────────────
function OrderCard({ order: o, onReorder }: { order: Order; onReorder?: (items: OrderItem[]) => void }) {
  const [expanded, setExpanded] = useState(false);
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
          o.status === "confirmado" ? "bg-blue-50 dark:bg-blue-900/20" :
                                      "bg-amber-50 dark:bg-amber-900/20"
        )}>
          <StIcon className={cn("h-5 w-5",
            o.status === "en_camino"  ? "text-indigo-500" :
            o.status === "entregado"  ? "text-emerald-500" :
            o.status === "cancelado"  ? "text-red-500" :
            o.status === "confirmado" ? "text-blue-500" :
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
          {/* Items list */}
          <div className="pt-3 space-y-2.5">
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
                onClick={() => onReorder(items)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Volver a pedir
              </button>
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
    <div className="text-center py-16 px-6">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-5">
        <ShoppingBag className="h-10 w-10 text-primary/30" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">
        {isFiltered ? "Sin resultados" : "Aún no tienes pedidos"}
      </h3>
      <p className="text-sm text-muted max-w-xs mx-auto mb-6">
        {isFiltered
          ? "No hay pedidos que coincidan con este filtro."
          : "Realiza tu primer pedido y aparecerá aquí con todos sus detalles."}
      </p>
      {!isFiltered && (
        <Link
          href="/#productos"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20"
        >
          <ShoppingCart className="h-4 w-4" />
          Ir a comprar
        </Link>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MisPedidosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();
  const { addMultiple } = useCart();

  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identified, setIdentified] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todos");

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
      const clean = customer.phone.replace(/\D/g, "");
      startTransition(() => setPhone(clean));
      loadOrders(clean);
    }
  }, [customer, identified, loadOrders]);

  const handleReorder = useCallback((items: OrderItem[]) => {
    const toAdd = items
      .filter((i) => i.productId)
      .map((i) => ({
        product: { id: i.productId!, name: i.name, price: i.price ?? 0, image: i.image, unit: i.unit, category: "" },
        quantity: i.quantity,
      }));
    if (toAdd.length) addMultiple(toAdd);
  }, [addMultiple]);

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

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white dark:bg-card border-b border-gray-100 dark:border-card-border shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-surface transition-colors text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-extrabold text-foreground leading-tight">Mis Pedidos</h1>
            <p className="text-[11px] text-muted leading-none mt-0.5">Bodega San Martín</p>
          </div>
          {identified && safeOrders.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-primary leading-none">{completedOrders.length}</p>
              <p className="text-[10px] text-muted mt-0.5">pedidos</p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-20">

        {/* ── Phone identification ──────────────────────────────── */}
        {!identified && !loading && (
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm p-6">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <ClipboardList className="h-8 w-8 text-primary/50" />
              </div>
              <h2 className="text-base font-extrabold text-foreground">Consulta tu historial</h2>
              <p className="text-sm text-muted mt-1.5 max-w-xs leading-relaxed">
                Ingresa tu número de celular para ver todos tus pedidos
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); loadOrders(phone); }} className="space-y-3">
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Ej: 961 234 567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  maxLength={15}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-background dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={phone.length < 6}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                <Search className="h-4 w-4" />
                Ver mis pedidos
              </button>
            </form>
            {error && <p className="text-xs text-red-500 mt-3 text-center">{error}</p>}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-card-border text-center">
              <p className="text-xs text-muted">
                ¿Primera vez?&nbsp;
                <button
                  onClick={() => openCustomerModal("profile")}
                  className="text-primary font-semibold hover:underline"
                >
                  Regístrate aquí
                </button>
              </p>
            </div>
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
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-3.5 text-center">
                <p className="text-2xl font-extrabold text-foreground leading-tight">{completedOrders.length}</p>
                <p className="text-[11px] text-muted font-medium mt-1">Realizados</p>
              </div>
              <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-3.5 text-center">
                <p className="text-sm font-extrabold text-foreground leading-tight">{fmt(totalSpent)}</p>
                <p className="text-[11px] text-muted font-medium mt-1">Invertido</p>
              </div>
              <div className={cn(
                "rounded-2xl border p-3.5 text-center transition-colors",
                activeOrders.length > 0
                  ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-700/40"
                  : "bg-white dark:bg-card border-gray-100 dark:border-card-border"
              )}>
                <p className={cn(
                  "text-2xl font-extrabold leading-tight",
                  activeOrders.length > 0 ? "text-indigo-600 dark:text-indigo-300" : "text-foreground"
                )}>{activeOrders.length}</p>
                <p className={cn(
                  "text-[11px] font-medium mt-1",
                  activeOrders.length > 0 ? "text-indigo-500 dark:text-indigo-400" : "text-muted"
                )}>En curso</p>
              </div>
            </div>

            {/* Active orders banner */}
            {activeOrders.length > 0 && (
              <div className="relative overflow-hidden bg-linear-to-r from-indigo-600 to-indigo-500 rounded-2xl p-4 flex items-center gap-3">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">
                    {activeOrders.length === 1 ? "Tienes 1 pedido activo" : `Tienes ${activeOrders.length} pedidos activos`}
                  </p>
                  <p className="text-[11px] text-white/70 mt-0.5">Pronto llegará a tu puerta</p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/60 shrink-0" />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1.5 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-1.5 overflow-x-auto scrollbar-hide">
              {FILTERS.map(({ key, label }) => {
                const count = filterCounts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150",
                      filter === key
                        ? "bg-primary text-white shadow-sm"
                        : "text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold leading-none",
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
                  <OrderCard key={o.id ?? `order-${i}`} order={o} onReorder={handleReorder} />
                ))}
              </div>
            )}

            {/* Bottom CTA */}
            <div className="text-center pt-2">
              <Link
                href="/#productos"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ShoppingCart className="h-4 w-4" />
                Hacer otro pedido
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
