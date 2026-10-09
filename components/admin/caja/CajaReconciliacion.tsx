"use client";

/**
 * Reconciliación por día: flujo de EFECTIVO de los últimos 7 días y, por cada
 * día con cierres, esperado contra real. Salió de CashRegisterTab.
 */
import { CardTitle, DataTable, EmptyState } from "@buleje/design-system";
import { AlertTriangle, Check, History } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaLocal, ultimosDiasLocales } from "@/lib/fechas/dia-local";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { formatDateShort, formatWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmt, type CashRegister } from "./tipos";

type FilaDia = { date: string; count: number; totalExpected: number; totalClosing: number; totalDiff: number };

export function CajaReconciliacion({ cerradas, tolerancia }: { cerradas: CashRegister[]; tolerancia: number }) {
  const porDia = new Map<string, FilaDia>();
  for (const r of cerradas) {
    // Día local: con el ISO crudo, un cierre de las 20:00 caía en la fila del día siguiente.
    const day = diaLocal(r.closedAt ?? r.openedAt);
    const f = porDia.get(day) ?? { date: day, count: 0, totalExpected: 0, totalClosing: 0, totalDiff: 0 };
    f.count++;
    f.totalExpected += r.expectedAmount ?? 0;
    f.totalClosing += r.closingAmount ?? 0;
    f.totalDiff += r.difference ?? 0;
    porDia.set(day, f);
  }
  const filas = Array.from(porDia.values()).sort((a, b) => b.date.localeCompare(a.date));
  const discrepancia = filas.reduce((s, r) => s + Math.abs(r.totalDiff), 0);

  /* Flujo de EFECTIVO de 7 días: día local (no UTC), sin sumar el fondo de
     apertura como ingreso y sin las ventas de Yape/tarjeta (no pasan por el cajón). */
  const semana = ultimosDiasLocales(7).map((date) => {
    let income = 0;
    let expenses = 0;
    for (const reg of cerradas.filter((r) => diaLocal(r.closedAt ?? r.openedAt) === date)) {
      const s = saldoEsperadoDeCaja(0, reg.movements);
      income += s.ventasEfectivo + s.ingresos;
      expenses += s.egresos;
    }
    return { date, income, expenses, net: income - expenses };
  });
  const entra = semana.reduce((s, d) => s + d.income, 0);
  const sale = semana.reduce((s, d) => s + d.expenses, 0);
  const maxBar = Math.max(...semana.map((d) => Math.max(d.income, d.expenses)), 1);

  return (
    <div className="space-y-4">
      <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Flujo de efectivo de la semana</CardTitle>
          <InfoTip what="Sólo lo que entra y sale del cajón: ventas en efectivo + ingresos contra retiros. El fondo de apertura no cuenta como ingreso." />
          <span className="ml-auto flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden />Ingresos</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" aria-hidden />Egresos</span>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3">
          {semana.map((d) => (
            <div key={d.date} className="flex flex-col items-center min-w-0">
              <div className="w-full h-20 flex items-end justify-center gap-0.5 mb-1">
                <div className="w-2.5 bg-primary rounded-t transition-all" style={{ height: `${(d.income / maxBar) * 80}px` }} title={`Ingresos: ${fmt(d.income)}`} />
                <div className="w-2.5 bg-[var(--data-error-500)] rounded-t transition-all" style={{ height: `${(d.expenses / maxBar) * 80}px` }} title={`Egresos: ${fmt(d.expenses)}`} />
              </div>
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">{formatWeekday(d.date + "T12:00:00")}</p>
              <p className={cn("hidden sm:block text-xs font-bold tabular-nums", d.net >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(d.net)}</p>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-[var(--rule-soft)] flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
          <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Ingresos: {fmt(entra)}</span>
          <span className="text-[var(--data-error-500)]">Egresos: {fmt(sale)}</span>
          <span className={entra - sale >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}>Neto: {fmt(entra - sale)}</span>
        </div>
      </section>

      <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Por día</CardTitle>
          <span className="text-[var(--text-secondary)]">Días con cierres <b className="text-[var(--text-primary)] tabular-nums">{filas.length}</b></span>
          <span className="text-[var(--text-secondary)]">Total recaudado <b className="text-[var(--text-primary)] tabular-nums">{fmt(filas.reduce((s, r) => s + r.totalClosing, 0))}</b></span>
          <span className="text-[var(--text-secondary)]">
            Diferencia acumulada{" "}
            <b className={cn("tabular-nums", discrepancia > 10 ? "text-[var(--data-error-500)]" : discrepancia > 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]")}>{fmt(discrepancia)}</b>
          </span>
        </div>
        {filas.length === 0 ? (
          <EmptyState icon={History} title="Sin cajas cerradas" description="No hay cierres en el rango seleccionado." className="p-6" />
        ) : (
          <DataTable className="text-sm">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="text-right">Esperado</th>
                <th className="text-right">Real</th>
                <th className="text-right">Diferencia</th>
                <th className="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((row) => {
                const diff = row.totalDiff;
                const ok = Math.abs(diff) <= tolerancia;
                const menor = !ok && Math.abs(diff) <= tolerancia * 2;
                return (
                  <tr key={row.date} className={!ok ? "bg-[var(--data-error-50)]/30" : undefined}>
                    <td>
                      <p className="font-bold text-[var(--text-primary)]">{formatWeekday(row.date + "T12:00:00")} {formatDateShort(row.date + "T12:00:00")}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{row.count} caja{row.count > 1 ? "s" : ""}</p>
                    </td>
                    <td className="text-right text-[var(--text-secondary)] font-semibold tabular-nums">{fmt(row.totalExpected)}</td>
                    <td className="text-right font-bold text-[var(--text-primary)] tabular-nums">{fmt(row.totalClosing)}</td>
                    <td className={cn("text-right font-extrabold tabular-nums", ok ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : menor ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                      {diff > 0 ? "+" : ""}
                      {fmt(diff)}
                    </td>
                    <td className="text-center">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold"><Check className="h-4 w-4" aria-hidden />OK</span>
                      ) : menor ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-700)] text-xs font-bold"><AlertTriangle className="h-4 w-4" aria-hidden />Menor</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] text-xs font-bold"><AlertTriangle className="h-4 w-4" aria-hidden />Alerta</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
