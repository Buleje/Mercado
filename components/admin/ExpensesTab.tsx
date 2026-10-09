"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useMemo } from "react";
import { Wallet, Plus, Trash2, Calendar, TrendingUp, BarChart2, Receipt, Camera } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { formatCurrency, formatDateNumeric, formatMonth } from "@/lib/format";
import GastoNuevoModal from "@/components/admin/gastos/GastoNuevoModal";
import { iconoDeCategoria } from "@/components/admin/gastos/categorias";
import type { GastoGuardado } from "@/components/admin/gastos/use-gasto-nuevo";

type Expense = {
  id: string; category: string; description: string; amount: number; date: string; recurring: boolean;
  documentType?: string | null; documentNumber?: string | null; igvAmount?: number | null; attachmentUrl?: string | null;
};

/** «Factura F001-123 · IGV S/ 18.00» — lo que dice el papel del gasto, si tiene. */
function papelDelGasto(e: Expense): string | null {
  if (!e.documentType || e.documentType === "sin_comprobante") return null;
  const tipo = e.documentType.charAt(0).toUpperCase() + e.documentType.slice(1);
  const igv = e.documentType === "factura" && e.igvAmount != null
    ? e.igvAmount > 0 ? ` · IGV ${formatCurrency(e.igvAmount)}` : " · exonerada"
    : "";
  return `${tipo}${e.documentNumber ? ` ${e.documentNumber}` : ""}${igv}`;
}

/** Lo que se le cuenta a la persona después de guardar. */
function avisoGuardado(r: GastoGuardado): void {
  if (!r.caja) toast.success(`Gasto de ${formatCurrency(r.monto)} guardado`);
  else if (r.caja.sinCaja) toast.warning("Gasto guardado. No había caja abierta: la caja no se tocó.");
  else toast.success(`Gasto guardado y ${formatCurrency(r.monto)} salieron de la caja`);
}
type Summary = { category: string; total: number; count: number };

