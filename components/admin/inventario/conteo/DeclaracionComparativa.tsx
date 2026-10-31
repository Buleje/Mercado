"use client";

import { DataTable } from "@buleje/design-system";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { resumenPorCategoria, type DeclaracionAnterior, type DeclaracionData } from "./declaracion-tipos";

interface Fila { cat: string; antes: number; ahora: number; d: number; p: number }

/** Sin orden elegido, llega la que más descuadra primero; «Diferencia» ordena por cuánto se movió (sube o baja). */
const ACCESORES: Record<string, AccesorOrden<Fila>> = {
  cat: { valor: (f) => f.cat, texto: true },
  antes: { valor: (f) => f.antes },
  ahora: { valor: (f) => f.ahora },
  dif: { valor: (f) => Math.abs(f.d) },
};

/** Esta declaración contra la anterior, categoría por categoría. */
export function DeclaracionComparativa({ data, prev }: { data: DeclaracionData; prev: DeclaracionAnterior | null }) {
  const orden = useOrdenColumna(ACCESORES);
  const filas = useMemo<Fila[]>(() => {
    if (!prev) return [];
    const actuales = resumenPorCategoria(data);
    const cats = Array.from(new Set([...Object.keys(actuales), ...Object.keys(prev.categorias)]));
    return cats
      .map((cat) => {
        const antes = prev.categorias[cat]?.unidades ?? 0;
        const ahora = actuales[cat]?.unidades ?? 0;
        const d = ahora - antes;
        return { cat, antes, ahora, d, p: antes > 0 ? (d / antes) * 100 : ahora > 0 ? 100 : 0 };
      })
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.cat.localeCompare(b.cat));
  }, [data, prev]);
  if (!prev) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Es tu primera declaración: todavía no hay otra con qué comparar.</p>
      </div>
    );
  }
  const total = data.valorCosto ?? 0;
  const totalPrev = prev.valorTotal ?? 0;
  const dif = total - totalPrev;
  const pct = totalPrev > 0 ? (dif / totalPrev) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-raised)]">
      <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--text-primary)]">Contra la declaración anterior ({formatDate(prev.fecha + "T00:00:00")})</p>
      </div>
      <DataTable>
        <thead>
          <tr>
            <ThColumna label="Categoría" orden={orden} ordenId="cat" />
            <ThColumna label="Antes" derecha orden={orden} ordenId="antes" />
            <ThColumna label="Ahora" derecha orden={orden} ordenId="ahora" />
            <ThColumna label="Diferencia" derecha orden={orden} ordenId="dif" />
            <th className="text-center">Tendencia</th>
          </tr>
        </thead>
        <tbody>
          {orden.ordenar(filas).map(({ cat, antes, ahora, d, p }) => {
            const sube = d > 0;
            const baja = d < 0;
            const caidaFuerte = p < -20;
            return (
              <tr key={cat}>
                <td className="font-medium">{cat}</td>
                <td className="text-right text-[var(--text-secondary)]">{antes} uds</td>
                <td className="text-right font-medium">{ahora} uds</td>
                <td className={cn("text-right font-bold", caidaFuerte ? "text-[var(--data-error-ink)]" : sube ? "text-[var(--data-success-ink)]" : baja ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]")}>
                  {sube ? "+" : ""}{d} ({p > 0 ? "+" : ""}{p.toFixed(0)}%)
                </td>
                <td className="text-center" aria-label={sube ? "Sube" : baja ? "Baja" : "Igual"}>
                  {sube ? <span className="text-[var(--data-success-ink)]">&#8593;</span> : baja ? <span className={caidaFuerte ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]"}>&#8595;</span> : <span className="text-[var(--text-secondary)]">&#8594;</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-soft)] px-4 py-3 text-sm">
        <span className="text-[var(--text-secondary)]">Valor anterior: <strong>{formatCurrency(totalPrev)}</strong></span>
        <span className="text-[var(--text-secondary)]">Ahora: <strong>{formatCurrency(total)}</strong></span>
        <span className={cn("font-bold", dif > 0 ? "text-[var(--data-success-ink)]" : dif < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>
          {dif > 0 ? "+" : ""}{formatCurrency(dif)} ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}
