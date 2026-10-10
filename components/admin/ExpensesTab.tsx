"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { Wallet, Plus, Calendar, BarChart2, RefreshCw } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { formatCurrency, formatMonth } from "@/lib/format";
import { diaDelGasto, primeroDelMes } from "@/lib/gastos/lista-gastos";
import GastoNuevoModal from "@/components/admin/gastos/GastoNuevoModal";
import ListaGastos, { type GastoDeLaLista } from "@/components/admin/gastos/ListaGastos";
import type { GastoGuardado } from "@/components/admin/gastos/use-gasto-nuevo";

type Expense = GastoDeLaLista;

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
  const [error, setError] = useState(false);
  /** Filtra la lista; se elige en el selector o tocando una tarjeta de categoría. */
  const [categoria, setCategoria] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tick, setTick] = useState(0);
  const [historicExpenses, setHistoricExpenses] = useState<Expense[]>([]);
  // Los gastos fijos configurados (Expense.recurring=true) son PLANTILLAS: el
  // acuerdo de pagar el alquiler, no el alquiler pagado. Desde que dejaron de
  // sumar al total —contarlos inflaba el P&L con plata que nadie desembolsó—
  // hay que decir que existen, o desaparecen sin explicación.
  const [templates, setTemplates] = useState<Expense[]>([]);

  // Días de Pucallpa, no de UTC: con `toISOString()` a partir de las 19:00 el
  // «desde» salía el 2 y los gastos del 1 se perdían de la lista y del total.
  const [from, setFrom] = useState(() => primeroDelMes(limaDateKey()));
  const [to, setTo] = useState(() => limaDateKey());

  useEffect(() => {
    let active = true;
    // Sólo la primera carga tapa la vista: al borrar o cambiar fechas, la lista
    // queda (con lo que escribiste en el buscador) hasta que llega la nueva.
    Promise.all([
      fetch(`/api/expenses?from=${from}&to=${to}&caja=1`).then(r => {
        if (!r.ok) throw new Error(`gastos ${r.status}`);
        return r.json() as Promise<Expense[]>;
      }),
      fetch("/api/expenses/summary").then(r => r.ok ? r.json() : []),
      fetch("/api/expenses?recurring=true").then(r => r.ok ? r.json() : []),
    ]).then(([exp, sum, tpl]) => {
      if (active) {
        setExpenses(Array.isArray(exp) ? exp : []);
        setSummary(Array.isArray(sum) ? sum : []);
        setTemplates(Array.isArray(tpl) ? tpl : []);
        setError(false);
        setLoading(false);
      }
    }).catch((err) => {
      console.warn("[ExpensesTab] la lista de gastos no cargó:", err);
      if (active) { setError(true); setLoading(false); }
    });
    return () => { active = false; };
  }, [from, to, tick]);

  // Los últimos 6 meses para el gráfico (no dependen del filtro de fechas).
  useEffect(() => {
    const hoy = limaDateKey();
    fetch(`/api/expenses?from=${primeroDelMes(hoy, 5)}&to=${hoy}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setHistoricExpenses(Array.isArray(data) ? data : []))
      .catch((err) => console.warn("[ExpensesTab] /api/expenses failed:", err));
  }, [tick]);

  const monthlyExpenseData = useMemo(() => {
    const hoy = limaDateKey();
    return Array.from({ length: 6 }, (_, i) => {
      const mes = primeroDelMes(hoy, 5 - i);
      // El mes del DÍA del gasto: el anotado el 1 sin hora es medianoche UTC
      // y con `getMonth()` en Lima caía en el mes anterior.
      const total = historicExpenses
        .filter(e => diaDelGasto(e.date).slice(0, 7) === mes.slice(0, 7))
        .reduce((s, e) => s + Number(e.amount), 0);
      return { label: formatMonth(mes, { soloFecha: true }), total };
    });
  }, [historicExpenses]);

  const totalPeriod = expenses.reduce((s, e) => s + Number(e.amount), 0);
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
            <button
              type="button"
              key={s.category}
              aria-pressed={categoria === s.category}
              title={categoria === s.category ? "Ver todas las categorías" : `Ver sólo ${s.category} en la lista`}
              onClick={() => setCategoria(c => (c === s.category ? null : s.category))}
              className={cn(
                "bg-[var(--surface-raised)] border rounded-xl p-3 text-center transition hover:bg-[var(--surface-sunken)]",
                categoria === s.category ? "border-[var(--accent)] dark:border-[var(--accent)] ring-2 ring-[var(--accent-muted)]"
                  : s.category === maxCat?.category ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]",
              )}
            >
              <span className="block font-extrabold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{Number(s.total).toFixed(0)}</span>
              <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] capitalize">{s.category} ({s.count})</span>
              {totalAll > 0 && <span className="mt-1 block h-1 bg-[var(--surface-sunken)] rounded-full overflow-hidden"><span className="block h-full bg-primary rounded-full" style={{ width: `${(s.total / totalAll) * 100}%` }} /></span>}
            </button>
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

      {/* La lista del período: buscar, filtrar, CSV y borrar con confirmación. */}
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">No se pudieron cargar los gastos del período.</p>
          <button type="button" onClick={() => setTick(v => v + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <RefreshCw className="h-4 w-4" aria-hidden />Reintentar
          </button>
        </div>
      ) : (
        <ListaGastos
          gastos={expenses}
          desde={from}
          hasta={to}
          categoria={categoria}
          onCategoria={setCategoria}
          onNuevo={() => setShowForm(true)}
          onCambio={() => setTick(v => v + 1)}
        />
      )}
    </div>
  );
}

