"use client";

import { useState, useMemo } from "react";
import {
  Store, Download, Search, Eye, X,
  MessageSquare,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "procesando" | "en-transito" | "entregado" | "parcial";
type InvoiceStatus = "pendiente" | "pagado" | "vencido";

type SupplierPortalOrder = {
  id: string;
  orderRef: string;
  date: string;
  items: number;
  total: number;
  status: OrderStatus;
  estimatedDelivery: string;
  supplier: string;
};

type SupplierInvoice = {
  id: string;
  invoiceRef: string;
  date: string;
  dueDate: string;
  total: number;
  status: InvoiceStatus;
  supplier: string;
};

type SupplierMessage = {
  id: string;
  date: string;
  from: string;
  subject: string;
  read: boolean;
  supplier: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const ORDER_STATUS: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pendiente:    { label: "Pendiente",   color: "text-amber-600",    bg: "bg-amber-100 dark:bg-amber-900/30" },
  procesando:   { label: "Procesando",  color: "text-emerald-600",     bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "en-transito":{ label: "En tránsito", color: "text-violet-600",   bg: "bg-violet-100 dark:bg-violet-900/30" },
  entregado:    { label: "Entregado",   color: "text-emerald-600",  bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  parcial:      { label: "Entrega parcial", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30" },
};

const INV_STATUS: Record<InvoiceStatus, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "text-amber-600" },
  pagado:    { label: "Pagado",    color: "text-emerald-600" },
  vencido:   { label: "Vencido",   color: "text-red-600" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const ORDERS: SupplierPortalOrder[] = [];

const INVOICES: SupplierInvoice[] = [];

const MESSAGES: SupplierMessage[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierPortalTab() {
  const [view, setView] = useState<"pedidos" | "facturas" | "mensajes">("pedidos");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<SupplierPortalOrder | null>(null);

  const stats = useMemo(() => {
    const activeOrders = ORDERS.filter(o => !["entregado"].includes(o.status)).length;
    const pendingInvoices = INVOICES.filter(i => i.status === "pendiente").reduce((s, i) => s + i.total, 0);
    const overdueInvoices = INVOICES.filter(i => i.status === "vencido").length;
    const unreadMessages = MESSAGES.filter(m => !m.read).length;
    return { activeOrders, pendingInvoices, overdueInvoices, unreadMessages };
  }, []);

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return ORDERS;
    const q = search.toLowerCase();
    return ORDERS.filter(o => o.supplier.toLowerCase().includes(q) || o.orderRef.toLowerCase().includes(q));
  }, [search]);

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return INVOICES;
    const q = search.toLowerCase();
    return INVOICES.filter(i => i.supplier.toLowerCase().includes(q) || i.invoiceRef.toLowerCase().includes(q));
  }, [search]);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return MESSAGES;
    const q = search.toLowerCase();
    return MESSAGES.filter(m => m.from.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> Portal del Proveedor
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Consulta de pedidos, facturas y mensajería con proveedores</p>
        </div>
        <button onClick={() => exportToCSV(ORDERS.map(o => ({ ref: o.orderRef, proveedor: o.supplier, fecha: o.date, items: o.items, total: o.total, estado: ORDER_STATUS[o.status].label, entrega_est: o.estimatedDelivery })), "portal-proveedor")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pedidos activos", value: String(stats.activeOrders), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Facturas por pagar", value: fmt(stats.pendingInvoices), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Facturas vencidas", value: String(stats.overdueInvoices), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Mensajes sin leer", value: String(stats.unreadMessages), color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1">
        {(["pedidos", "facturas", "mensajes"] as const).map((v) => {
          const label = v === "pedidos" ? "Pedidos" : v === "facturas" ? "Facturas" : "Mensajes";
          return (
          <button key={v} onClick={() => setView(v)} className={cn("flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors", view === v ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted hover:text-gray-700")}>{label}</button>
          );
        })}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor, referencia..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
      </div>

      {view === "pedidos" && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Ref</th><th className="px-2 sm:px-4 py-2 sm:py-3">Proveedor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th><th className="px-2 sm:px-4 py-2 sm:py-3">Items</th><th className="px-2 sm:px-4 py-2 sm:py-3">Total</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3">Entrega est.</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
              <tbody>
                {filteredOrders.map(o => (
                  <tr key={o.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{o.orderRef}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{o.supplier}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{o.date}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600 dark:text-muted">{o.items}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{fmt(o.total)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", ORDER_STATUS[o.status].bg, ORDER_STATUS[o.status].color)}>{ORDER_STATUS[o.status].label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 text-xs">{o.estimatedDelivery}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(o)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "facturas" && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Factura</th><th className="px-2 sm:px-4 py-2 sm:py-3">Proveedor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Emisión</th><th className="px-2 sm:px-4 py-2 sm:py-3">Vencimiento</th><th className="px-2 sm:px-4 py-2 sm:py-3">Total</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th></tr></thead>
              <tbody>
                {filteredInvoices.map(i => (
                  <tr key={i.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{i.invoiceRef}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{i.supplier}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{i.date}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{i.dueDate}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{fmt(i.total)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold", INV_STATUS[i.status].color)}>{INV_STATUS[i.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "mensajes" && (
        <div className="space-y-2">
          {filteredMessages.map(m => (
            <div key={m.id} className={cn("bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:shadow transition-shadow", !m.read && "border-l-4 border-l-primary")}>
              <MessageSquare className={cn("h-5 w-5 mt-0.5 shrink-0", m.read ? "text-gray-300" : "text-primary")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-bold truncate", m.read ? "text-gray-600 dark:text-muted" : "text-gray-900 dark:text-foreground")}>{m.subject}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.from} · {m.date}</p>
              </div>
              {!m.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.orderRef}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Proveedor", detail.supplier], ["Fecha", detail.date], ["Items", String(detail.items)], ["Total", fmt(detail.total)], ["Estado", ORDER_STATUS[detail.status].label], ["Entrega estimada", detail.estimatedDelivery]].map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
