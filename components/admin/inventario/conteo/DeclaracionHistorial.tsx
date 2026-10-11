import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { BarChart3, ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { HistorialEntry } from "./declaracion-tipos";

/** Las declaraciones que ya generaste en este navegador (las últimas 12). */
export function DeclaracionHistorial({ historial }: { historial: HistorialEntry[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-raised)]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">Declaraciones anteriores</span>
          {historial.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{historial.length}</span>
          )}
        </span>
        {abierto ? <ChevronUp className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden /> : <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />}
      </button>
      {abierto && (
        <div className="border-t border-[var(--rule-soft)]">
          {historial.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">Genera tu primera declaración para empezar el historial.</p>
          ) : (
            <DataTable className="min-w-[500px] sm:min-w-0">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="text-right">Productos</th>
                  <th className="hidden text-right sm:table-cell">Unidades</th>
                  <th className="text-right">Valor costo</th>
                  <th className="hidden text-right sm:table-cell">Valor venta</th>
                </tr>
              </thead>
              <tbody>
                {[...historial].reverse().map((h, i) => {
                  const idx = historial.length - 1 - i;
                  const anterior = idx > 0 ? historial[idx - 1] : null;
                  const dif = anterior ? h.valorCosto - anterior.valorCosto : 0;
                  return (
                    <tr key={h.savedAt + i}>
                      <td className="text-[var(--text-secondary)]">{formatDate(h.fecha + "T00:00:00")}</td>
                      <td className="text-right font-medium text-[var(--text-primary)]">{h.totalProductos}</td>
                      <td className="hidden text-right text-[var(--text-primary)] sm:table-cell">{h.totalUnidades}</td>
                      <td className="text-right font-medium text-[var(--text-primary)]">
                        {formatCurrency(h.valorCosto)}
                        {anterior && (
                          <span className={cn("ml-1 text-sm", dif > 0 ? "text-[var(--data-success-ink)]" : dif < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>
                            {dif > 0 ? "+" : ""}{((dif / (anterior.valorCosto || 1)) * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="hidden text-right text-[var(--text-secondary)] sm:table-cell">{formatCurrency(h.valorPrecio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>
      )}
    </div>
  );
}
