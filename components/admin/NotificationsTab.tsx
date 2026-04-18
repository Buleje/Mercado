"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Bell, Loader2, Send, ExternalLink, CheckCircle2, Clock, Search, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type NotifLog = { id: string; type: string; recipient: string; message: string; status: string; orderId: string | null; createdAt: string };
type Order = { id: string; customerName: string; customerPhone: string; total: number; status: string; createdAt: string };

const TYPE_LABELS: Record<string, string> = {
  order_confirmation: "Confirmación",
  order_status: "Estado de pedido",
  delivery: "Entrega",
  promotion: "Promoción",
};

const STATUS_ICONS: Record<string, string> = {
  sent: "",
  pending: "",
  failed: "",
};

export default function NotificationsTab() {
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/notifications").then(r => r.ok ? r.json() : []),
      fetch("/api/orders").then(r => r.ok ? r.json() : []),
    ]).then(([notifs, ords]) => {
      if (active) {
        setLogs(notifs);
        setOrders(ords);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tick]);

  const sendNotification = async () => {
    if (!selectedOrder || !selectedOrder.customerPhone) return;
    setSending(true);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: selectedOrder.customerPhone, orderId: selectedOrder.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setWaUrl(data.whatsappUrl);
      setTick(v => v + 1);
    }
    setSending(false);
  };

  const filteredOrders = orderSearch
    ? orders.filter(o => o.customerName?.toLowerCase().includes(orderSearch.toLowerCase()) || o.customerPhone?.includes(orderSearch) || o.id.includes(orderSearch))
    : orders.slice(0, 10);

  const todayCount = logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length;
  const sentCount = logs.filter(l => l.status === "sent").length;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Bell className="h-6 w-6 text-primary" />Notificaciones WhatsApp</SectionTitle>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{logs.length}</p>
          <p className="text-xs text-[var(--text-tertiary)]">Total enviados</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success)]">{sentCount}</p>
          <p className="text-xs text-[var(--text-tertiary)]">Exitosos</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-primary">{todayCount}</p>
          <p className="text-xs text-[var(--text-tertiary)]">Hoy</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send notification */}
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <CardTitle className="font-extrabold flex flex-wrap items-center gap-2"><MessageCircle className="h-5 w-5 text-[var(--data-success)]" />Enviar Notificación</CardTitle>

          {/* Order picker */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input value={orderSearch} onChange={e => { setOrderSearch(e.target.value); setSelectedOrder(null); setWaUrl(null); }} placeholder="Buscar pedido por nombre, teléfono o ID..." className="w-full pl-9 pr-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
          </div>

          {!selectedOrder && filteredOrders.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredOrders.map(o => (
                <button key={o.id} onClick={() => { setSelectedOrder(o); setOrderSearch(""); setWaUrl(null); }} className="w-full text-left flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-surface border border-transparent hover:border-gray-200 dark:hover:border-card-border transition text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[var(--text-primary)] dark:text-foreground truncate">{o.customerName ?? "Sin nombre"}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{o.customerPhone} · #{o.id.slice(0, 8)}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase",
                    o.status === "entregado" ? "bg-[var(--accent-soft)] text-[var(--data-success)]" :
                    o.status === "cancelado" ? "bg-[var(--data-error-100)] text-[var(--data-error)]" :
                    o.status === "en_camino" ? "bg-[var(--accent-soft)] text-[var(--data-success)]" :
                    "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                  )}>{o.status}</span>
                  <span className="font-bold text-sm text-[var(--text-secondary)]">S/{o.total?.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedOrder && (
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{selectedOrder.customerName}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">{selectedOrder.customerPhone}</p>
                </div>
                <button onClick={() => { setSelectedOrder(null); setWaUrl(null); }} className="text-xs text-[var(--text-tertiary)] underline">Cambiar</button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[var(--text-secondary)]">Pedido #{selectedOrder.id.slice(0, 8)}</span>
                <span className="font-bold">S/{selectedOrder.total?.toFixed(2)}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase",
                  selectedOrder.status === "entregado" ? "bg-[var(--accent-soft)] text-[var(--data-success)]" :
                  selectedOrder.status === "cancelado" ? "bg-[var(--data-error-100)] text-[var(--data-error)]" :
                  "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                )}>{selectedOrder.status}</span>
              </div>
            </div>
          )}

          {waUrl && (
            <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl px-2 sm:px-4 py-2 sm:py-3 space-y-2">
              <p className="text-sm text-[var(--data-success)] dark:text-[var(--data-success)] flex flex-wrap items-center gap-2"><CheckCircle2 className="h-4 w-4" />Notificación registrada</p>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-[var(--accent-soft)] text-white rounded-lg text-sm font-bold hover:bg-[var(--accent-soft)] transition">
                <ExternalLink className="h-4 w-4" />Abrir WhatsApp
              </a>
            </div>
          )}

          <button onClick={sendNotification} disabled={!selectedOrder || sending} className="w-full py-2.5 bg-[var(--accent-soft)] text-white rounded-lg font-bold text-sm hover:bg-[var(--accent-soft)] transition disabled:opacity-50 flex flex-wrap items-center justify-center gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar por WhatsApp
          </button>
        </div>

        {/* Notification log */}
        <div className="space-y-3">
          <CardTitle className="font-extrabold flex flex-wrap items-center gap-2"><Clock className="h-5 w-5 text-[var(--text-tertiary)]" />Historial de Envíos</CardTitle>
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl">
              <Bell className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin notificaciones enviadas</p>
            </div>
          ) : (
            <div className="max-h-100 overflow-y-auto space-y-2">
              {logs.map(l => (
                <div key={l.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-2 sm:px-4 py-2 sm:py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
                      {l.recipient}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{new Date(l.createdAt).toLocaleString("es-PE")}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{l.message}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface text-[var(--text-secondary)]">{TYPE_LABELS[l.type] ?? l.type}</span>
                    {l.orderId && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">#{l.orderId.slice(0, 8)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

