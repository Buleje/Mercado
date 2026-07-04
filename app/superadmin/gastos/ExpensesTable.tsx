"use client";

/**
 * ExpensesTable — lista de gastos reales con búsqueda, filtro por categoría,
 * orden (monto/concepto), agrupar por categoría con subtotales, y acciones
 * editar/eliminar. Muestra el tipo de cambio con que se normalizó USD→PEN.
 */

import { useMemo, useState } from "react";
import {
  Server, MessageSquare, Sparkles, CreditCard, Users, Megaphone, MoreHorizontal,
  Search, ArrowUpDown, Layers, Pencil, Trash2, DollarSign,
} from "@buleje/design-system/icons";
import { CAT_META, fmtPen, fmtUsd, type Expense } from "./gastos-helpers";

const CAT_ICONS: Record<string, typeof Server> = {
  infra: Server, mensajeria: MessageSquare, ia: Sparkles, pagos: CreditCard,
  personal: Users, marketing: Megaphone, otros: MoreHorizontal,
};

type SortKey = "amount" | "concept" | "category";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

function MoneyCell({ x }: { x: Expense }) {
  return (
    <td className="p-2 text-right tabular-nums font-bold text-[var(--text-primary)]">
      {x.currency === "USD" ? fmtUsd(x.amount) : fmtPen(x.amount)}
      <span className="block text-sm font-normal text-[var(--text-tertiary)]">{fmtPen(x.amountPen)}/mes</span>
    </td>
  );
}

