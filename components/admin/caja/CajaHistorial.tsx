"use client";

/**
 * Historial de cajas cerradas: la tendencia de las diferencias (mejora 11) y
 * la tabla con el buscador pegado. Antes eran tarjetas-botón apiladas (una
 * pantalla por cada ~6 cajas); ahora una fila por caja y en el celular la
 * tabla pasa a tarjetas sola (`useMobileTableCards`).
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CardTitle, EmptyState } from "@buleje/design-system";
import { History, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { fmt, fmtDate, fmtDateShort, type CashRegister } from "./tipos";

const CashRegisterChart = dynamic(() => import("../cash-register/CashRegisterChart"), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />,
});

type Tendencia = { label: string; color: string } | null;

function tendenciaDe(diffs: number[]): Tendencia {
  if (diffs.length >= 10) {
    const prom = (xs: number[]) => xs.reduce((s, v) => s + Math.abs(v), 0) / xs.length;
    const ultimos = prom(diffs.slice(-5));
    const previos = prom(diffs.slice(-10, -5));
    if (ultimos < previos * 0.8) return { label: "Mejorando", color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" };
    if (ultimos > previos * 1.2) return { label: "Empeorando", color: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30" };
    return { label: "Estable", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  }
  if (diffs.length >= 5) return { label: "Sin suficientes datos para tendencia", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  return null;
}

export function CajaHistorial({ cerradas, tolerancia, onVer }: { cerradas: CashRegister[]; tolerancia: number; onVer: (r: CashRegister) => void }) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return cerradas;
    return cerradas.filter((r) => [fmtDate(r.openedAt), r.closedAt ? fmtDate(r.closedAt) : "", r.notes ?? ""].some((t) => t.toLowerCase().includes(q)));
  }, [cerradas, busca]);

  const diffs = cerradas.slice(0, 30).map((r) => r.difference ?? 0).reverse();

  return (
    <div className="space-y-4">
      {cerradas.length > 2 && (
        <CashRegisterChart sparkData={diffs.map((d, i) => ({ idx: i, diff: d, pos: d >= 0 ? d : 0, neg: d < 0 ? d : 0 }))} diffsCount={diffs.length} tendencia={tendenciaDe(diffs)} />
      )}

      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Cajas cerradas · {cerradas.length}</CardTitle>
          <InfoTip what={`Cada cierre con su diferencia. «Dentro de tolerancia» = diferencia de hasta ± S/ ${tolerancia}.`} example="Toca una fila para ver de dónde vino el efectivo y si cuadró con las ventas." />
          {cerradas.length > 0 && (
            <label className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por fecha o notas…"
                aria-label="Buscar en el historial"
                className="w-full pl-9 pr-3 min-h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          )}
        </div>
        {filtradas.length === 0 ? (
          <EmptyState icon={History} title={busca ? "Nada con esa búsqueda" : "Sin historial de cajas"} description={busca ? "Prueba con otra fecha." : "Los cierres de caja aparecerán aquí."} className="p-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 sm:px-5 py-2 font-semibold">Fecha</th>
                  <th className="px-2 py-2 font-semibold text-right">Movs.</th>
                  <th className="px-2 py-2 font-semibold text-right">Apertura</th>
                  <th className="px-2 py-2 font-semibold text-right">Esperado</th>
                  <th className="px-2 py-2 font-semibold text-right">Cierre</th>
                  <th className="px-2 py-2 font-semibold text-right">Diferencia</th>
                  <th className="px-4 sm:px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtradas.map((r) => {
                  const diff = r.difference ?? 0;
                  /* Cierre automático = nadie contó: la diferencia 0 no es un cuadre. */
                  const sinConteo = esCierreAutomatico(r.notes);
                  const ok = !sinConteo && Math.abs(diff) <= tolerancia;
                  return (
                    <tr key={r.id} onClick={() => onVer(r)} className="cursor-pointer hover:bg-[var(--surface-alt)] transition-colors">
                      <td className="px-4 sm:px-5 py-2.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onVer(r); }} className="text-left font-semibold text-[var(--text-primary)] hover:text-primary">
                          {fmtDateShort(r.openedAt)} → {r.closedAt ? fmtDateShort(r.closedAt) : "—"}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{r.movements.length}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{fmt(r.openingAmount)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{fmt(r.expectedAmount ?? 0)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-bold text-[var(--text-primary)]">{sinConteo ? "—" : fmt(r.closingAmount ?? 0)}</td>
                      <td className={cn("px-2 py-2.5 text-right tabular-nums font-bold", sinConteo ? "text-[var(--text-tertiary)]" : ok ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : diff > 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                        {sinConteo ? "—" : <>{diff > 0 ? "+" : ""}{fmt(diff)}</>}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5">
                        <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", sinConteo ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : ok ? "bg-primary/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)]")}>
                          {sinConteo ? "Cerrada sin conteo" : ok ? `Dentro de tolerancia (±S/${tolerancia})` : "Fuera de tolerancia"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