export default function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tick, setTick] = useState(0);
  const [historicExpenses, setHistoricExpenses] = useState<Expense[]>([]);
  // Los gastos fijos configurados (Expense.recurring=true) son PLANTILLAS: el
  // acuerdo de pagar el alquiler, no el alquiler pagado. Desde que dejaron de
  // sumar al total —contarlos inflaba el P&L con plata que nadie desembolsó—
  // hay que decir que existen, o desaparecen sin explicación.
  const [templates, setTemplates] = useState<Expense[]>([]);

  // filters
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/expenses?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []),
      fetch("/api/expenses/summary").then(r => r.ok ? r.json() : []),
      fetch("/api/expenses?recurring=true").then(r => r.ok ? r.json() : []),
    ]).then(([exp, sum, tpl]) => {
      if (active) {
        setExpenses(exp);
        setSummary(sum);
        setTemplates(Array.isArray(tpl) ? tpl : []);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, tick]);

  // Fetch last 6 months for the comparison chart (independent of date filter)
  useEffect(() => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const fromStr = sixMonthsAgo.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);
    fetch(`/api/expenses?from=${fromStr}&to=${toStr}&limit=1000`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setHistoricExpenses(data))
      .catch((err) => console.warn("[ExpensesTab] /api/expenses failed:", err));
  }, [tick]);

  const monthlyExpenseData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const total = historicExpenses
        .filter(e => {
          const ed = new Date(e.date);
          return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
        })
        .reduce((s, e) => s + e.amount, 0);
      return { label: formatMonth(d), total };
    });
  }, [historicExpenses]);

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", headers: csrfHeaders() });
      const body = (await res.json().catch(() => ({}))) as { error?: string; caja?: { retiro: string; aviso: string } };
      if (!res.ok) toast.error(body.error ?? "No se pudo borrar el gasto");
      // Si el gasto había salido de la caja: la plata volvió, o quedó en una caja ya cerrada.
      else if (body.caja?.retiro === "cerrada") toast.warning(body.caja.aviso);
      else if (body.caja) toast.success(body.caja.aviso);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar el gasto");
    }
    setTick(v => v + 1);
  };

  const totalPeriod = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAll = summary.reduce((s, item) => s + item.total, 0);
  const maxCat = summary.length > 0 ? summary.reduce((a, b) => a.total > b.total ? a : b) : null;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><Wallet className="h-6 w-6 text-primary" />Control de Gastos</SectionTitle>
        <button onClick={() => setShowForm(true)} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition flex flex-wrap items-center gap-2"><Plus className="h-4 w-4" />Nuevo Gasto</button>
      </div>

      {/* Date filter + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3">
          <Calendar className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Desde" className="bg-transparent text-sm flex-1 min-w-0" />
          <span className="text-[var(--text-tertiary)]">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Hasta" className="bg-transparent text-sm flex-1 min-w-0" />
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-error-500)]">{formatCurrency(totalPeriod)}</p>
          <p className="text-xs text-[var(--text-tertiary)]">Este periodo</p>
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(totalAll)}</p>
          <p className="text-xs text-[var(--text-tertiary)]">Total histórico</p>
        </div>
      </div>

      {/* Los fijos configurados: existen, pero todavía no son plata gastada. */}
      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
          <Calendar className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
          <p className="flex-1 min-w-[200px] text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">
              {templates.length} gasto{templates.length === 1 ? "" : "s"} fijo{templates.length === 1 ? "" : "s"} configurado{templates.length === 1 ? "" : "s"}
            </span>{" "}
            por {formatCurrency(templates.reduce((s, t) => s + Number(t.amount), 0))} al período. No suman
            acá hasta que registres el pago.
          </p>
          <a
            href="?tab=compras&vista=punto-compra"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
          >
            Ver el catálogo
          </a>
        </div>
      )}

      {/* Category summary */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.map(s => (
            <div key={s.category} className={cn("bg-[var(--surface-raised)] border rounded-xl p-3 text-center", s.category === maxCat?.category ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]")}>
              <p className="font-extrabold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(s.total).toFixed(0)}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] capitalize">{s.category} ({s.count})</p>
              {totalAll > 0 && <div className="mt-1 h-1 bg-[var(--surface-sunken)] rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(s.total / totalAll) * 100}%` }} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* Monthly expense trend chart */}
      {monthlyExpenseData.some(m => m.total > 0) && (() => {
        const maxVal = Math.max(...monthlyExpenseData.map(m => m.total), 1);
        return (
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 ">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Gastos mensuales (6 meses)</CardTitle>
            </div>
            <div className="flex flex-wrap items-end gap-2 h-28">
              {monthlyExpenseData.map((m, i) => {
                const barH = m.total > 0 ? Math.max((m.total / maxVal) * 80, 4) : 4;
                const isCurrent = i === 5;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1 group">
                    <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      S/{Number(m.total).toFixed(0)}
                    </span>
                    <div
                      className={cn("w-full rounded-t-md transition-all", isCurrent ? "bg-[var(--data-error-500)]" : "bg-[var(--data-error-500)]/70 dark:bg-[var(--data-error-500)]/40")}
                      style={{ height: `${barH}px`, opacity: m.total > 0 ? 1 : 0.25 }}
                      title={`${m.label}: ${formatCurrency(Number(m.total))}`}
                    />
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted capitalize">{m.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <GastoNuevoModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onGuardado={(r) => { setShowForm(false); setTick(v => v + 1); avisoGuardado(r); }}
      />

      {/* Expenses list */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl">
          <TrendingUp className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Sin gastos registrados</p>
          <p className="text-sm text-[var(--text-tertiary)]">Agrega un gasto para empezar</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-100 overflow-y-auto">
          {expenses.map(e => {
            const CatIcon = iconoDeCategoria(e.category);
            const papel = papelDelGasto(e);
            return (
            <div key={e.id} className="flex flex-wrap items-center gap-3 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 sm:px-4 py-2 sm:py-3">
              <div className="h-8 w-8 rounded-lg bg-[var(--surface-canvas)] border border-[var(--rule-base)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                <CatIcon className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{decodeExpenseDescription(e.description).description || "—"}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{formatDateNumeric(e.date)} · <span className="capitalize">{e.category}</span>{e.recurring && " · Recurrente"}</p>
                {papel && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Receipt className="h-3 w-3 shrink-0" aria-hidden />{papel}
                    {e.attachmentUrl && (
                      <a href={e.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Ver la foto del comprobante" className="ml-1 inline-flex items-center text-[var(--accent-dark)] hover:underline">
                        <Camera className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                )}
              </div>
              <p className="font-extrabold text-[var(--data-error-500)] shrink-0">-{formatCurrency(Number(e.amount))}</p>
              <button aria-label="Eliminar" onClick={() => remove(e.id)} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition"><Trash2 className="h-4 w-4" /></button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

