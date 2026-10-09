"use client";

import { AlertTriangle, CalendarClock, Check, Wallet } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ResumenCuentas } from "./resumen-cuentas";

type Tono = "neutral" | "warning" | "error" | "success";

const TONOS: Record<Tono, { caja: string; cifra: string }> = {
  neutral: { caja: "border-[var(--rule-base)] bg-[var(--surface-raised)]", cifra: "text-[var(--text-primary)]" },
  warning: { caja: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15", cifra: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  error: { caja: "border-[var(--data-error-500)]/20 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15", cifra: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
  success: { caja: "border-[var(--data-success-500)]/20 bg-primary/10 dark:bg-primary/15", cifra: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
};

/** Indicadores de «Por pagar»: plegados siguen diciendo las cifras en una línea. */
export default function KpisPorPagar({ r, abierto, id }: { r: ResumenCuentas; abierto: boolean; id: string }) {
  const items: { label: string; valor: string; detalle: string; tono: Tono; Icono: typeof Wallet }[] = [
    { label: "Le debes", valor: formatCurrency(r.porPagar), detalle: `${r.pendientes} cuenta${r.pendientes === 1 ? "" : "s"}`, tono: r.porPagar > 0 ? "warning" : "neutral", Icono: Wallet },
    { label: "Vencido", valor: formatCurrency(r.vencido), detalle: `${r.vencidas} cuenta${r.vencidas === 1 ? "" : "s"}`, tono: r.vencidas > 0 ? "error" : "neutral", Icono: AlertTriangle },
    { label: "Por vencer", valor: formatCurrency(r.pronto), detalle: `${r.prontoN} en 7 días`, tono: r.prontoN > 0 ? "warning" : "neutral", Icono: CalendarClock },
    { label: "Ya pagaste", valor: formatCurrency(r.pagado), detalle: "en total", tono: "success", Icono: Check },
  ];

  if (!abierto) {
    return (
      <p id={id} className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
        {items.map((it) => (
          <span key={it.label} title={it.detalle}>
            {it.label} <strong className={cn("font-bold tabular-nums", TONOS[it.tono].cifra)}>{it.valor}</strong>
          </span>
        ))}
      </p>
    );
  }

  return (
    <div id={id} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, valor, detalle, tono, Icono }) => (
        <div key={label} className={cn("flex items-start gap-3 rounded-xl border p-4", TONOS[tono].caja)}>
          <Icono className={cn("mt-0.5 h-5 w-5 shrink-0", TONOS[tono].cifra)} strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="libro-kicker truncate">{label}</p>
            <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums", TONOS[tono].cifra)}>{valor}</p>
            <p className="truncate text-xs text-[var(--text-secondary)]">{detalle}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
