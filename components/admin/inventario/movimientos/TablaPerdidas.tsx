"use client";

/**
 * Las pérdidas: fecha, producto, cuánto, a qué costo y por qué. Toda la fila
 * abre la ficha del movimiento (la misma del kardex: se puede revertir). El
 * filtro de causa vive en la fila de filtros, ya no también en el `<th>`.
 */
import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { soles } from "./use-indicadores";
import { CAUSA, causaDe, diaDelMovimiento, type Movimiento } from "./tipos";

export type FilaPerdida = Movimiento & { productName: string; categoria: string; costo: number; perdida: number };

export const COLUMNAS_PERDIDAS = ["fecha", "producto", "cantidad", "costo", "perdida", "motivo"];

interface Props {
  filas: readonly FilaPerdida[];
  hoy: string;
  orden: { orden: readonly string[]; refCabecera: (el: HTMLTableSectionElement | null) => void };
  onVer: (p: FilaPerdida) => void;
}

export function TablaPerdidas({ filas, hoy, orden, onVer }: Props) {
  return (
    <DataTable className="min-w-[640px] [&_tbody_td]:py-1.5! [&_tbody_td]:align-top">
      <thead ref={orden.refCabecera}>
        <tr>
          <EnOrden
            orden={orden.orden}
            celdas={{
              fecha: <th data-col="fecha">Cuándo</th>,
              producto: <th data-col="producto">Producto</th>,
              cantidad: <th data-col="cantidad" className="text-right">Cantidad</th>,
              costo: <th data-col="costo" className="text-right" title="Costo de hoy del producto">Costo u.</th>,
              perdida: <th data-col="perdida" className="text-right">Pérdida</th>,
              motivo: <th data-col="motivo">Causa</th>,
            }}
          />
        </tr>
      </thead>
      <tbody>
        {filas.map((p) => {
          const causa = CAUSA[causaDe(p.lossType)];
          return (
            <tr
              key={p.id}
              onClick={() => onVer(p)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVer(p); } }}
              tabIndex={0}
              aria-label={`Ver la ficha de la pérdida de ${p.productName}`}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            >
              <EnOrden
                orden={orden.orden}
                celdas={{
                  fecha: (
                    <td data-label="Cuándo" className="whitespace-nowrap">
                      <div className="min-w-0">
                        <span className="block font-semibold text-[var(--text-primary)]">{diaDelMovimiento(p.createdAt, hoy)}</span>
                        <span className="block text-[var(--text-secondary)]">{formatTime(p.createdAt)}{p.createdBy ? ` · ${p.createdBy}` : ""}</span>
                      </div>
                    </td>
                  ),
                  producto: (
                    <td data-label="Producto" className="max-w-[18rem]">
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text-primary)]">{p.productName}</span>
                        <span className="block truncate text-[var(--text-secondary)]" title={p.notes}>
                          {[p.categoria, p.notes].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    </td>
                  ),
                  cantidad: <td data-label="Cantidad" className="text-right font-mono font-bold tabular-nums text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">−{p.quantity}</td>,
                  costo: <td data-label="Costo u." className="text-right tabular-nums text-[var(--text-secondary)]">{p.costo > 0 ? soles(p.costo) : "sin costo"}</td>,
                  perdida: <td data-label="Pérdida" className="text-right font-bold tabular-nums text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{soles(p.perdida)}</td>,
                  motivo: (
                    <td data-label="Causa">
                      <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold", causa.chip)}>{causa.label}</span>
                    </td>
                  ),
                }}
              />
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
