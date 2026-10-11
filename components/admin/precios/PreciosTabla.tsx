"use client";

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowDownRight, ArrowUpRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { FILAS_VISIBLES, fmtFecha, variacionPct, type PriceRecord } from "./precios-compartido";

interface Props {
  filas: PriceRecord[];
  nombres: Record<number, string>;
  /** En el editor de un producto no hace falta la columna «Producto». */
  conProducto: boolean;
}

/** La tabla del historial a 14 px: fecha, producto, antes, ahora, % y quién. */
export default function PreciosTabla({ filas, nombres, conProducto }: Props) {
  const [verTodos, setVerTodos] = useState(false);
  const lista = verTodos ? filas : filas.slice(0, FILAS_VISIBLES);
  return (
    <div className="space-y-2">
      <DataTable className="min-w-[600px] text-sm [&_td]:text-sm [&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal">
        <thead>
          <tr>
            <th>Fecha</th>
            {conProducto && <th>Producto</th>}
            <th className="text-right">Antes</th>
            <th className="text-right">Ahora</th>
            <th className="text-right">Cambio</th>
            <th className="hidden sm:table-cell">Lo cambió</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((h) => {
            const pct = variacionPct(h);
            const sube = h.newPrice > h.oldPrice;
            return (
              <tr key={h.id}>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">{fmtFecha(h.changedAt)}</td>
                {conProducto && (
                  <td className="font-semibold text-[var(--text-primary)]">{nombres[h.productId] ?? `Producto #${h.productId}`}</td>
                )}
                <td className="text-right tabular-nums text-[var(--text-secondary)] line-through">{formatCurrency(h.oldPrice)}</td>
                <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(h.newPrice)}</td>
                <td className="text-right">
                  <span className={cn("inline-flex items-center gap-0.5 font-bold tabular-nums", sube ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]")}>
                    {sube ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : <ArrowDownRight className="h-4 w-4" aria-hidden />}
                    {pct != null ? `${sube ? "+" : ""}${pct.toFixed(1)}%` : "N/A"}
                  </span>
                </td>
                <td className="hidden text-[var(--text-secondary)] sm:table-cell">{h.changedBy ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {lista.length < filas.length && (
        <button
          type="button"
          onClick={() => setVerTodos(true)}
          className="h-12 w-full rounded-xl border border-dashed border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          Ver los {filas.length - lista.length} cambios restantes
        </button>
      )}
    </div>
  );
}
