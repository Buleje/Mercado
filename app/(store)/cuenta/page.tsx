"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Phone, ArrowLeft, Package, Clock, CheckCircle2,
  Truck, XCircle, Receipt, Loader2, Search, Award, RotateCcw,
  ListChecks, Tag, User, MapPin, Plus, Trash2, Pencil,
  ChevronDown, Heart, Filter, Gift, Percent, Star, ShoppingCart,
  MessageSquare, ThumbsUp, Repeat, TrendingUp, Bell,
  Sparkles, ArrowRight, Info,
} from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { useFavorites } from "@/contexts/favorites-context";
import { usePromotions } from "@/contexts/promotions-context";
import { cn } from "@/lib/utils";
import type { Product } from "@/data/products";
import type { SavedLocation } from "@/contexts/customer-context";

/* ── Types ───────────────────────────────────────────────────────── */

type OrderItem = { productId?: number; name: string; price?: number; quantity: number; unit: string; image: string };
type Order = {
  id: string; items?: OrderItem[]; total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string;
};
type LoyaltyData = {
  phone?: string; name?: string; loyaltyPoints?: number; loyaltyTier: string;
  totalSpent?: number; tiers?: { name: string; minSpent: number }[];
};
type ShoppingList = {
  id: string; customerPhone: string; name: string;
  items: { id: number; productId: number; quantity: number }[];
  createdAt: string; updatedAt: string;
};
type Bundle = {
  id: string; name: string; description?: string; price: number;
  image?: string; active: boolean;
  items: { id: number; productId: number; quantity: number }[];
};

