"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  CalendarDays, Loader2, Sun, Sunset, Moon, Package,
  User, MapPin, Clock, ChevronLeft, ChevronRight, X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type SlotKey = "manana" | "tarde" | "noche";

type DeliverySlot = {
  id: string;
  orderId: string;
  date: string;
  slot: SlotKey;
  customerName?: string;
  address?: string;
  total?: number;
  status?: "pendiente" | "en-camino" | "entregado" | "fallido";
  notes?: string;
};

type Order = {
  id: string;
  customerName?: string;
  address?: string;
  total: number;
  status: string;
};

const SLOT_CONFIG: Record<SlotKey, { label: string; range: string; icon: typeof Sun; color: string; border: string }> = {
  manana: {
    label: "Mañana",
    range: "8:00 – 12:00",
    icon: Sun,
    color: "text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20",
    border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",
  },
  tarde: {
    label: "Tarde",
    range: "12:00 – 18:00",
    icon: Sunset,
    color: "text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20",
    border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",
  },
  noche: {
    label: "Noche",
    range: "18:00 – 21:00",
    icon: Moon,
    color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]",
    border: "border-[var(--rule-base)]",
  },
};

const STATUS_SLOT_CONFIG: Record<string, { label: string; dot: string }> = {
  pendiente:  { label: "Pendiente",   dot: "bg-[var(--data-warning)]" },
  "en-camino":{ label: "En camino",   dot: "bg-[var(--accent-soft)]" },
  entregado:  { label: "Entregado",   dot: "bg-[var(--accent-soft)]" },
  fallido:    { label: "Fallido",     dot: "bg-[var(--data-error)]" },
};

function getWeekDates(offset: number): string[] {
  const today = new Date();
  today.setDate(today.getDate() + offset * 7);
  // Monday of that week
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function fmtDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return { day: d.toLocaleDateString("es-PE", { weekday: "short" }), num: d.getDate(), month: d.toLocaleDateString("es-PE", { month: "short" }) };
}

