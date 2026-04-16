"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DollarSign, Download, Search, Eye, X,
  Phone, Clock, Calendar,
  ShieldAlert, Loader2, RefreshCw, AlertTriangle,
  CheckCircle, TrendingDown,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderRecord = {
  id: string;
  customer: { name: string; phone?: string; location?: string };
  items: { name: string; price: number; quantity: number }[];
  total: number;
  status: string;
  deuda?: boolean;
  paidAmount?: number;
  createdAt: string;
  notes?: string;
};

type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";

type DebtRecord = {
  id: string;
  customer: string;
  phone: string;
  orderRef: string;
  amount: number;
  paid: number;
  createdAt: string;
  daysOverdue: number;
  bucket: AgeBucket;
  status: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

function getBucket(days: number): AgeBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const BUCKET_META: Record<AgeBucket, { label: string; color: string; bg: string; border: string }> = {
  "0-30": { label: "0–30 días",  color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-800" },
  "31-60":{ label: "31–60 días", color: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-950/20",    border: "border-amber-200 dark:border-amber-800"   },
  "61-90":{ label: "61–90 días", color: "text-orange-700 dark:text-orange-400",  bg: "bg-orange-50 dark:bg-orange-950/20",  border: "border-orange-200 dark:border-orange-800" },
  "90+":  { label: ">90 días",   color: "text-red-700 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-950/20",        border: "border-red-200 dark:border-red-800"       },
};

function ordersToDebts(orders: OrderRecord[]): DebtRecord[] {
  const now = new Date();
  return orders
    .filter((o) => o.deuda || (o.status !== "entregado" && o.status !== "cancelado" && (o.paidAmount ?? 0) < o.total))
    .map((o) => {
      const created = new Date(o.createdAt);
      const daysOverdue = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      const paid = o.paidAmount ?? 0;
      return {
        id: o.id,
        customer: o.customer.name,
        phone: o.customer.phone ?? "",
        orderRef: `#${o.id.slice(-6).toUpperCase()}`,
        amount: o.total,
        paid,
        createdAt: o.createdAt,
        daysOverdue,
        bucket: getBucket(daysOverdue),
        status: o.status,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CollectionCenterTab() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBucket, setFilterBucket] = useState<AgeBucket | "todos">("todos");
  const [detail, setDetail] = useState<DebtRecord | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: OrderRecord[] | { orders?: OrderRecord[] }) => {
        const list = Array.isArray(data) ? data : (data?.orders ?? []);
        setOrders(list);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const debts = useMemo(() => ordersToDebts(orders), [orders]);

  const stats = useMemo(() => {
    const totalDebt = debts.reduce((s, d) => s + (d.amount - d.paid), 0);
    const overdue = debts.filter((d) => d.daysOverdue > 30).reduce((s, d) => s + (d.amount - d.paid), 0);
    const critical = debts.filter((d) => d.bucket === "90+").length;
    const collectedToday = orders
      .filter((o) => {
        const d = new Date(o.createdAt);
        const today = new Date();
        return d.toDateString() === today.toDateString() && (o.paidAmount ?? 0) > 0;
      })
      .reduce((s, o) => s + (o.paidAmount ?? 0), 0);
    return { totalDebt, overdue, critical, collectedToday };
  }, [debts, orders]);

  const byBucket = useMemo(() => {
    const map: Record<AgeBucket, { count: number; total: number }> = {
      "0-30": { count: 0, total: 0 },
      "31-60": { count: 0, total: 0 },
      "61-90": { count: 0, total: 0 },
      "90+": { count: 0, total: 0 },
    };
    debts.forEach((d) => {
      map[d.bucket].count++;
      map[d.bucket].total += d.amount - d.paid;
    });
    return map;
  }, [debts]);

  const filtered = useMemo(() => {
    let list = debts;
    if (filterBucket !== "todos") list = list.filter((d) => d.bucket === filterBucket);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) => d.customer.toLowerCase().includes(q) || d.orderRef.toLowerCase().includes(q)
      );
    }
    return list;
  }, [debts, filterBucket, search]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 dark:text-muted">Cargando cuentas por cobrar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500 dark:text-muted text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" /> Centro de Cobros
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            {debts.length} cuentas por cobrar activas de {orders.length} pedidos
          </p>
        </div>
        <button
          onClick={() =>
            exportToCSV(
              filtered.map((d) => ({
                cliente: d.customer,
                pedido: d.orderRef,
                monto: d.amount,
                pagado: d.paid,
                saldo: d.amount - d.paid,
                dias_mora: d.daysOverdue,
                tramo: BUCKET_META[d.bucket].label,
                estado: d.status,
              })),
              "centro-cobros"
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cartera total", value: fmt(stats.totalDebt), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: DollarSign },
          { label: "Vencido (+30d)", value: fmt(stats.overdue), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: Clock },
          { label: "Cobrado hoy", value: fmt(stats.collectedToday), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: CheckCircle },
          { label: "Crítico (+90d)", value: String(stats.critical), color: stats.critical > 0 ? "text-red-600" : "text-emerald-600", bg: stats.critical > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30", icon: ShieldAlert },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico de antigüedad */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">
          Antigüedad de cartera
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(BUCKET_META) as AgeBucket[]).map((b) => {
            const meta = BUCKET_META[b];
            const data = byBucket[b];
            const pct = stats.totalDebt > 0 ? (data.total / stats.totalDebt) * 100 : 0;
            return (
              <button
                key={b}
                onClick={() => setFilterBucket(filterBucket === b ? "todos" : b)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all hover:scale-[1.02]",
                  meta.bg,
                  meta.border,
                  filterBucket === b && "ring-2 ring-primary"
                )}
              >
                <p className={cn("text-xs font-bold", meta.color)}>{meta.label}</p>
                <p className={cn("text-lg font-extrabold mt-1", meta.color)}>{fmt(data.total)}</p>
                <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                  {data.count} deudor{data.count !== 1 ? "es" : ""} · {pct.toFixed(0)}%
                </p>
                <div className="mt-2 h-1.5 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-current opacity-70 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerta críticos */}
      {stats.critical > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <TrendingDown className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {stats.critical} cliente(s) con mora mayor a 90 días
            </p>
            <p className="text-xs text-red-600/80">Considera acciones legales o acuerdo de pago urgente</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente o pedido..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground"
          />
        </div>
        <select
          value={filterBucket}
          onChange={(e) => setFilterBucket(e.target.value as AgeBucket | "todos")}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground"
        >
          <option value="todos">Todos los tramos</option>
          {(Object.keys(BUCKET_META) as AgeBucket[]).map((b) => (
            <option key={b} value={b}>
              {BUCKET_META[b].label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-center">Días mora</th>
                <th className="px-4 py-3 text-center">Tramo</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const saldo = d.amount - d.paid;
                const meta = BUCKET_META[d.bucket];
                return (
                  <tr
                    key={d.id}
                    className={cn(
                      "border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20",
                      d.bucket === "90+" && "bg-red-50/50 dark:bg-red-950/10",
                      d.bucket === "61-90" && "bg-orange-50/30 dark:bg-orange-950/5"
                    )}
                  >
                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{d.customer}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-muted">{d.orderRef}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-muted">{fmt(d.amount)}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-red-600">{fmt(saldo)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-center font-bold",
                        d.daysOverdue <= 30
                          ? "text-emerald-600"
                          : d.daysOverdue <= 60
                          ? "text-amber-600"
                          : d.daysOverdue <= 90
                          ? "text-orange-600"
                          : "text-red-600"
                      )}
                    >
                      {d.daysOverdue}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          meta.bg,
                          meta.color
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.phone ? (
                        <a
                          href={`tel:${d.phone}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                        >
                          <Phone className="h-3 w-3" />
                          {d.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetail(d)}
                        className="text-primary hover:underline text-xs font-bold"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-muted text-sm">
                    {debts.length === 0
                      ? "No hay cuentas por cobrar pendientes. ¡Todos los clientes al día!"
                      : "No se encontraron registros con los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.customer}</h3>
                <p className="text-xs text-gray-400">{detail.orderRef}</p>
              </div>
              <button onClick={() => setDetail(null)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Monto original</p>
                <p className="font-bold text-gray-800 dark:text-foreground">{fmt(detail.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Pagado</p>
                <p className="font-bold text-emerald-600">{fmt(detail.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Saldo pendiente</p>
                <p className="font-extrabold text-red-600">{fmt(detail.amount - detail.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Días desde pedido</p>
                <p className={cn("font-extrabold", detail.daysOverdue > 30 ? "text-red-600" : "text-amber-600")}>
                  {detail.daysOverdue} días
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Tramo de antigüedad</p>
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", BUCKET_META[detail.bucket].bg, BUCKET_META[detail.bucket].color)}>
                  {BUCKET_META[detail.bucket].label}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Teléfono</p>
                <p className="font-bold text-gray-800 dark:text-foreground">{detail.phone || "—"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-card-border">
              {detail.phone && (
                <a
                  href={`https://wa.me/51${detail.phone.replace(/\D/g, "")}?text=Hola%20${encodeURIComponent(detail.customer)}%2C%20le%20recordamos%20su%20deuda%20pendiente%20de%20${fmt(detail.amount - detail.paid)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
              <a
                href={`tel:${detail.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs font-bold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
              >
                <Phone className="h-3.5 w-3.5" /> Llamar
              </a>
              <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <Calendar className="h-3 w-3" />
                {new Date(detail.createdAt).toLocaleDateString("es-PE")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