const STATUS_MAP: Record<Order["status"], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pendiente:  { label: "Pendiente",  color: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",   icon: Clock },
  confirmado: { label: "Confirmado", color: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",       icon: CheckCircle2 },
  en_camino:  { label: "En camino",  color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300", icon: Truck },
  entregado:  { label: "Entregado",  color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  cancelado:  { label: "Cancelado",  color: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",           icon: XCircle },
};

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; gradient: string; inlineGradient: string }> = {
  bronce:   { bg: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-300",   border: "border-amber-200 dark:border-amber-700", gradient: "from-amber-400 to-orange-500",   inlineGradient: "linear-gradient(90deg, #fbbf24, #f97316)" },
  plata:    { bg: "bg-gray-50 dark:bg-gray-800",         text: "text-gray-600 dark:text-gray-300",     border: "border-gray-200 dark:border-gray-600",   gradient: "from-gray-400 to-gray-500",     inlineGradient: "linear-gradient(90deg, #9ca3af, #6b7280)" },
  oro:      { bg: "bg-yellow-50 dark:bg-yellow-900/20",  text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-200 dark:border-yellow-700", gradient: "from-yellow-400 to-amber-500",   inlineGradient: "linear-gradient(90deg, #facc15, #f59e0b)" },
  diamante: { bg: "bg-sky-50 dark:bg-sky-900/20",        text: "text-sky-700 dark:text-sky-300",       border: "border-sky-200 dark:border-sky-700",     gradient: "from-sky-400 to-blue-500",     inlineGradient: "linear-gradient(90deg, #38bdf8, #3b82f6)" },
};

function fmt(n: number | undefined | null) { return `S/${(n ?? 0).toFixed(2)}`; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
}

/* ── Tabs Config ─────────────────────────────────────────────────── */

const TABS = [
  { id: "pedidos", label: "Pedidos", icon: Receipt },
  { id: "favoritos", label: "Favoritos", icon: Heart },
  { id: "listas", label: "Listas", icon: ListChecks },
  { id: "puntos", label: "Puntos", icon: Award },
  { id: "ofertas", label: "Ofertas", icon: Tag },
  { id: "resenas", label: "Reseñas", icon: MessageSquare },
  { id: "perfil", label: "Perfil", icon: User },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ── Main Page ───────────────────────────────────────────────────── */

export default function CuentaPage() {
  const router = useRouter();
  const { customer, openModal: openCustomerModal } = useCustomer();

  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identified, setIdentified] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("pedidos");
  const [reorderMsg, setReorderMsg] = useState("");

  // Auto-identify from customer context
  useEffect(() => {
    if (customer?.phone && !identified) {
      startTransition(() => setPhone(customer.phone!));
    }
  }, [customer, identified]);

  const loadData = useCallback(async (phoneNum: string) => {
    const clean = phoneNum.replace(/\D/g, "");
    if (clean.length < 6) { setError("Ingresa un número válido"); return; }
    setError("");
    setLoading(true);
    try {
      const [ordersRes, loyaltyRes] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(clean)}/orders`),
        fetch(`/api/loyalty/${encodeURIComponent(clean)}`),
      ]);
      if (!ordersRes.ok) throw new Error("error");
      const ordersData: Order[] = await ordersRes.json();
      startTransition(() => { setOrders(ordersData); setIdentified(true); });
      if (loyaltyRes.ok) {
        const loyaltyData: LoyaltyData = await loyaltyRes.json();
        startTransition(() => setLoyalty(loyaltyData));
      }
    } catch {
      setError("No pudimos cargar tus datos. Intenta de nuevo.");
    }
    setLoading(false);
  }, []);

  const handleSearch = useCallback(() => { loadData(phone); }, [phone, loadData]);

  // Auto-load when customer phone is available
  useEffect(() => {
    if (customer?.phone && !identified && !loading) {
      loadData(customer.phone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.phone]);

  const handleReorder = useCallback((items: OrderItem[]) => {
    const reorderItems = items.filter((i) => i.productId).map((i) => ({
      id: i.productId!, name: i.name, price: i.price, image: i.image, unit: i.unit, category: "", quantity: i.quantity,
    }));
    if (reorderItems.length === 0) return;
    localStorage.setItem("bsm-reorder", JSON.stringify(reorderItems));
    setReorderMsg(`${reorderItems.length} productos agregados al carrito`);
    setTimeout(() => router.push("/"), 800);
  }, [router]);

  const totalSpent = orders?.filter(o => o.status !== "cancelado").reduce((a, o) => a + (o.total ?? 0), 0) ?? 0;
  const orderCount = orders?.filter(o => o.status !== "cancelado").length ?? 0;
  const activeOrders = orders?.filter(o => ["pendiente", "confirmado", "en_camino"].includes(o.status)) ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b border-gray-100 dark:border-card-border sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-card-border transition-colors text-gray-400 hover:text-gray-600 dark:text-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 dark:text-foreground">Mi Panel</h1>
            <p className="text-xs text-gray-400 dark:text-muted">Bodega San Martín</p>
          </div>
          {identified && loyalty && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              <Award className="h-3.5 w-3.5" />
              {loyalty.loyaltyPoints ?? 0} pts
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Phone Identification */}
        {!identified && (
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-foreground">Identifícate</h2>
                <p className="text-xs text-gray-400 dark:text-muted">Ingresa tu número para ver tu panel</p>
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
              <input
                type="tel" inputMode="numeric" placeholder="Ej: 961234567"
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                maxLength={15}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-card-border dark:bg-background dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <button type="submit" disabled={loading || phone.length < 6}
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Entrar
              </button>
            </form>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <p className="text-xs text-gray-400 dark:text-muted mt-3 text-center">
              &iquest;Primera vez?{" "}
              <button onClick={() => openCustomerModal("profile")} className="text-primary font-semibold hover:underline">
                Regístrate aquí
              </button>
            </p>
          </div>
        )}

        {/* Identified: Stats + Tabs */}
        {identified && orders && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard icon={Receipt} value={orderCount} label="Pedidos" color="text-violet-500" />
              <StatCard icon={ShoppingBag} value={fmt(totalSpent)} label="Gastado" color="text-emerald-500" />
              <StatCard icon={Package} value={activeOrders.length} label="Activos" color="text-amber-500" />
              <StatCard icon={Award} value={loyalty?.loyaltyPoints ?? 0} label="Puntos" color="text-sky-500" />
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <QuickAction icon={ShoppingCart} label="Comprar" href="/#productos" />
              <QuickAction icon={Heart} label="Favoritos" onClick={() => setActiveTab("favoritos")} />
              <QuickAction icon={MessageSquare} label="Reseña" onClick={() => setActiveTab("resenas")} />
              <QuickAction icon={Gift} label="Ofertas" onClick={() => setActiveTab("ofertas")} />
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-1 overflow-x-auto no-scrollbar">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                      isActive ? "bg-primary text-white shadow-sm" : "text-gray-500 dark:text-muted hover:text-primary hover:bg-primary/5"
                    )}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === "pedidos" && (
                <PedidosTab orders={orders ?? []} activeOrders={activeOrders} onReorder={handleReorder} />
              )}
              {activeTab === "favoritos" && <FavoritosTab />}
              {activeTab === "listas" && <ListasTab phone={phone} />}
              {activeTab === "puntos" && <PuntosTab loyalty={loyalty} orders={orders ?? []} />}
              {activeTab === "ofertas" && <OfertasTab />}
              {activeTab === "resenas" && <ResenasTab phone={phone} orders={orders ?? []} />}
              {activeTab === "perfil" && (
                <PerfilTab loyalty={loyalty} onLogout={() => {
                  startTransition(() => { setIdentified(false); setOrders(null); setLoyalty(null); setPhone(""); });
                }} />
              )}
            </div>
          </>
        )}

        {/* Reorder toast */}
        {reorderMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-2 animate-[toastIn_0.3s_ease-out]">
            <CheckCircle2 className="h-4 w-4" />
            {reorderMsg}
          </div>
        )}

        {/* Footer link */}
        <div className="text-center pt-2 pb-6">
          <Link href="/" className="text-xs text-primary font-semibold hover:underline">
            &larr; Volver a la tienda
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────── */

function StatCard({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string; color: string }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3 text-center">
      <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
      <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">{value}</p>
      <p className="text-xs text-gray-400 dark:text-muted">{label}</p>
    </div>
  );
}

/* ── Quick Action ────────────────────────────────────────────────── */

function QuickAction({ icon: Icon, label, href, onClick }: {
  icon: React.ComponentType<{ className?: string }>; label: string; href?: string; onClick?: () => void;
}) {
  const cls = "flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-card-border text-xs font-medium text-gray-600 dark:text-foreground/70 hover:border-primary/30 hover:text-primary transition-colors whitespace-nowrap";
  if (href) return <Link href={href} className={cls}><Icon className="h-3.5 w-3.5" />{label}</Link>;
  return <button onClick={onClick} className={cls}><Icon className="h-3.5 w-3.5" />{label}</button>;
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1: PEDIDOS
   ══════════════════════════════════════════════════════════════════ */

function PedidosTab({ orders, activeOrders, onReorder }: { orders: Order[]; activeOrders: Order[]; onReorder: (items: OrderItem[]) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const { addItem } = useCart();
  
  // Safe defaults
  const safeOrders = orders ?? [];
  const safeActiveOrders = activeOrders ?? [];
  
  const filtered = statusFilter === "todos" ? safeOrders : safeOrders.filter(o => o.status === statusFilter);

  // Most purchased products
  const frequentProducts = (() => {
    const counts = new Map<string, { name: string; image: string; price?: number; unit: string; productId?: number; qty: number }>();
    safeOrders.filter(o => o.status !== "cancelado").forEach(o => {
      o.items?.forEach(item => {
        const key = item.name;
        const existing = counts.get(key);
        if (existing) existing.qty += item.quantity;
        else counts.set(key, { name: item.name, image: item.image, price: item.price, unit: item.unit, productId: item.productId, qty: item.quantity });
      });
    });
    return [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  })();

  return (
    <div className="space-y-4">
      {safeActiveOrders.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-700 dark:text-foreground/80 mb-2 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-indigo-500" />
            Pedidos en curso ({safeActiveOrders.length})
          </h3>
          <div className="space-y-2">
            {safeActiveOrders.map((o, i) => <OrderCard key={o.id || `active-${i}`} order={o} highlight onReorder={onReorder} />)}
          </div>
        </div>
      )}

      {/* Frequent purchases — quick reorder */}
      {frequentProducts.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-700 dark:text-foreground/80 mb-2 flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-emerald-500" />
            Tus más comprados
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {frequentProducts.map((p) => (
              <div key={`${p.productId ?? p.name}-${p.qty}`} className="min-w-30 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-2.5 flex flex-col items-center shrink-0">
                {p.image && <Image src={p.image} alt={p.name} width={48} height={48} className="w-12 h-12 rounded-lg object-cover mb-1.5" />}
                <p className="text-xs font-medium text-gray-700 dark:text-foreground/80 text-center truncate w-full">{p.name}</p>
                <p className="text-xs text-gray-400 dark:text-muted">{p.qty}x comprado</p>
                <button onClick={() => {
                  if (p.productId && p.price) addItem({ id: p.productId, name: p.name, price: p.price, image: p.image, unit: p.unit, category: "" });
                }} className="mt-1.5 w-full py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-1">
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-gray-400" />
        {["todos", "pendiente", "confirmado", "en_camino", "entregado", "cancelado"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg font-medium transition-colors",
              statusFilter === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-card text-gray-500 dark:text-muted hover:bg-gray-200"
            )}>
            {s === "todos" ? "Todos" : STATUS_MAP[s as Order["status"]]?.label ?? s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} message="No hay pedidos con este filtro" />
        ) : (
          filtered.map((o, i) => <OrderCard key={o.id || `order-${i}`} order={o} onReorder={onReorder} />)
        )}
      </div>
    </div>
  );
}

/* ── OrderCard ───────────────────────────────────────────────────── */

function OrderCard({ order: o, highlight, onReorder }: { order: Order; highlight?: boolean; onReorder?: (items: OrderItem[]) => void }) {
  const [open, setOpen] = useState(false);
  const st = STATUS_MAP[o.status] ?? STATUS_MAP.pendiente;
  const StIcon = st.icon;
  const safeItems = o.items ?? [];

  return (
    <div className={cn("bg-white dark:bg-card rounded-xl border transition-colors", highlight ? "border-indigo-200 dark:border-indigo-700 shadow-sm" : "border-gray-100 dark:border-card-border")}>
      <div onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3.5 cursor-pointer">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", st.color)}>
          <StIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate">
              {safeItems.length} producto{safeItems.length > 1 ? "s" : ""}
            </p>
            <span className="text-xs font-bold text-gray-900 dark:text-foreground ml-2 shrink-0">{fmt(o.total)}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", st.color)}>{st.label}</span>
            <span className="text-xs text-gray-300 dark:text-muted">{fmtDate(o.createdAt)}</span>
            {o.paymentMethod && <span className="text-xs text-gray-300 dark:text-muted capitalize">{o.paymentMethod}</span>}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform", open && "rotate-180")} />
        {/* One-click reorder — visible without expanding */}
        {o.status !== "cancelado" && onReorder && (
          <button
            onClick={(e) => { e.stopPropagation(); onReorder(safeItems); }}
            title="Volver a pedir"
            className="ml-1 p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-gray-50 dark:border-card-border pt-2.5 space-y-2.5">
          {/* Order tracking timeline */}
          {o.status !== "cancelado" && (
            <OrderTimeline status={o.status} />
          )}

          {safeItems.map((item) => (
            <div key={`${o.id}-${item.productId ?? item.name}-${item.quantity}`} className="flex items-center gap-2.5 text-xs">
              {item.image && (
                <Image src={item.image} alt={item.name} width={32} height={32} className="w-8 h-8 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 dark:text-foreground/80 truncate">{item.name}</p>
                <p className="text-gray-400 dark:text-muted">{item.quantity} {item.unit} &times; {fmt(item.price)}</p>
              </div>
              <p className="font-semibold text-gray-700 dark:text-foreground/80 shrink-0">{fmt((item.price ?? 0) * item.quantity)}</p>
            </div>
          ))}
          <div className="flex justify-between pt-1.5 border-t border-gray-50 dark:border-card-border text-xs">
            <span className="text-gray-400 dark:text-muted">Total</span>
            <span className="font-bold text-gray-900 dark:text-foreground">{fmt(o.total)}</span>
          </div>
          <div className="flex gap-2 pt-1">
            {["pendiente", "confirmado", "en_camino"].includes(o.status) && (
              <Link href={`/pedido/${o.id}`}
                className="flex-1 text-center text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg py-2 hover:bg-indigo-100 transition-colors">
                Seguir pedido en vivo
              </Link>
            )}
            {o.status !== "cancelado" && onReorder && (
              <button onClick={() => onReorder(safeItems)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/5 rounded-lg py-2 hover:bg-primary/10 transition-colors">
                <RotateCcw className="h-3 w-3" /> Volver a pedir
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 2: LISTAS DE COMPRAS
   ══════════════════════════════════════════════════════════════════ */

function ListasTab({ phone }: { phone: string }) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { addMultiple } = useCart();

  useEffect(() => {
    const clean = phone.replace(/\D/g, "");
    Promise.all([
      fetch(`/api/shopping-lists?phone=${encodeURIComponent(clean)}`).then(r => r.ok ? r.json() : []),
      fetch("/api/products").then(r => r.ok ? r.json() : []),
    ]).then(([listsData, prodsData]) => {
      startTransition(() => {
        setLists(listsData);
        setProducts(Array.isArray(prodsData) ? prodsData : []);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, [phone]);

  const createList = async () => {
    if (!newName.trim()) return;
    const clean = phone.replace(/\D/g, "");
    const res = await fetch("/api/shopping-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerPhone: clean, name: newName.trim(), items: [] }),
    });
    if (res.ok) {
      const list: ShoppingList = await res.json();
      startTransition(() => { setLists(prev => [list, ...prev]); setCreating(false); setNewName(""); setEditingId(list.id); });
    }
  };

  const deleteList = async (id: string) => {
    await fetch(`/api/shopping-lists/${id}`, { method: "DELETE" });
    startTransition(() => setLists(prev => prev.filter(l => l.id !== id)));
  };

  const addProductToList = async (listId: string, productId: number) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const existing = list.items.find(i => i.productId === productId);
    const newItems = existing
      ? list.items.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i)
      : [...list.items, { id: 0, productId, quantity: 1 }];
    const res = await fetch(`/api/shopping-lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: newItems.map(i => ({ productId: i.productId, quantity: i.quantity })) }),
    });
    if (res.ok) {
      const updated: ShoppingList = await res.json();
      startTransition(() => setLists(prev => prev.map(l => l.id === listId ? updated : l)));
    }
  };

  const removeProductFromList = async (listId: string, productId: number) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const newItems = list.items.filter(i => i.productId !== productId);
    const res = await fetch(`/api/shopping-lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: newItems.map(i => ({ productId: i.productId, quantity: i.quantity })) }),
    });
    if (res.ok) {
      const updated: ShoppingList = await res.json();
      startTransition(() => setLists(prev => prev.map(l => l.id === listId ? updated : l)));
    }
  };

  const addAllToCart = (list: ShoppingList) => {
    const cartItems = list.items
      .map(item => {
        const prod = products.find(p => p.id === item.productId);
        return prod ? { product: prod, quantity: item.quantity } : null;
      })
      .filter((x): x is { product: Product; quantity: number } => x !== null);
    if (cartItems.length > 0) addMultiple(cartItems);
  };

  const getProduct = (id: number) => products.find(p => p.id === id);
  const filteredProducts = searchQ.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 8)
    : [];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
          <ListChecks className="h-4 w-4 text-primary" />
          Mis Listas ({lists.length})
        </h3>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nueva lista
        </button>
      </div>

      {creating && (
        <div className="bg-white dark:bg-card rounded-xl border border-primary/20 p-4 space-y-3">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Nombre de la lista (ej: Compras semanales)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border dark:bg-background dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus onKeyDown={e => e.key === "Enter" && createList()} />
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setNewName(""); }}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={createList} disabled={!newName.trim()}
              className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary-dark transition-colors">
              Crear
            </button>
          </div>
        </div>
      )}

      {lists.length === 0 && !creating ? (
        <EmptyState icon={ListChecks} message="Aún no tienes listas de compras" action="Crea tu primera lista para organizar tus compras" />
      ) : (
        lists.map(list => (
          <div key={list.id} className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
            <div className="flex items-center justify-between p-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">{list.name}</p>
                <p className="text-xs text-gray-400 dark:text-muted">
                  {list.items.length} producto{list.items.length !== 1 ? "s" : ""} &middot; {fmtDate(list.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {list.items.length > 0 && (
                  <button onClick={() => addAllToCart(list)}
                    className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                    <ShoppingCart className="h-3 w-3" /> Al carrito
                  </button>
                )}
                <button onClick={() => setEditingId(editingId === list.id ? null : list.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteList(list.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {list.items.length > 0 && (
              <div className="border-t border-gray-50 dark:border-card-border px-3.5 py-2 space-y-1">
                {list.items.map(item => {
                  const prod = getProduct(item.productId);
                  return (
                    <div key={item.productId} className="flex items-center gap-2 text-xs py-1">
                      {prod?.image && (
                        <Image src={prod.image} alt={prod.name} width={28} height={28} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                      )}
                      <span className="flex-1 text-gray-700 dark:text-foreground/80 truncate">{prod?.name ?? `Producto #${item.productId}`}</span>
                      <span className="text-gray-400 dark:text-muted">&times;{item.quantity}</span>
                      {prod && <span className="font-semibold text-gray-700 dark:text-foreground/80">{fmt((prod.price ?? 0) * item.quantity)}</span>}
                      {editingId === list.id && (
                        <button onClick={() => removeProductFromList(list.id, item.productId)}
                          className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {editingId === list.id && (
              <div className="border-t border-gray-50 dark:border-card-border p-3.5 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    placeholder="Buscar producto para agregar..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border dark:bg-background dark:text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                {filteredProducts.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button key={p.id} onClick={() => { addProductToList(list.id, p.id); setSearchQ(""); }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-primary/5 text-left transition-colors">
                        <Image src={p.image} alt={p.name} width={24} height={24} className="w-6 h-6 rounded object-cover shrink-0" />
                        <span className="text-xs text-gray-700 dark:text-foreground/80 flex-1 truncate">{p.name}</span>
                        <span className="text-xs font-semibold text-primary">{fmt(p.price)}</span>
                        <Plus className="h-3 w-3 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 3: PUNTOS DE LEALTAD
   ══════════════════════════════════════════════════════════════════ */

function PuntosTab({ loyalty, orders }: { loyalty: LoyaltyData | null; orders: Order[] }) {
  if (!loyalty) return <EmptyState icon={Award} message="No hay datos de lealtad disponibles" />;

  const style = TIER_STYLES[loyalty.loyaltyTier ?? "bronce"] ?? TIER_STYLES.bronce;
  const safeTiers = loyalty.tiers ?? [];
  const currentIdx = safeTiers.findIndex(t => t.name === (loyalty.loyaltyTier ?? "bronce"));
  const nextTier = safeTiers[currentIdx + 1];
  const safeTotalSpent = loyalty.totalSpent ?? 0;
  const progress = nextTier ? Math.min((safeTotalSpent / (nextTier.minSpent || 1)) * 100, 100) : 100;
  const safeOrders = orders ?? [];
  const deliveredOrders = safeOrders.filter(o => o && o.status === "entregado").slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Premium loyalty card — physical card design */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-xl select-none"
        style={{ background: style.inlineGradient, aspectRatio: "1.586 / 1" }}
      >
        {/* Shimmer sweep */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)",
            animation: "shimmer 3s infinite",
          }}
        />
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20 bg-white" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full opacity-10 bg-white" />

        <div className="relative h-full p-5 flex flex-col justify-between text-white">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase opacity-70">Bodega San Martín</p>
              <p className="text-base font-bold tracking-wide capitalize mt-0.5">{loyalty?.loyaltyTier ?? "bronce"}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              {/* Tier icon */}
              {(loyalty?.loyaltyTier ?? "bronce") === "diamante" ? (
                <Sparkles className="h-9 w-9 opacity-80 drop-shadow" />
              ) : (loyalty?.loyaltyTier ?? "bronce") === "oro" ? (
                <Star className="h-9 w-9 opacity-80 drop-shadow fill-current" />
              ) : (
                <Award className="h-9 w-9 opacity-80 drop-shadow" />
              )}
            </div>
          </div>

          {/* Card number / phone */}
          <div>
            <p className="text-xs opacity-60 tracking-widest font-mono">
              {(() => {
                const phone = loyalty?.phone ?? "";
                if (typeof phone !== "string" || phone.length === 0) return "•••• •••• ••••";
                return "•••• •••• " + phone.slice(-4).padStart(4, "•");
              })()}
            </p>
          </div>

          {/* Bottom row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Titular</p>
              <p className="text-sm font-semibold truncate max-w-35">{loyalty.name ?? "Cliente"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest opacity-60">Puntos</p>
              <p className="text-3xl font-black tabular-nums leading-none">{(loyalty.loyaltyPoints ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
      {/* Shimmer keyframes (injected once) */}
      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>

      {/* Progress + tiers panel */}
      <div className={cn("rounded-2xl border overflow-hidden", style.border, style.bg)}>
        <div className="p-5 space-y-3">
          {nextTier ? (
            <>
              <div className="flex justify-between text-xs">
                <span className={cn("font-medium", style.text)}>
                  Progreso a <span className="font-bold capitalize">{nextTier.name ?? "siguiente nivel"}</span>
                </span>
                <span className="font-bold text-gray-700 dark:text-foreground">{fmt(safeTotalSpent)} / {fmt(nextTier.minSpent ?? 0)}</span>
              </div>
              <div className="h-3 bg-white/60 dark:bg-white/20 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all")} style={{ width: `${progress}%`, background: style.inlineGradient }} />
              </div>
              <p className="text-xs text-gray-500 dark:text-muted">
                Te falta {fmt((nextTier.minSpent ?? 0) - safeTotalSpent)} para subir a {nextTier.name ?? "siguiente nivel"}
              </p>
            </>
          ) : (
            <p className={cn("text-sm font-medium", style.text)}>
              &iexcl;Estás en el nivel más alto! Gracias por tu preferencia.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            {safeTiers.map((t, i) => {
              const isCurrent = t.name === (loyalty?.loyaltyTier ?? "bronce");
              const isPast = i < currentIdx;
              return (
                <div key={`${t.name ?? "tier"}-${i}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all",
                    isCurrent ? "bg-white dark:bg-card shadow-sm border border-gray-100 dark:border-card-border font-bold" : isPast ? "opacity-60" : "opacity-40"
                  )}>
                  {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="capitalize flex-1">{t.name ?? "nivel"}</span>
                  <span className="text-gray-400 dark:text-muted">{i === 0 ? "Inicio" : fmt(t.minSpent ?? 0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
          <Gift className="h-4 w-4 text-primary" /> Beneficios de tu nivel
        </h3>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <BenefitRow tier={loyalty?.loyaltyTier ?? "bronce"} benefit="Acumula puntos por cada compra" always />
          <BenefitRow tier={loyalty?.loyaltyTier ?? "bronce"} benefit="Descuentos exclusivos en productos seleccionados" minTier="plata" />
          <BenefitRow tier={loyalty?.loyaltyTier ?? "bronce"} benefit="Delivery prioritario" minTier="oro" />
          <BenefitRow tier={loyalty?.loyaltyTier ?? "bronce"} benefit="Acceso anticipado a ofertas" minTier="oro" />
          <BenefitRow tier={loyalty?.loyaltyTier ?? "bronce"} benefit="Regalos en fechas especiales" minTier="diamante" />
        </div>
      </div>

      {/* Recent activity */}
      {deliveredOrders.length > 0 && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
            <Star className="h-4 w-4 text-amber-500" /> Actividad reciente
          </h3>
          <div className="space-y-2">
            {deliveredOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs py-1">
                <div>
                  <p className="text-gray-700 dark:text-foreground/80">Compra {fmtDate(o.createdAt)}</p>
                  <p className="text-gray-400 dark:text-muted">{(o.items ?? []).length} productos</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">+{Math.floor(o.total ?? 0)} pts</p>
                  <p className="text-gray-400 dark:text-muted">{fmt(o.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BenefitRow({ tier, benefit, minTier, always }: { tier: string; benefit: string; minTier?: string; always?: boolean }) {
  const tierOrder = ["bronce", "plata", "oro", "diamante"];
  const unlocked = always || tierOrder.indexOf(tier) >= tierOrder.indexOf(minTier ?? "bronce");
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", unlocked ? "bg-primary/5" : "bg-gray-50 dark:bg-background opacity-50")}>
      {unlocked ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> : <Clock className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
      <span className={unlocked ? "text-gray-700 dark:text-foreground/80" : "text-gray-400 dark:text-muted"}>{benefit}</span>
      {!always && !unlocked && <span className="ml-auto text-xs text-gray-400 capitalize shrink-0">{minTier}</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: FAVORITOS
   ══════════════════════════════════════════════════════════════════ */

function FavoritosTab() {
  const { toggle, isFavorite } = useFavorites();
  const { addItem } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("todos");

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.ok ? r.json() : [])
      .then((data: Product[]) => startTransition(() => { setProducts(Array.isArray(data) ? data : []); setLoading(false); }))
      .catch(() => setLoading(false));
  }, []);

  const favProducts = products.filter(p => isFavorite(String(p.id)));
  const categories = ["todos", ...new Set(favProducts.map(p => p.category))];
  const filtered = catFilter === "todos" ? favProducts : favProducts.filter(p => p.category === catFilter);

  if (loading) return <LoadingState />;

  if (favProducts.length === 0) {
    return (
      <EmptyState icon={Heart} message="Aún no tienes productos favoritos"
        action="Marca productos con ❤️ en la tienda para verlos aquí" />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
          <Heart className="h-4 w-4 text-red-400" /> Mis Favoritos ({favProducts.length})
        </h3>
        <Link href="/#productos" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          Ver tienda <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {categories.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={cn("text-xs px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap",
                catFilter === cat ? "bg-primary text-white" : "bg-gray-100 dark:bg-card text-gray-500 dark:text-muted hover:bg-gray-200")}>
              {cat === "todos" ? "Todos" : cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map(product => (
          <div key={product.id} className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden group">
            <div className="aspect-square relative bg-gray-50">
              <Image src={product.image} alt={product.name} fill className="object-cover" sizes="(max-width: 640px) 50vw, 200px" />
              <button onClick={() => toggle(String(product.id))}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 dark:bg-card/90 flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
                <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" />
              </button>
              {product.badge && (
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-md">
                  {product.badge}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="text-xs font-medium text-gray-700 dark:text-foreground/80 truncate">{product.name}</p>
              <p className="text-[10px] text-gray-400 dark:text-muted capitalize">{product.category}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-primary">{fmt(product.price)}</span>
                <button onClick={() => addItem({ id: product.id, name: product.name, price: product.price, image: product.image, unit: product.unit, category: product.category })}
                  className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-red-50/50 dark:bg-red-900/10 rounded-xl p-3.5 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-gray-700 dark:text-foreground/80">Tus favoritos, siempre a mano</p>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
            Agrega productos favoritos desde la tienda tocando el ícono de corazón.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 4: OFERTAS Y PROMOCIONES
   ══════════════════════════════════════════════════════════════════ */

function OfertasTab() {
  const { promotions } = usePromotions();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);

  useEffect(() => {
    fetch("/api/bundles?active=true")
      .then(r => r.ok ? r.json() : [])
      .then((data: Bundle[]) => startTransition(() => { setBundles(data); setLoadingBundles(false); }))
      .catch(() => setLoadingBundles(false));
  }, []);

  const activePromos = promotions.filter(p => p.active);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5 mb-3">
          <Percent className="h-4 w-4 text-red-500" /> Promociones activas
        </h3>
        {activePromos.length === 0 ? (
          <EmptyState icon={Percent} message="No hay promociones activas ahora" action="Vuelve pronto para ver nuevas ofertas" />
        ) : (
          <div className="space-y-3">
            {activePromos.map(promo => (
              <div key={promo.id} className="bg-linear-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl border border-red-100 dark:border-red-800/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
                  -{promo.discountPercent}%
                </div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-foreground pr-16">{promo.name}</h4>
                {promo.description && <p className="text-xs text-gray-600 dark:text-muted mt-1">{promo.description}</p>}
                {promo.message && <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-2">{promo.message}</p>}
                <div className="flex items-center gap-3 mt-3 text-xs flex-wrap">
                  {promo.minPurchase && <span className="text-gray-500 dark:text-muted">Compra mínima: {fmt(promo.minPurchase)}</span>}
                  {promo.expiresAt && <span className="text-gray-400 dark:text-muted">Válido hasta {fmtDate(promo.expiresAt)}</span>}
                  {promo.targetType === "specific" && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">Exclusivo para ti</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5 mb-3">
          <Gift className="h-4 w-4 text-purple-500" /> Combos y paquetes
        </h3>
        {loadingBundles ? <LoadingState /> : bundles.length === 0 ? (
          <EmptyState icon={Gift} message="No hay combos disponibles ahora" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {bundles.map(bundle => (
              <div key={bundle.id} className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
                {bundle.image && (
                  <div className="aspect-video relative bg-gray-100">
                    <Image src={bundle.image} alt={bundle.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
                  </div>
                )}
                <div className="p-3.5">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-foreground">{bundle.name}</h4>
                  {bundle.description && <p className="text-xs text-gray-500 dark:text-muted mt-0.5">{bundle.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold text-primary">{fmt(bundle.price)}</span>
                    <span className="text-xs text-gray-400 dark:text-muted">{bundle.items.length} productos</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-primary/5 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-600 dark:text-muted">
          Las promociones se aplican automáticamente en el checkout cuando cumples los requisitos.
        </p>
        <Link href="/#productos" className="inline-flex mt-2 text-xs font-semibold text-primary hover:underline">
          Ir a comprar &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB: RESEÑAS
   ══════════════════════════════════════════════════════════════════ */

type ReviewData = { id: string; name: string; location: string; text: string; rating: number; phone?: string | null; date: string };

function ResenasTab({ phone, orders }: { phone: string; orders: Order[] }) {
  const { customer } = useCustomer();
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/reviews")
      .then(r => r.ok ? r.json() : [])
      .then((data: ReviewData[]) => {
        const clean = phone.replace(/\D/g, "");
        const mine = (data ?? []).filter(r => r.phone === clean);
        startTransition(() => { setReviews(mine); setLoading(false); });
      })
      .catch(() => setLoading(false));
  }, [phone]);

  const safeOrders = orders ?? [];
  const deliveredOrders = safeOrders.filter(o => o.status === "entregado");
  const canReview = deliveredOrders.length > reviews.length;

  const submitReview = async () => {
    if (text.trim().length < 10) return;
    setSubmitting(true);
    const clean = phone.replace(/\D/g, "");
    const body = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: customer?.name ?? "Cliente",
      location: customer?.location ?? "Pucallpa",
      text: text.trim(),
      rating,
      phone: clean,
      date: new Date().toISOString(),
    };
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const review: ReviewData = await res.json();
      startTransition(() => {
        setReviews(prev => [review, ...prev]);
        setText("");
        setRating(5);
        setWriting(false);
        setSuccess("¡Gracias por tu reseña!");
      });
      setTimeout(() => setSuccess(""), 3000);
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700/30 p-3.5 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          <ThumbsUp className="h-4 w-4" /> {success}
        </div>
      )}

      {/* Write review CTA */}
      {canReview && !writing && (
        <div className="bg-linear-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl border border-amber-100 dark:border-amber-800/30 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-foreground">¿Te gustó tu compra?</p>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                Tienes {deliveredOrders.length} pedido{deliveredOrders.length !== 1 ? "s" : ""} entregado{deliveredOrders.length !== 1 ? "s" : ""}. ¡Cuéntanos tu experiencia!
              </p>
              <button onClick={() => setWriting(true)}
                className="mt-2.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors flex items-center gap-1.5">
                <Pencil className="h-3 w-3" /> Escribir reseña
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review form */}
      {writing && (
        <div className="bg-white dark:bg-card rounded-xl border border-primary/20 p-4 space-y-3">
          <h4 className="text-sm font-bold text-gray-900 dark:text-foreground">Tu reseña</h4>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                className="p-0.5 transition-transform hover:scale-110">
                <Star className={cn("h-6 w-6 transition-colors", n <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-gray-600")} />
              </button>
            ))}
            <span className="text-xs text-gray-400 dark:text-muted ml-2">{rating}/5</span>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 500))}
            placeholder="Cuéntanos tu experiencia... (mínimo 10 caracteres)"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border dark:bg-background dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{text.length}/500</span>
            <span>{customer?.name ?? "Cliente"} &middot; {customer?.location ?? "Pucallpa"}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setWriting(false); setText(""); setRating(5); }}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={submitReview} disabled={text.trim().length < 10 || submitting}
              className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* My reviews */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5 mb-3">
          <MessageSquare className="h-4 w-4 text-primary" /> Mis Reseñas ({reviews.length})
        </h3>
        {reviews.length === 0 ? (
          <EmptyState icon={MessageSquare} message="Aún no has escrito reseñas"
            action="Comparte tu experiencia después de recibir un pedido" />
        ) : (
          <div className="space-y-2.5">
            {reviews.map(r => (
              <div key={r.id} className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "text-amber-400 fill-amber-400" : "text-gray-200")} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-muted">{fmtDate(r.date)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-foreground/80">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-primary/5 rounded-xl p-3.5 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 dark:text-muted">
          Tus reseñas ayudan a otros clientes y nos motivan a mejorar. ¡Gracias por compartir!
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 5: MI PERFIL
   ══════════════════════════════════════════════════════════════════ */

function PerfilTab({ loyalty, onLogout }: { loyalty: LoyaltyData | null; onLogout: () => void }) {
  const { customer, register, clear, openModal } = useCustomer();
  const { count: favCount } = useFavorites();

  if (!customer) {
    return <EmptyState icon={User} message="No se encontró tu perfil" action="Regístrate para guardar tus datos" />;
  }

  const locations: SavedLocation[] = customer.locations?.length
    ? customer.locations
    : [{ id: "default", location: customer.location, reference: customer.reference }];
  const activeId = customer.activeLocationId ?? locations[0]?.id ?? "default";

  const setActiveLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;
    register({ ...customer, location: loc.location, reference: loc.reference, activeLocationId: id });
  };

  const deleteLocation = (id: string) => {
    if (locations.length <= 1) return;
    const updated = locations.filter(l => l.id !== id);
    const newActive = id === activeId ? updated[0].id : activeId;
    const activeLoc = updated.find(l => l.id === newActive)!;
    register({ ...customer, location: activeLoc.location, reference: activeLoc.reference, locations: updated, activeLocationId: newActive });
  };

  return (
    <div className="space-y-4">
      {/* Profile info */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900 dark:text-foreground">{customer.name}</p>
            {customer.phone && (
              <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1">
                <Phone className="h-3 w-3" /> {customer.phone}
              </p>
            )}
            {loyalty && (
              <p className="text-xs text-primary font-semibold capitalize mt-0.5 flex items-center gap-1">
                <Award className="h-3 w-3" /> Nivel {loyalty.loyaltyTier ?? "bronce"} &middot; {loyalty.loyaltyPoints ?? 0} puntos
              </p>
            )}
          </div>
          <button onClick={() => openModal("profile")}
            className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 text-center">
          <Heart className="h-5 w-5 text-red-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-foreground">{favCount}</p>
          <p className="text-xs text-gray-400 dark:text-muted">Favoritos</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 text-center">
          <MapPin className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-gray-900 dark:text-foreground">{locations.length}</p>
          <p className="text-xs text-gray-400 dark:text-muted">Direcciones</p>
        </div>
      </div>

      {/* Saved addresses */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-50 dark:border-card-border">
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> Mis direcciones
          </h3>
          <button onClick={() => openModal("profile")}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-card-border">
          {locations.map(loc => (
            <div key={loc.id} className={cn("flex items-start gap-3 p-4 transition-colors", loc.id === activeId && "bg-primary/5")}>
              <button onClick={() => setActiveLocation(loc.id)}
                className={cn("mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  loc.id === activeId ? "border-primary bg-primary" : "border-gray-300 dark:border-gray-500 hover:border-primary")}>
                {loc.id === activeId && <CheckCircle2 className="h-3 w-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-foreground/80">{loc.location}</p>
                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{loc.reference}</p>
                {loc.id === activeId && <span className="text-xs font-semibold text-primary mt-1 inline-block">Dirección activa</span>}
              </div>
              {locations.length > 1 && (
                <button onClick={() => deleteLocation(loc.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Favorites */}
      {favCount > 0 && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5 mb-2">
            <Heart className="h-4 w-4 text-red-400" /> Productos favoritos
          </h3>
          <p className="text-xs text-gray-500 dark:text-muted mb-2">
            Tienes {favCount} productos marcados como favoritos.
          </p>
          <Link href="/#productos" className="inline-flex text-xs font-semibold text-primary hover:underline">
            Ver en la tienda &rarr;
          </Link>
        </div>
      )}

      {/* Notification Preferences */}
      <NotificationPrefs />

      {/* Spending Overview */}
      {loyalty && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Resumen de gastos
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{fmt(loyalty.totalSpent)}</p>
              <p className="text-xs text-gray-400 dark:text-muted">Total gastado</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-primary">{loyalty.loyaltyPoints ?? 0}</p>
              <p className="text-xs text-gray-400 dark:text-muted">Puntos acumulados</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-50 dark:border-card-border">
            <p className="text-xs text-gray-500 dark:text-muted text-center">
              Nivel <span className="font-bold text-primary capitalize">{loyalty.loyaltyTier ?? "bronce"}</span> &middot; {
                (loyalty.tiers ?? [])[((loyalty.tiers ?? []).findIndex(t => t.name === (loyalty.loyaltyTier ?? "bronce")) + 1)]
                  ? `${fmt((loyalty.tiers ?? [])[((loyalty.tiers ?? []).findIndex(t => t.name === (loyalty.loyaltyTier ?? "bronce")) + 1)].minSpent - (loyalty.totalSpent ?? 0))} para el siguiente nivel`
                  : "¡Nivel máximo alcanzado!"
              }
            </p>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="text-center pt-2">
        <button onClick={() => { clear(); onLogout(); }}
          className="text-xs text-red-500 font-semibold hover:underline">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ── Shared Components ───────────────────────────────────────────── */

/* ── Order Tracking Timeline ─────────────────────────────────────── */

const ORDER_STEPS: { status: Order["status"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "pendiente", label: "Recibido", icon: Clock },
  { status: "confirmado", label: "Confirmado", icon: CheckCircle2 },
  { status: "en_camino", label: "En camino", icon: Truck },
  { status: "entregado", label: "Entregado", icon: Package },
];

function OrderTimeline({ status }: { status: Order["status"] }) {
  const currentIdx = ORDER_STEPS.findIndex(s => s.status === status);

  return (
    <div className="flex items-center justify-between mb-2 px-1">
      {ORDER_STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const isActive = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.status} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                isCurrent ? "bg-primary text-white shadow-sm shadow-primary/30" :
                isActive ? "bg-primary/20 text-primary" : "bg-gray-100 dark:bg-card text-gray-300 dark:text-gray-600"
              )}>
                <StepIcon className="h-3.5 w-3.5" />
              </div>
              <span className={cn("text-[10px] mt-1 font-medium text-center",
                isCurrent ? "text-primary" : isActive ? "text-gray-600 dark:text-foreground/60" : "text-gray-300 dark:text-gray-600")}>
                {step.label}
              </span>
            </div>
            {i < ORDER_STEPS.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-1 rounded-full transition-colors -mt-3.5",
                i < currentIdx ? "bg-primary/40" : "bg-gray-100 dark:bg-card-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Notification Preferences ────────────────────────────────────── */

function NotificationPrefs() {
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === "undefined") return { orderUpdates: true, promotions: true, restock: false };
    try {
      const raw = localStorage.getItem("bsm-notif-prefs");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { orderUpdates: true, promotions: true, restock: false };
  });

  const togglePref = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    localStorage.setItem("bsm-notif-prefs", JSON.stringify(next));
  };

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
      <div className="p-4 border-b border-gray-50 dark:border-card-border">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-1.5">
          <Bell className="h-4 w-4 text-primary" /> Notificaciones
        </h3>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-card-border">
        <NotifToggle label="Actualizaciones de pedidos" desc="Recibe alertas cuando tu pedido cambie de estado" enabled={prefs.orderUpdates} onToggle={() => togglePref("orderUpdates")} />
        <NotifToggle label="Promociones y ofertas" desc="Entérate de descuentos y ofertas exclusivas" enabled={prefs.promotions} onToggle={() => togglePref("promotions")} />
        <NotifToggle label="Productos de vuelta en stock" desc="Avísame cuando un producto favorito esté disponible" enabled={prefs.restock} onToggle={() => togglePref("restock")} />
      </div>
    </div>
  );
}

function NotifToggle({ label, desc, enabled, onToggle }: { label: string; desc: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-foreground/80 font-medium">{label}</p>
        <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{desc}</p>
      </div>
      <button onClick={onToggle}
        className={cn("relative w-10 h-5.5 rounded-full transition-colors shrink-0",
          enabled ? "bg-primary" : "bg-gray-200 dark:bg-gray-600")}
        style={{ height: "22px" }}>
        <span className={cn("absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-5" : "translate-x-0.5")}
          style={{ width: "18px", height: "18px" }} />
      </button>
    </div>
  );
}

/* ── Empty & Loading States ──────────────────────────────────────── */

function EmptyState({ icon: Icon, message, action }: { icon: React.ComponentType<{ className?: string }>; message: string; action?: string }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-8 text-center">
      <Icon className="h-10 w-10 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-500 dark:text-muted">{message}</p>
      {action && <p className="text-xs text-gray-400 dark:text-muted mt-1">{action}</p>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
    </div>
  );
}
