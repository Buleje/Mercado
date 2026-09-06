"use client";

/**
 * ExpenseForm — alta y edición de un gasto de plataforma. Reutilizable: sin `initial`
 * es alta; con `initial` precarga y el botón dice "Guardar cambios". El padre maneja
 * el submit (add/update) y el cierre.
 */

import { useState } from "react";
import { Plus, Check, X } from "@buleje/design-system/icons";
import { CAT_KEYS, CAT_META, INPUT_CLASS, type Expense } from "./gastos-helpers";
import type { ExpenseInput } from "./use-gastos";

const empty: ExpenseInput = {
  concept: "", category: "infra", amount: 0, currency: "USD",
  recurring: true, period: "mensual", vendor: "",
};

function fromExpense(x: Expense): ExpenseInput & { amountStr: string } {
  return {
    concept: x.concept, category: x.category, amount: x.amount, currency: x.currency,
    recurring: x.recurring, period: x.period || "mensual", vendor: x.vendor, amountStr: String(x.amount),
  };
}

export function ExpenseForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Expense;
  busy: boolean;
  onSubmit: (input: ExpenseInput) => Promise<boolean> | void;
  onCancel?: () => void;
}) {
  const seed = initial ? fromExpense(initial) : { ...empty, amountStr: "" };
  const [form, setForm] = useState(seed);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const editing = Boolean(initial);

  const submit = async () => {
    const amount = Number(form.amountStr);
    if (!form.concept.trim() || !Number.isFinite(amount) || amount <= 0) {
      setLocalErr("Completá concepto y un monto válido.");
      return;
    }
    setLocalErr(null);
    const ok = await onSubmit({
      concept: form.concept.trim(),
      category: form.category,
      amount,
      currency: form.currency,
      recurring: form.recurring,
      period: form.period,
      vendor: form.vendor.trim(),
    });
    if (ok && !editing) setForm({ ...empty, amountStr: "" });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5"
    >
      <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
        <Plus className="h-4 w-4" /> {editing ? "Editar gasto" : "Nuevo gasto"}
      </p>
      <input
        className={INPUT_CLASS}
        placeholder="Concepto (ej. Vercel Pro)"
        value={form.concept}
        onChange={(e) => setForm({ ...form, concept: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select className={INPUT_CLASS} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CAT_KEYS.map((k) => (
            <option key={k} value={k}>{CAT_META[k].label}</option>
          ))}
        </select>
        <select className={INPUT_CLASS} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="USD">USD</option>
          <option value="PEN">PEN (S/)</option>
        </select>
      </div>
      <input
        className={INPUT_CLASS}
        type="number"
        step="0.01"
        min="0"
        placeholder="Monto"
        value={form.amountStr}
        onChange={(e) => setForm({ ...form, amountStr: e.target.value })}
      />
      <input
        className={INPUT_CLASS}
        placeholder="Proveedor (opcional)"
        value={form.vendor}
        onChange={(e) => setForm({ ...form, vendor: e.target.value })}
      />
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Recurrente
      </label>
      {form.recurring && (
        <select className={INPUT_CLASS} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </select>
      )}
      {localErr && <p className="text-sm text-[var(--data-error-600,#dc2626)]">{localErr}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-sm font-extrabold text-[var(--accent-contrast,#fff)] disabled:opacity-50"
        >
          {editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {busy ? "Guardando…" : editing ? "Guardar cambios" : "Agregar gasto"}
        </button>
        {editing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" /> Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
