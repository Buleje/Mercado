"use client";

import { useState, useEffect, useRef } from "react";
import { ShoppingCart, Package, DollarSign, UserPlus, AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  type: string;
  action: string;
  details?: string;
  entityType?: string;
  createdAt: string;
}

const ICON_MAP: Record<string, { icon: typeof ShoppingCart; color: string; bg: string }> = {
  sale:     { icon: ShoppingCart,   color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
  order:    { icon: ShoppingCart,   color: "text-[var(--data-success-500)]",    bg: "bg-primary/10 dark:bg-primary/15" },
  product:  { icon: Package,        color: "text-[var(--text-secondary)]",  bg: "bg-[var(--surface-sunken)]" },
  payment:  { icon: DollarSign,     color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  customer: { icon: UserPlus,       color: "text-[var(--accent-ink)] dark:text-[var(--accent)]",     bg: "bg-primary/10" },
  fiado:    { icon: DollarSign,     color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
};

function getIcon(entry: ActivityEntry) {
  const key = entry.entityType?.toLowerCase() || entry.type?.toLowerCase() || "";
  for (const [k, v] of Object.entries(ICON_MAP)) {
    if (key.includes(k)) return v;
  }
  return { icon: AlertTriangle, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)] dark:bg-surface" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// Demo data for when the API is not available
const DEMO_ENTRIES: ActivityEntry[] = [
  { id: "d1", type: "sale",     action: "Venta registrada",      details: "S/45.00 — Arroz, Aceite", entityType: "sale",     createdAt: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: "d2", type: "product",  action: "Stock bajo detectado",  details: "Leche Gloria — 2 unidades", entityType: "product",  createdAt: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: "d3", type: "fiado",    action: "Fiado cobrado",         details: "S/50.00 — Juan Pérez",    entityType: "fiado",    createdAt: new Date(Date.now() - 15 * 60000).toISOString() },
  { id: "d4", type: "customer", action: "Nuevo cliente",         details: "María García",             entityType: "customer", createdAt: new Date(Date.now() - 60 * 60000).toISOString() },
  { id: "d5", type: "order",    action: "Nuevo pedido",          details: "S/120.00 — Delivery",     entityType: "order",    createdAt: new Date(Date.now() - 90 * 60000).toISOString() },
];

export default function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivity = async () => {
    try {
      const res = await fetch("/api/activity-log?limit=10");
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.logs || data.entries || [];
        setEntries(items.length > 0 ? items.slice(0, 10) : DEMO_ENTRIES);
      } else {
        setEntries(DEMO_ENTRIES);
      }
    } catch {
      setEntries(DEMO_ENTRIES);
    } finally {
      setLoading(false);
    }
  };

  // BUG-FIX (audit 2026-05-05): visibility check para pausar polling
  // cuando la pestaña está oculta — ahorra cuota DB.
  useEffect(() => {
    fetchActivity();
    const start = () => {
      if (timerRef.current) return;
      timerRef.current = setInterval(fetchActivity, 30000);
    };
    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { fetchActivity(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10">
          <ShoppingCart className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-zinc-300">
          Actividad reciente
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 py-4 text-center">
          Sin actividad reciente
        </p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700">
          {entries.map((entry) => {
            const iconCfg = getIcon(entry);
            const Icon = iconCfg.icon;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-[var(--surface-alt)] dark:hover:bg-zinc-700/50 transition-colors"
              >
                <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5", iconCfg.bg)}>
                  <Icon className={cn("w-3.5 h-3.5", iconCfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)] dark:text-zinc-300 leading-snug">
                    {entry.action}
                  </p>
                  {entry.details && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-zinc-500 truncate mt-0.5">
                      {entry.details}
                    </p>
                  )}
                </div>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 mt-0.5">
                  {timeAgo(entry.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
