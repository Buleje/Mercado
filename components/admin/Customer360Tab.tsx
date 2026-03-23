"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User, Phone, MapPin, Calendar, ShoppingCart, TrendingUp,
  CreditCard, Clock, Heart, MessageSquare, Package, Star,
  CheckCircle, XCircle, Truck, AlertCircle, Loader2, Save,
  MessageCircle, Bell, ShoppingBag, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type CustomerData = {
  name: string;
  phone: string;
  location?: string;
  reference?: string;
  birthday?: string | null;
};

type OrderItem = { name: string; quantity: number; unit: string; price: number };

type Order = {
  id: string;
  status: string;
  total: number;
  paymentMethod: string;
  items: OrderItem[];
  createdAt: string;
};

type TimelineEvent = {
  id: string;
  type: "order" | "notification" | "review" | "sale" | "in-app";
  icon: string;
  title: string;
  detail: string;
  date: string;
  meta?: Record<string, unknown>;
};

type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

function getSegment(orders: Order[]): Segment {
  if (orders.length === 0) return "nuevo";
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastDays = Math.floor((Date.now() - new Date(sorted[0].createdAt).getTime()) / 86400000);
  if (lastDays > 90) return "perdido";
  if (orders.length >= 5) return "frecuente";
  if (orders.length >= 2) return "ocasional";
  return "nuevo";
}

function getTopProducts(orders: Order[]): { name: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const o of orders) {
    for (const item of o.items) {
      map[item.name] = (map[item.name] ?? 0) + item.quantity;
    }
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("");
}

