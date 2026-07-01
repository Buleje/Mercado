"use client";

/**
 * BudgetPanel — tope mensual GLOBAL + topes POR CATEGORÍA con alerta de sobregasto.
 * El gasto actual por categoría viene de summary.byCategory; cada categoría con
 * tope muestra una barra consumido/tope. Brandon 2026-06-30.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, SlidersHorizontal, ChevronDown } from "@buleje/design-system/icons";
import { CAT_KEYS, CAT_META, fmtPen, INPUT_CLASS, type BudgetByCategory } from "./gastos-helpers";

export function BudgetPanel({
  budget,
  budgetByCategory,
  runRatePen,
  byCategory,
  busy,
  onSaveBudget,
  onSaveBudgetByCategory,
}: {
  budget: number | null;
  budgetByCategory: BudgetByCategory;
  runRatePen: number;
  byCategory: { category: string; amountPen: number }[];
  busy: boolean;
  onSaveBudget: (v: number | null) => void;
  onSaveBudgetByCategory: (next: BudgetByCategory) => void;
}) {
  const [budgetInput, setBudgetInput] = useState(budget !== null ? String(budget) : "");
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(CAT_KEYS.map((k) => [k, budgetByCategory[k] ? String(budgetByCategory[k]) : ""])),
  );

  const over = budget !== null && budget > 0 && runRatePen > budget;
  const spentByCat = new Map(byCategory.map((c) => [c.category, c.amountPen]));

  const saveGlobal = () => {
    const v = budgetInput.trim() === "" ? null : Number(budgetInput);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    onSaveBudget(v);
  };

  const saveCats = () => {
    const next: BudgetByCategory = {};
    for (const [k, v] of Object.entries(drafts)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) next[k] = n;
    }
    onSaveBudgetByCategory(next);
  };

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-[var(--text-secondary)]">Tope mensual (S/):</span>
        <input
          className={`${INPUT_CLASS} w-32`}
          type="number"
          min="0"
          step="50"
          placeholder="sin tope"
          value={budgetInput}
          onChange={(e) => setBudgetInput(e.target.value)}
        />
        <button
          onClick={saveGlobal}
          disabled={busy}
          className="h-10 rounded-lg bg-[var(--surface-sunken)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--rule-soft)] disabled:opacity-50"
        >
          Guardar
        </button>

        {budget !== null && budget > 0 &&
          (over ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error-600,#dc2626)]">
              <AlertTriangle className="h-4 w-4" /> Sobregasto: {fmtPen(runRatePen)} supera el tope ({(((runRatePen - budget) / budget) * 100).toFixed(0)}%)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-600,#059669)]">
              <CheckCircle2 className="h-4 w-4" /> Dentro del tope · queda {fmtPen(budget - runRatePen)}
            </span>
          ))}

        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <SlidersHorizontal className="h-4 w-4" /> Topes por categoría
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {(budget !== null && budget > 0) || Object.keys(budgetByCategory).length > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Te avisamos por email si el gasto supera un tope (una vez al cruzarlo, sin repetir).
        </p>
      ) : null}

      {open && (
        <div className="mt-4 space-y-2 border-t border-[var(--rule-soft)] pt-4">
          {CAT_KEYS.map((k) => {
            const spent = spentByCat.get(k) ?? 0;
            const cap = Number(drafts[k]) || 0;
            const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
            const catOver = cap > 0 && spent > cap;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_META[k].color }} />
                  {CAT_META[k].label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  {cap > 0 && (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: catOver ? "var(--data-error-500,#ef4444)" : CAT_META[k].color }}
                    />
                  )}
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums text-xs text-[var(--text-tertiary)]">
                  {fmtPen(spent)}
                </span>
                <input
                  className="h-10 w-24 shrink-0 rounded-lg border-2 border-[var(--rule-soft)] bg-[var(--surface-1,var(--surface-raised))] px-2 text-right text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="tope"
                  value={drafts[k]}
                  onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })}
                />
              </div>
            );
          })}
          <div className="flex justify-end pt-1">
            <button
              onClick={saveCats}
              disabled={busy}
              className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-extrabold text-[var(--accent-contrast,#fff)] disabled:opacity-50"
            >
              Guardar topes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
