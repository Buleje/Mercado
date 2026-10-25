"use client";

/**
 * Las pérdidas: fecha, producto, cuánto, a qué costo y por qué. Toda la fila
 * abre la ficha del movimiento (la misma del kardex: se puede revertir). El
 * filtro de causa vive en la fila de filtros, ya no también en el `<th>`.
 */
import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { formatTime } from "@/lib/format";
import { FiltroEnCabecera, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { OrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { ThColumna } from "@/components/admin/shared/th-columna";
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
  /** Filtros y orden de las columnas (la causa, el período y el buscador siguen en la barra). */
  f: FiltrosTabla<FilaPerdida>;
  ord: OrdenColumna<FilaPerdida>;
}

export function TablaPerdidas({ filas, hoy, orden, onVer, f, ord }: Props) {
  return (
    <DataTable className="min-w-[640px] [&_tbody_td]:py-1.5! [&_tbody_td]:align-top">
      <thead ref={orden.refCabecera}>
        <tr>
          <EnOrden
            orden={orden.orden}
            celdas={{
              fecha: <ThColumna dataCol="fecha" label="Cuándo" orden={ord} ordenId="fecha" />,
              producto: <ThColumna dataCol="producto" label="Producto" orden={ord} ordenId="producto" />,
              cantidad: <ThColumna dataCol="cantidad" label="Cantidad" derecha orden={ord} ordenId="cantidad"><FiltroEnCabecera id="cantidad" f={f} compacto /></ThColumna>,
              costo: <ThColumna dataCol="costo" label="Costo u." derecha title="Costo de hoy del producto" orden={ord} ordenId="costo"><FiltroEnCabecera id="costo" f={f} compacto /></ThColumna>,
              perdida: <ThColumna dataCol="perdida" label="Pérdida" derecha orden={ord} ordenId="perdida"><FiltroEnCabecera id="perdida" f={f} compacto /></ThColumna>,
              motivo: <ThColumna dataCol="motivo" label="Causa" orden={ord} ordenId="motivo" />,
            }}
          />
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
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
