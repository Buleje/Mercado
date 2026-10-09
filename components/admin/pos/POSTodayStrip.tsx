"use client";

import { useState, useEffect } from "react";
import { Receipt, TrendingUp } from "@buleje/design-system/icons";
import { fmt } from "@/components/admin/pos/pos-shared";

// ── Feature 1: Resumen de hoy (strip compacto, read-only) ───────────────────
// Fetchea GET /api/sales?today=1&limit=1000 una vez al montar.
// Si falla o carga, el strip se oculta o muestra skeleton — nunca rompe el POS.

export default function POSTodayStrip({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ok"; count: number; total: number }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/sales?today=1&limit=1000", {
          signal: controller.signal,
        });
        if (!res.ok) { setState({ status: "error" }); return; }
        const data = await res.json();
        const records: { total: number }[] = Array.isArray(data) ? data : [];
        const count = records.length;
        const total = records.reduce((s, r) => s + (r.total || 0), 0);
        setState({ status: "ok", count, total });
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setState({ status: "error" });
        }
      }
    })();
    return () => controller.abort();
  }, [refreshKey]); // refreshKey sube con cada venta: «Hoy» ya no se queda en la cifra del arranque

  // Si falla, no mostrar nada (no romper el POS)
  if (state.status === "error") return null;

  const ticket =
    state.status === "ok" && state.count > 0
      ? state.total / state.count
      : 0;

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      {state.status === "loading" ? (
        /* Skeleton sutil mientras carga */
        <>
          {[56, 72, 60].map((w, i) => (
            <div
              key={i}
              className="h-3.5 rounded bg-[var(--rule-soft)] dark:bg-card-border animate-pulse"
              style={{ width: w }}
            />
          ))}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <Receipt className="h-3.5 w-3.5 text-[var(--text-tertiary)] max-sm:hidden" aria-hidden />
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Hoy:</span>
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">
              {state.count} venta{state.count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-3 w-px bg-[var(--rule-base)] dark:bg-card-border shrink-0" aria-hidden />
          <div className="flex items-center gap-1 shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--data-success-500)]" aria-hidden />
            <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-500)]">
              {fmt(state.total)}
            </span>
          </div>
          {state.count > 0 && (
            <span className="hidden xl:contents">
              <div className="h-3 w-px bg-[var(--rule-base)] dark:bg-card-border shrink-0" aria-hidden />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Ticket prom.:</span>
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                  {fmt(ticket)}
                </span>
              </div>
            </span>
          )}
        </>
      )}
    </div>
  );
}
