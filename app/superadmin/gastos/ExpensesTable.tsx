"use client";

/**
 * ExpensesTable — lista de gastos reales con búsqueda, filtro por categoría,
 * orden (monto/concepto), agrupar por categoría con subtotales, y acciones
 * editar/eliminar. Muestra el tipo de cambio con que se normalizó USD→PEN.
 */

import { useMemo, useState } from "react";
import {
  Server, MessageSquare, Sparkles, CreditCard, Users, Megaphone, MoreHorizontal,
  Search, ArrowUpDown, Layers, Pencil, Trash2,
} from "@buleje/design-system/icons";
import { CAT_META, fmtPen, fmtUsd, type Expense } from "./gastos-helpers";

const CAT_ICONS: Record<string, typeof Server> = {
  infra: Server, mensajeria: MessageSquare, ia: Sparkles, pagos: CreditCard,
  personal: Users, marketing: Megaphone, otros: MoreHorizontal,
};

type SortKey = "amount" | "concept" | "category";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

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
    <tr className="border-t border-[var(--surface-border)]">
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
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
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
  expenses, loading, busy, fxRate, onEdit, onDelete,
}: {
  expenses: Expense[];
  loading: boolean;
  busy: boolean;
  fxRate: number;
  onEdit: (x: Expense) => void;
  onDelete: (id: string) => void;
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
            className="h-12 w-full rounded-lg border-2 border-[var(--surface-border)] bg-[var(--surface-1)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-12 rounded-lg border-2 border-[var(--surface-border)] bg-[var(--surface-1)] px-3 text-sm font-bold text-[var(--text-secondary)] focus:border-[var(--accent)] outline-none"
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
      <div className="overflow-hidden rounded-xl border-2 border-[var(--surface-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-left text-sm font-bold text-[var(--text-tertiary)]">
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
        </table>
      </div>

      {hasUsd && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Los montos en USD se normalizan a PEN al cambio S/ {fxRate.toFixed(2)} para los totales mensuales.
        </p>
      )}
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
      <tr className="border-t border-[var(--surface-border)] bg-[var(--surface-2)]/50">
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