// ── Config ─────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string }> = {
  frecuente: { label: "Frecuente",  color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700" },
  ocasional: { label: "Ocasional",  color: "text-blue-700 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30",     border: "border-blue-300 dark:border-blue-700" },
  nuevo:     { label: "Nuevo",      color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-300 dark:border-violet-700" },
  perdido:   { label: "Perdido",    color: "text-red-700 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/30",       border: "border-red-300 dark:border-red-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  color: "text-amber-700 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/30",   Icon: Clock },
  confirmado: { label: "Confirmado", color: "text-blue-700 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30",     Icon: CheckCircle },
  en_camino:  { label: "En camino",  color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", Icon: Truck },
  entregado:  { label: "Entregado",  color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", Icon: CheckCircle },
  cancelado:  { label: "Cancelado",  color: "text-red-700 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/30",       Icon: XCircle },
};

const TIMELINE_ICON: Record<string, React.ElementType> = {
  "shopping-bag": ShoppingBag,
  "check": CheckCircle,
  "x": XCircle,
  "message-circle": MessageCircle,
  "bell": Bell,
  "star": Star,
};

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  phone: string;
  onClose?: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function Customer360Tab({ phone, onClose }: Props) {
  const [customer, setCustomer]   = useState<CustomerData | null>(null);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [timeline, setTimeline]   = useState<TimelineEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [notes, setNotes]         = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    setError(false);
    try {
      const [custRes, ordersRes, timelineRes] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(phone)}`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/orders`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/timeline`),
      ]);
      if (!custRes.ok) throw new Error("customer not found");
      const [custData, ordersData, timelineData] = await Promise.all([
        custRes.json(),
        ordersRes.ok ? ordersRes.json() : [],
        timelineRes.ok ? timelineRes.json() : [],
      ]);
      setCustomer(custData);
      setOrders(ordersData);
      setTimeline(timelineData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNotes = async () => {
    if (!phone) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateNotes: notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-400 dark:text-muted">Cargando perfil…</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="font-bold text-gray-700 dark:text-foreground">Cliente no encontrado</p>
        <p className="text-sm text-gray-400 dark:text-muted">No existe el número {phone}</p>
      </div>
    );
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const segment      = getSegment(orders);
  const segCfg       = SEGMENT_CONFIG[segment];
  const topProducts  = getTopProducts(orders);
  const totalSpent   = orders.reduce((s, o) => s + o.total, 0);
  const avgTicket    = orders.length > 0 ? totalSpent / orders.length : 0;
  const lastOrder    = orders.length > 0
    ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const firstOrder   = orders.length > 0
    ? [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Cliente 360°</h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-extrabold text-primary shrink-0 select-none">
            {getInitials(customer.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground truncate">{customer.name}</h3>
              <span className={cn("text-[10px] font-extrabold px-2 py-0.5 rounded-full border", segCfg.bg, segCfg.color, segCfg.border)}>
                {segCfg.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-muted">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>
              {customer.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {customer.location}</span>}
              {customer.birthday && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {customer.birthday}</span>}
              {lastOrder && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Últ. pedido {fmtRelative(lastOrder.createdAt)}</span>}
            </div>
          </div>

          {/* WhatsApp CTA */}
          <a
            href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-bold transition-colors shrink-0"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total gastado",  value: fmt(totalSpent),        icon: CreditCard,   color: "text-emerald-500" },
          { label: "Pedidos",        value: String(orders.length),  icon: ShoppingCart, color: "text-blue-500" },
          { label: "Ticket prom.",   value: fmt(avgTicket),         icon: TrendingUp,   color: "text-violet-500" },
          { label: "Primera compra", value: firstOrder ? fmtDate(firstOrder.createdAt) : "—", icon: Calendar, color: "text-amber-500" },
        ].map(k => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 sm:p-4"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <k.icon className={cn("h-3.5 w-3.5", k.color)} />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">{k.label}</p>
            </div>
            <p className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-foreground">{k.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Productos favoritos */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500" /> Productos favoritos
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-muted">Sin compras registradas</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-gray-400 w-4 text-right">{i + 1}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-surface rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-primary/20 dark:bg-primary/30 rounded-full transition-all"
                      style={{ width: `${Math.min((p.count / (topProducts[0]?.count ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 dark:text-foreground truncate max-w-[120px]">{p.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">×{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Actividad reciente
          </h3>
          {timeline.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-muted">Sin actividad registrada</p>
          ) : (
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              {timeline.slice(0, 12).map((ev) => {
                const Icon = TIMELINE_ICON[ev.icon] ?? Bell;
                return (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate">{ev.title}</p>
                      <p className="text-[10px] text-gray-400 dark:text-muted truncate">{ev.detail}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtRelative(ev.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Historial de pedidos */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Historial de pedidos
          <span className="text-[10px] text-gray-400 font-normal ml-auto">{orders.length} total</span>
        </h3>
        {orders.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-muted py-4 text-center">Sin pedidos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-card-border">
                  <th className="pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pedido</th>
                  <th className="pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Fecha</th>
                  <th className="pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Items</th>
                  <th className="pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Total</th>
                  <th className="pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...orders]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10)
                  .map(o => {
                    const st = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pendiente;
                    const Icon = st.Icon;
                    return (
                      <tr key={o.id} className="border-t border-gray-50 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                        <td className="py-2 font-mono text-xs text-gray-500 dark:text-muted pr-2">#{o.id.slice(-6).toUpperCase()}</td>
                        <td className="py-2 text-xs text-gray-500 dark:text-muted">{fmtDate(o.createdAt)}</td>
                        <td className="py-2 text-xs text-gray-500 dark:text-muted">{o.items.length} prod.</td>
                        <td className="py-2 font-bold text-gray-900 dark:text-foreground text-right">{fmt(o.total)}</td>
                        <td className="py-2">
                          <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>
                            <Icon className="h-2.5 w-2.5" />{st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notas del vendedor */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Notas del vendedor
        </h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: Cliente prefiere pago con Yape. Pide factura."
          rows={3}
          className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-gray-50 dark:bg-surface text-gray-700 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between mt-2">
          <AnimatePresence>
            {notesSaved && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Guardado
              </motion.p>
            )}
          </AnimatePresence>
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes || !notes.trim()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Guardar nota
          </button>
        </div>
      </div>

    </div>
  );
}
