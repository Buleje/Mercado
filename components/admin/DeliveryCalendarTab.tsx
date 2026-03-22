"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Loader2, Sun, Sunset, Moon, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Slot = { id: string; orderId: string; date: string; slot: string; notes?: string };
type Order = { id: string; customerName?: string; total: number; status: string };

const SLOT_CONFIG: Record<string, { label: string; icon: typeof Sun; color: string }> = {
  manana: { label: "Mañana (8-12)", icon: Sun, color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20" },
  tarde: { label: "Tarde (12-18)", icon: Sunset, color: "text-orange-500 bg-orange-50 dark:bg-orange-900/20" },
  noche: { label: "Noche (18-21)", icon: Moon, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" },
};

export default function DeliveryCalendarTab() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigningOrder, setAssigningOrder] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/delivery-slots?date=${selectedDate}`), fetch("/api/orders")])
      .then(([sRes, oRes]) => Promise.all([sRes.ok ? sRes.json() : [], oRes.ok ? oRes.json() : []]))
      .then(([sData, oData]: [Slot[], Order[]]) => {
        if (!active) return;
        setSlots(sData);
        setOrders(oData.filter(o => o.status === "pendiente" || o.status === "preparando"));
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedDate, refreshTick]);

  const assignSlot = async (orderId: string, slot: string) => {
    await fetch("/api/delivery-slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, date: selectedDate, slot }) });
    setAssigningOrder(null);
    setRefreshTick(t => t + 1);
  };

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-3 sm:space-y-6">
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" />Calendario de Entregas</h2>

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
        {dates.map(d => {
          const date = new Date(d + "T12:00:00");
          const day = date.toLocaleDateString("es-PE", { weekday: "short" });
          const num = date.getDate();
          return (
            <button key={d} onClick={() => setSelectedDate(d)} className={cn("flex flex-col items-center min-w-15 px-3 py-2 rounded-xl text-sm font-bold transition", d === selectedDate ? "bg-primary text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}>
              <span className="text-xs capitalize">{day}</span>
              <span className="text-lg">{num}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
          {Object.entries(SLOT_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const slotOrders = slots.filter(s => s.slot === key);
            return (
              <div key={key} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
                <div className={cn("flex items-center gap-2 mb-3 p-2 rounded-xl", cfg.color)}>
                  <Icon className="h-5 w-5" />
                  <span className="font-extrabold text-sm">{cfg.label}</span>
                  <span className="ml-auto text-xs font-bold bg-white/80 dark:bg-surface px-2 py-0.5 rounded-full">{slotOrders.length}</span>
                </div>
                <div className="space-y-2 min-h-15">
                  {slotOrders.length === 0 && <p className="text-xs text-gray-400 dark:text-muted text-center py-3">Sin entregas</p>}
                  {slotOrders.map(s => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm bg-gray-50 dark:bg-surface rounded-lg px-3 py-2">
                      <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="font-medium truncate">#{s.orderId.slice(-6)}</span>
                      {s.notes && <span className="text-xs text-gray-400 truncate">— {s.notes}</span>}
                    </div>
                  ))}
                </div>
                <button onClick={() => setAssigningOrder(key)} className="w-full mt-3 text-xs text-primary font-bold hover:underline">+ Asignar pedido</button>
              </div>
            );
          })}
        </div>
      )}

      {assigningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAssigningOrder(null)}>
          <div className="bg-white dark:bg-card rounded-2xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-extrabold text-gray-900 dark:text-foreground">Asignar pedido — {SLOT_CONFIG[assigningOrder]?.label}</h3>
            {orders.length === 0 && <p className="text-sm text-gray-400">No hay pedidos pendientes</p>}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {orders.map(o => (
                <button key={o.id} onClick={() => assignSlot(o.id, assigningOrder)} className="w-full text-left p-3 border border-gray-200 dark:border-card-border rounded-xl hover:bg-gray-50 dark:hover:bg-surface transition text-sm">
                  <span className="font-bold">#{o.id.slice(-6)}</span>
                  {o.customerName && <span className="text-gray-400 ml-2">{o.customerName}</span>}
                  <span className="float-right font-bold text-primary">S/{o.total.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

