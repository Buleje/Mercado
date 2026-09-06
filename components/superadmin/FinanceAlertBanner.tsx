"use client";

/**
 * FinanceAlertBanner — aviso global (arriba de TODO el panel superadmin) cuando
 * la plataforma está en rojo financiero: el gasto cruzó el tope o hay tiendas
 * que cuestan más de lo que pagan. Lee /api/superadmin/finance-alerts (mismos
 * cálculos que /superadmin/gastos) una vez al montar. Descartable por sesión;
 * si el estado empeora (firma distinta) reaparece. Brandon 2026-07-04.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, X } from "@buleje/design-system/icons";

interface Overspend { runRatePen: number; budgetPen: number; overPen: number; pct: number }
interface Unprofitable { count: number; worstName: string; worstMargin: number }

const DISMISS_KEY = "bsm-finance-alert-dismissed";
const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function FinanceAlertBanner() {
  const [overspend, setOverspend] = useState<Overspend | null>(null);
  const [unprofitable, setUnprofitable] = useState<Unprofitable | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/superadmin/finance-alerts", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const over: Overspend | null = d.overspend ?? null;
        const unp: Unprofitable | null = d.unprofitable ?? null;
        if (!over && !unp) return;
        // Firma del estado: si cambia respecto a lo descartado, reaparece.
        const sig = `${over ? over.overPen : 0}|${unp ? unp.count : 0}`;
        let dismissedSig: string | null = null;
        try { dismissedSig = sessionStorage.getItem(DISMISS_KEY); } catch { /* no-op */ }
        if (dismissedSig === sig) return;
        setOverspend(over);
        setUnprofitable(unp);
        setHidden(false);
      })
      .catch(() => setHidden(true)); // red caída — sin banner, no rompe el panel
    return () => { alive = false; };
  }, []);

  if (hidden || (!overspend && !unprofitable)) return null;

  const dismiss = () => {
    const sig = `${overspend ? overspend.overPen : 0}|${unprofitable ? unprofitable.count : 0}`;
    try { sessionStorage.setItem(DISMISS_KEY, sig); } catch { /* no-op */ }
    setHidden(true);
  };

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/8 p-3 sm:p-4"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700,#b45309)]">
        <AlertTriangle className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)]">Atención en finanzas</p>
        <ul className="mt-0.5 space-y-0.5 text-sm text-[var(--text-secondary)]">
          {overspend && (
            <li>
              El gasto <span className="font-bold text-[var(--data-warning-700,#b45309)]">superó el tope</span>:{" "}
              {fmt(overspend.runRatePen)}/mes de {fmt(overspend.budgetPen)} ({overspend.pct}%).
            </li>
          )}
          {unprofitable && (
            <li>
              <span className="font-bold text-[var(--data-error-700,#b91c1c)]">
                {unprofitable.count} tienda{unprofitable.count !== 1 ? "s" : ""}
              </span>{" "}
              cuesta{unprofitable.count !== 1 ? "n" : ""} más de lo que paga
              {unprofitable.count !== 1 ? "n" : ""}
              {unprofitable.worstName && ` (la peor: ${unprofitable.worstName}, ${unprofitable.worstMargin}%)`}.
            </li>
          )}
        </ul>
        <Link
          href="/superadmin/gastos"
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline"
        >
          Ver gastos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        aria-label="Descartar aviso"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