function Row({
  x, busy, onEdit, onDelete,
}: {
  x: Expense; busy: boolean; onEdit: (x: Expense) => void; onDelete: (id: string) => void;
}) {
  const Icon = CAT_ICONS[x.category] ?? MoreHorizontal;
  return (
    <tr className="border-t border-[var(--rule-soft)]">
      <td className="p-2">
        <span className="font-bold text-[var(--text-primary)]">{x.concept}</span>
        {x.recurring && <span className="ml-1.5 text-sm text-[var(--text-tertiary)]">· {x.period || "mensual"}</span>}
        {x.vendor && <span className="block text-sm text-[var(--text-tertiary)]">{x.vendor}</span>}
      </td>
      <td className="p-2">
        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Icon className="h-4 w-4" />
          {CAT_META[x.category]?.label ?? x.category}
        </span>
      </td>
      <MoneyCell x={x} />
      <td className="p-2 text-right">
        <div className="inline-flex gap-1">
          <button
            onClick={() => onEdit(x)}
            disabled={busy}
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(x.id)}
            disabled={busy}
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-600,#dc2626)]"
            aria-label="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function ExpensesTable({
  expenses, loading, busy, fxRate, onEdit, onDelete, onSaveFx,
}: {
  expenses: Expense[];
  loading: boolean;
  busy: boolean;
  fxRate: number;
  onEdit: (x: Expense) => void;
  onDelete: (id: string) => void;
  onSaveFx: (rate: number) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<SortKey>("amount");
  const [grouped, setGrouped] = useState(false);

  const cats = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))),
    [expenses],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = expenses.filter((e) => {
      if (cat !== "all" && e.category !== cat) return false;
      if (needle && !`${e.concept} ${e.vendor}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      if (sort === "amount") return b.amountPen - a.amountPen;
      if (sort === "concept") return a.concept.localeCompare(b.concept, "es");
      return (CAT_META[a.category]?.label ?? a.category).localeCompare(CAT_META[b.category]?.label ?? b.category, "es");
    });
    return rows;
  }, [expenses, q, cat, sort]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, Expense[]>();
    for (const e of filtered) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return Array.from(map.entries())
      .map(([category, rows]) => ({
        category,
        rows,
        subtotalPen: rows.reduce((s, r) => s + r.amountPen, 0),
      }))
      .sort((a, b) => b.subtotalPen - a.subtotalPen);
  }, [filtered, grouped]);

  // Total mensual de lo que se está mostrando (respeta búsqueda/filtro) — lo que
  // una tabla de gastos necesita al pie: ¿cuánto suma este set?
  const shown = useMemo(() => {
    const totalPen = filtered.reduce((s, r) => s + r.amountPen, 0);
    const recurringPen = filtered.reduce((s, r) => (r.recurring ? s + r.amountPen : s), 0);
    return { totalPen, recurringPen, count: filtered.length };
  }, [filtered]);
  const isFiltered = cat !== "all" || q.trim() !== "";

  const hasUsd = expenses.some((e) => e.currency === "USD");

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar concepto o proveedor…"
            className="h-12 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-12 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm font-bold text-[var(--text-secondary)] focus:border-[var(--accent)] outline-none"
        >
          <option value="all">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c} value={c}>{CAT_META[c]?.label ?? c}</option>
          ))}
        </select>
        <button onClick={() => setSort(sort === "amount" ? "concept" : sort === "concept" ? "category" : "amount")} className={CHIP}>
          <ArrowUpDown className="h-4 w-4" />
          {sort === "amount" ? "Monto" : sort === "concept" ? "Concepto" : "Categoría"}
        </button>
        <button
          onClick={() => setGrouped((g) => !g)}
          className={`${CHIP} ${grouped ? "border-[var(--accent)] text-[var(--text-primary)]" : ""}`}
        >
          <Layers className="h-4 w-4" /> Agrupar
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-[var(--rule-soft)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left text-sm font-bold text-[var(--text-tertiary)]">
            <tr>
              <th className="p-2">Concepto</th>
              <th className="p-2">Categoría</th>
              <th className="p-2 text-right">Monto</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-[var(--text-tertiary)]">
                  {expenses.length === 0 ? "No hay gastos. Agregá el primero." : "Ningún gasto coincide con el filtro."}
                </td>
              </tr>
            )}
            {groups
              ? groups.map((g) => (
                  <FragmentGroup key={g.category} category={g.category} subtotalPen={g.subtotalPen}>
                    {g.rows.map((x) => (
                      <Row key={x.id} x={x} busy={busy} onEdit={onEdit} onDelete={onDelete} />
                    ))}
                  </FragmentGroup>
                ))
              : filtered.map((x) => (
                  <Row key={x.id} x={x} busy={busy} onEdit={onEdit} onDelete={onDelete} />
                ))}
          </tbody>
          {shown.count > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
                <td className="p-2 text-sm font-bold text-[var(--text-secondary)]" colSpan={2}>
                  {shown.count} gasto{shown.count !== 1 ? "s" : ""}
                  {isFiltered && <span className="font-normal text-[var(--text-tertiary)]"> (filtrados)</span>}
                  {shown.recurringPen > 0 && (
                    <span className="block text-sm font-normal text-[var(--text-tertiary)]">
                      {fmtPen(shown.recurringPen)}/mes fijo (recurrente)
                    </span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums font-extrabold text-[var(--text-primary)]">
                  {fmtPen(shown.totalPen)}
                  <span className="block text-sm font-normal text-[var(--text-tertiary)]">/mes en total</span>
                </td>
                <td className="p-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <FxRateEditor fxRate={fxRate} busy={busy} hasUsd={hasUsd} onSaveFx={onSaveFx} />
    </div>
  );
}

/** Editor inline del tipo de cambio USD→PEN con el que se normalizan los totales. */
function FxRateEditor({
  fxRate, busy, hasUsd, onSaveFx,
}: {
  fxRate: number; busy: boolean; hasUsd: boolean; onSaveFx: (rate: number) => void;
}) {
  const [draft, setDraft] = useState(fxRate.toFixed(2));
  // Re-sembrar si cambia la tasa persistida (tras guardar / recargar).
  const [seed, setSeed] = useState(fxRate);
  if (seed !== fxRate) {
    setSeed(fxRate);
    setDraft(fxRate.toFixed(2));
  }

  const n = Number(draft);
  const dirty = Number.isFinite(n) && n > 0 && Math.abs(n - fxRate) > 1e-9;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
      <DollarSign className="h-4 w-4" />
      <span>Cambio USD→S/:</span>
      <input
        className="h-9 w-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-right tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
        type="number"
        step="0.01"
        min="0.5"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {dirty && (
        <button
          onClick={() => onSaveFx(Math.round(n * 100) / 100)}
          disabled={busy}
          className="h-9 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-contrast,#fff)] disabled:opacity-50"
        >
          Guardar
        </button>
      )}
      {hasUsd && <span>· así se normalizan los montos en USD para los totales mensuales.</span>}
    </div>
  );
}

/** Encabezado de grupo (categoría + subtotal) seguido de sus filas. */
function FragmentGroup({
  category, subtotalPen, children,
}: {
  category: string; subtotalPen: number; children: React.ReactNode;
}) {
  const Icon = CAT_ICONS[category] ?? MoreHorizontal;
  return (
    <>
      <tr className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50">
        <td colSpan={3} className="p-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
            <Icon className="h-4 w-4" /> {CAT_META[category]?.label ?? category}
          </span>
        </td>
        <td className="p-2 text-right tabular-nums text-sm font-extrabold text-[var(--text-primary)]">{fmtPen(subtotalPen)}/mes</td>
      </tr>
      {children}
    </>
  );
}
