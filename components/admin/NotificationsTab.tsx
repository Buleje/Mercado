"use client";

import { useState, useEffect } from "react";
import { Bell, Loader2, Send, ExternalLink, CheckCircle2, Clock, Search, MessageCircle } from "lucide-react";
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
  sent: "✅",
  pending: "⏳",
  failed: "❌",
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Bell className="h-6 w-6 text-primary" />Notificaciones WhatsApp</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{logs.length}</p>
          <p className="text-xs text-gray-400">Total enviados</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">{sentCount}</p>
          <p className="text-xs text-gray-400">Exitosos</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-primary">{todayCount}</p>
          <p className="text-xs text-gray-400">Hoy</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send notification */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-4">
          <h3 className="font-extrabold flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-500" />Enviar Notificación</h3>

          {/* Order picker */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={orderSearch} onChange={e => { setOrderSearch(e.target.value); setSelectedOrder(null); setWaUrl(null); }} placeholder="Buscar pedido por nombre, teléfono o ID..." className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
          </div>

          {!selectedOrder && filteredOrders.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredOrders.map(o => (
                <button key={o.id} onClick={() => { setSelectedOrder(o); setOrderSearch(""); setWaUrl(null); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-surface border border-transparent hover:border-gray-200 dark:hover:border-card-border transition text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-foreground truncate">{o.customerName ?? "Sin nombre"}</p>
                    <p className="text-xs text-gray-400">{o.customerPhone} · #{o.id.slice(0, 8)}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                    o.status === "entregado" ? "bg-emerald-100 text-emerald-700" :
                    o.status === "cancelado" ? "bg-red-100 text-red-700" :
                    o.status === "en_camino" ? "bg-blue-100 text-blue-700" :
                    "bg-yellow-100 text-yellow-700"
                  )}>{o.status}</span>
                  <span className="font-bold text-sm text-gray-600">S/{o.total?.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedOrder && (
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-gray-900 dark:text-foreground">{selectedOrder.customerName}</p>
                  <p className="text-sm text-gray-400">{selectedOrder.customerPhone}</p>
                </div>
                <button onClick={() => { setSelectedOrder(null); setWaUrl(null); }} className="text-xs text-gray-400 underline">Cambiar</button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">Pedido #{selectedOrder.id.slice(0, 8)}</span>
                <span className="font-bold">S/{selectedOrder.total?.toFixed(2)}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                  selectedOrder.status === "entregado" ? "bg-emerald-100 text-emerald-700" :
                  selectedOrder.status === "cancelado" ? "bg-red-100 text-red-700" :
                  "bg-yellow-100 text-yellow-700"
                )}>{selectedOrder.status}</span>
              </div>
            </div>
          )}

          {waUrl && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Notificación registrada</p>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition">
                <ExternalLink className="h-4 w-4" />Abrir WhatsApp
              </a>
            </div>
          )}

          <button onClick={sendNotification} disabled={!selectedOrder || sending} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar por WhatsApp
          </button>
        </div>

        {/* Notification log */}
        <div className="space-y-3">
          <h3 className="font-extrabold flex items-center gap-2"><Clock className="h-5 w-5 text-gray-400" />Historial de Envíos</h3>
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
              <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Sin notificaciones enviadas</p>
            </div>
          ) : (
            <div className="max-h-100 overflow-y-auto space-y-2">
              {logs.map(l => (
                <div key={l.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                      {STATUS_ICONS[l.status] ?? "📨"} {l.recipient}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(l.createdAt).toLocaleString("es-PE")}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{l.message}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface text-gray-500">{TYPE_LABELS[l.type] ?? l.type}</span>
                    {l.orderId && <span className="text-[10px] text-gray-400">#{l.orderId.slice(0, 8)}</span>}
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

