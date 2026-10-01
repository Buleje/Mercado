"use client";

/**
 * HistoryTable — historial mensual de gasto navegable: cada mes muestra total,
 * Δ vs el mes anterior y si es un cierre real (congelado) o estimado. Al expandir
 * un mes se ve el desglose por categoría. Alimentado por PlatformExpensesDB
 * .historyTable(). Brandon 2026-06-30.
 */

import { useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";
import { CAT_META, fmtPen, type HistoryMonth } from "./gastos-helpers";

export function HistoryTable({ history }: { history: HistoryMonth[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const withData = history.filter((h) => h.totalPen > 0);
  if (withData.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        Aún no hay gasto registrado. Los meses se van congelando a medida que registrás gastos.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--rule-soft)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left text-sm font-bold text-[var(--text-tertiary)]">
          <tr>
            <th className="p-2 pl-4">Mes</th>
            <th className="p-2 text-right">Total / mes</th>
            <th className="p-2 text-right">Δ vs mes ant.</th>
            <th className="p-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => {
            // history viene de más reciente a más antiguo → el "mes anterior" es i+1.
            const prev = history[i + 1];
            const delta = prev && prev.totalPen > 0 ? ((h.totalPen - prev.totalPen) / prev.totalPen) * 100 : null;
            const isOpen = open === h.monthKey;
            const catTotal = h.byCategory.reduce((s, c) => s + c.amountPen, 0);
            return (
              <FragmentRow key={h.monthKey}>
                <tr
                  className="cursor-pointer border-t border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]/40"
                  onClick={() => setOpen(isOpen ? null : h.monthKey)}
                >
                  <td className="p-2 pl-4">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${h.real ? "bg-[var(--accent)]" : "bg-[var(--accent)] opacity-40"}`}
                        title={h.real ? "cierre real" : "estimado / en curso"}
                      />
                      <span className="font-bold capitalize text-[var(--text-primary)]">{h.label}</span>
                      {!h.real && <span className="text-xs text-[var(--text-tertiary)]">est.</span>}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums font-bold text-[var(--text-primary)]">{fmtPen(h.totalPen)}</td>
                  <td className="p-2 text-right">
                    <DeltaCell delta={delta} />
                  </td>
                  <td className="p-2 pr-4 text-right">
                    <ChevronDown
                      className={`inline h-4 w-4 text-[var(--text-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/30">
                    <td colSpan={4} className="p-4">
                      {h.byCategory.length === 0 ? (
                        <p className="text-sm text-[var(--text-tertiary)]">Sin gasto este mes.</p>
                      ) : (
                        <ul className="space-y-2">
                          {h.byCategory.map((c) => (
                            <li key={c.category} className="flex items-center gap-3">
                              <span className="flex w-36 shrink-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_META[c.category]?.color ?? "#94a3b8" }} />
                                {CAT_META[c.category]?.label ?? c.category}
                              </span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--rule-base)]">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${catTotal > 0 ? (c.amountPen / catTotal) * 100 : 0}%`, background: CAT_META[c.category]?.color ?? "#94a3b8" }}
                                />
                              </div>
                              <span className="w-24 shrink-0 text-right tabular-nums text-sm font-bold text-[var(--text-primary)]">{fmtPen(c.amountPen)}</span>
                              <span className="w-10 shrink-0 text-right tabular-nums text-xs text-[var(--text-tertiary)]">
                                {catTotal > 0 ? `${Math.round((c.amountPen / catTotal) * 100)}%` : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  }
  const flat = Math.abs(delta) < 0.5;
  const up = delta > 0;
  const color = flat
    ? "text-[var(--text-tertiary)]"
    : up
      ? "text-[var(--data-error-600,#dc2626)]"
      : "text-[var(--data-success-600,#059669)]";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center justify-end gap-1 tabular-nums text-sm font-bold ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(delta).toFixed(0)}%`}
    </span>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