export default function DeliveryCalendarTab() {
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekOffset, setWeekOffset] = useState(0);
  const [assigningSlot, setAssigningSlot] = useState<SlotKey | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/delivery-slots?weekStart=${weekDates[0]}&weekEnd=${weekDates[6]}`).then(r => r.ok ? r.json() : []),
      fetch("/api/orders").then(r => r.ok ? r.json() : []),
    ])
      .then(([sData, oData]: [DeliverySlot[], Order[]]) => {
        if (!active) return;
        setSlots(sData);
        setOrders(oData.filter(o => o.status === "pendiente" || o.status === "preparando"));
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [weekDates, refreshTick]);

  const assignSlot = async (orderId: string) => {
    if (!assigningSlot) return;
    await fetch("/api/delivery-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, date: selectedDate, slot: assigningSlot }),
    });
    setAssigningSlot(null);
    setRefreshTick(t => t + 1);
  };

  const removeSlot = async (slotId: string) => {
    await fetch(`/api/delivery-slots/${slotId}`, { method: "DELETE" });
    setRefreshTick(t => t + 1);
  };

  // KPIs for selected day
  const daySlots = slots.filter(s => s.date === selectedDate);
  const dayKpis = useMemo(() => ({
    total: daySlots.length,
    entregados: daySlots.filter(s => s.status === "entregado").length,
    enCamino:   daySlots.filter(s => s.status === "en-camino").length,
    fallidos:   daySlots.filter(s => s.status === "fallido").length,
  }), [daySlots]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Calendario de Entregas
        </SectionTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Planifica y rastrea los pedidos por franja horaria</p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
        <div className="flex-1 flex gap-1 overflow-x-auto pb-1">
          {weekDates.map(d => {
            const { day, num, month } = fmtDay(d);
            const count = slots.filter(s => s.date === d).length;
            const isToday = d === today;
            const isSelected = d === selectedDate;
            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={cn(
                  "flex flex-col items-center min-w-[52px] px-2 py-2 rounded-xl text-xs font-bold transition flex-1",
                  isSelected
                    ? "bg-primary text-white"
                    : isToday
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                )}
              >
                <span className="capitalize text-[length:var(--ts-2xs)] font-semibold">{day}</span>
                <span className="text-lg font-extrabold leading-tight">{num}</span>
                <span className="text-[length:var(--ts-2xs)] capitalize opacity-70">{month}</span>
                {count > 0 && (
                  <span className={cn("mt-1 px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold", isSelected ? "bg-white/20" : "bg-primary/10 text-primary")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Day KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total",       value: dayKpis.total,      color: "text-[var(--text-primary)] dark:text-foreground" },
          { label: "Entregados",  value: dayKpis.entregados, color: "text-[var(--data-success)]" },
          { label: "En camino",   value: dayKpis.enCamino,   color: "text-[var(--data-success)]" },
          { label: "Fallidos",    value: dayKpis.fallidos,   color: "text-[var(--data-error)]" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 text-center">
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Slot columns */}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(Object.entries(SLOT_CONFIG) as [SlotKey, typeof SLOT_CONFIG.manana][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const slotOrders = daySlots.filter(s => s.slot === key);
            return (
              <div key={key} className={cn("bg-white dark:bg-card border rounded-xl overflow-hidden", cfg.border)}>
                {/* Slot header */}
                <div className={cn("flex items-center gap-2 px-4 py-3", cfg.color)}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <span className="font-extrabold text-sm">{cfg.label}</span>
                    <span className="text-[length:var(--ts-2xs)] ml-1.5 opacity-70">{cfg.range}</span>
                  </div>
                  <span className="text-xs font-bold bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full">
                    {slotOrders.length} pedidos
                  </span>
                </div>

                {/* Orders list */}
                <div className="p-3 space-y-2 min-h-[100px]">
                  {slotOrders.length === 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">Sin entregas programadas</p>
                  )}
                  {slotOrders.map(s => {
                    const st = s.status ?? "pendiente";
                    const stCfg = STATUS_SLOT_CONFIG[st] ?? STATUS_SLOT_CONFIG.pendiente;
                    return (
                      <div
                        key={s.id}
                        className="flex items-start gap-2 text-xs bg-gray-50 dark:bg-surface rounded-xl px-3 py-2.5 group"
                      >
                        <span className={cn("mt-1 w-2 h-2 rounded-full shrink-0", stCfg.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">
                              #{s.orderId.slice(-6)}
                            </span>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] bg-white dark:bg-card px-1.5 py-0.5 rounded-full">
                              {stCfg.label}
                            </span>
                          </div>
                          {s.customerName && (
                            <div className="flex items-center gap-1 text-[var(--text-secondary)] dark:text-muted mt-0.5">
                              <User className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{s.customerName}</span>
                            </div>
                          )}
                          {s.address && (
                            <div className="flex items-center gap-1 text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{s.address}</span>
                            </div>
                          )}
                          {s.total !== undefined && (
                            <span className="mt-1 inline-block font-bold text-primary">S/ {s.total.toFixed(2)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeSlot(s.id)}
                          className="opacity-0 group-hover:opacity-100 transition p-1 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Assign button */}
                <div className="px-3 pb-3">
                  <button
                    onClick={() => setAssigningSlot(key)}
                    className="w-full py-2 rounded-lg text-xs font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5 transition flex items-center justify-center gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    Asignar pedido
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {assigningSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAssigningSlot(null)}
        >
          <div
            className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 w-full max-w-md space-y-4 border border-[var(--rule-base)] dark:border-card-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">
                Asignar pedido — {SLOT_CONFIG[assigningSlot].label}
              </CardTitle>
              <button onClick={() => setAssigningSlot(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface">
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
            {orders.length === 0 ? (
              <div className="text-center py-6">
                <Package className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-tertiary)]">No hay pedidos pendientes de asignar</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {orders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => assignSlot(o.id)}
                    className="w-full text-left p-3 border border-[var(--rule-base)] dark:border-card-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition text-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] dark:text-foreground">#{o.id.slice(-6)}</span>
                      <span className="font-extrabold text-primary">S/ {o.total.toFixed(2)}</span>
                    </div>
                    {o.customerName && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" /> {o.customerName}
                      </p>
                    )}
                    {o.address && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {o.address}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
