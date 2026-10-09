"use client";

import { useState, useEffect } from "react";
import { Timer, ClipboardList } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";

// ── Mejora 3: Shift Summary Widget ────────────────────────────────────────────

export default function ShiftSummaryWidget() {
  const [data, setData] = useState<{
    turnoActivo: boolean;
    turnoMinutos?: number;
    totalVentas?: number;
    cantidadVentas?: number;
    ticketPromedio?: number;
    metodosPago?: Record<string, number>;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/pos/metrics");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch { /* non-critical */ }
    };
    void fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data?.turnoActivo) return null;

  const h = Math.floor((data.turnoMinutos ?? 0) / 60);
  const mins = (data.turnoMinutos ?? 0) % 60;
  const timeStr = h > 0 ? `${h}h ${mins}m` : `${mins}m`;

  return (
    <m.div
      layout
      onClick={() => setExpanded(e => !e)}
      className="fixed bottom-4 left-4 z-40 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] cursor-pointer select-none transition-all"
      style={{ borderRadius: expanded ? 16 : 9999 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="px-4 py-2 flex items-center gap-3 text-xs">
        <span className="text-[var(--text-secondary)] dark:text-muted inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden /> {timeStr}
        </span>
        <span className="font-bold text-primary" style={{ color: "var(--accent)" }}>S/{(data.totalVentas ?? 0).toFixed(0)}</span>
        <span className="text-[var(--text-secondary)] dark:text-muted inline-flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden /> {data.cantidadVentas ?? 0}
        </span>
      </div>
      {expanded && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3 pt-1 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] space-y-1"
        >
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ticket promedio</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{(data.ticketPromedio ?? 0).toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ventas/hora</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {(data.turnoMinutos ?? 0) > 0 ? ((data.cantidadVentas ?? 0) / ((data.turnoMinutos ?? 1) / 60)).toFixed(1) : "0"}
            </span>
          </div>
        </m.div>
      )}
    </m.div>
  );
}
