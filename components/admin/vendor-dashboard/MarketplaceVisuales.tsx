"use client";

/**
 * Piezas visuales (sin Recharts) de la pestaña Marketplace del Inicio:
 * embudo de pedidos, reparto de reseñas por estrellas y mapa franja × día.
 * Las cifras llegan calculadas desde `marketplace-metricas`; acá sólo se dibujan.
 */

import { Fragment, type ReactNode } from "react";
import { Star } from "@buleje/design-system/icons";
import { COLOR_CONCEPTO, cantidad } from "@/lib/admin/inicio/formato-tablero";
import { DIAS_MAPA, FRANJAS } from "./marketplace-metricas";

/** Fila con rótulo, cifra grande y una barra proporcional debajo. */
function FilaProporcion({ rotulo, valor, pct, color, extra }: { rotulo: ReactNode; valor: string; pct: number; color: string; extra?: string }) {
  return (
    <li>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{rotulo}</span>
        <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</span>
        {extra && <span className="w-12 text-right text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{extra}</span>}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, backgroundColor: color }} />
      </div>
    </li>
  );
}

export function EmbudoPedidos({ etapas }: { etapas: { etapa: string; cantidad: number; pct: number }[] }) {
  return (
    <ol className="space-y-3.5" aria-label="Pedidos por etapa">
      {etapas.map((e) => (
        <FilaProporcion
          key={e.etapa}
          rotulo={e.etapa}
          valor={cantidad(e.cantidad)}
          pct={e.pct}
          extra={`${e.pct}%`}
          color={COLOR_CONCEPTO.pedidos}
        />
      ))}
    </ol>
  );
}

export function RepartoResenas({ filas, total }: { filas: { estrellas: number; cantidad: number }[]; total: number }) {
  return (
    <ol className="space-y-3.5" aria-label="Reseñas por estrellas">
      {filas.map((f) => {
        const pct = total > 0 ? Math.round((f.cantidad / total) * 100) : 0;
        return (
          <FilaProporcion
            key={f.estrellas}
            rotulo={
              <span className="inline-flex items-center gap-1">
                {f.estrellas}
                <Star className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
                <span className="sr-only">estrellas</span>
              </span>
            }
            valor={cantidad(f.cantidad)}
            pct={pct}
            extra={`${pct}%`}
            color={f.estrellas <= 2 ? COLOR_CONCEPTO.alerta : COLOR_CONCEPTO.clientes}
          />
        );
      })}
    </ol>
  );
}

export function MapaFranjaDia({ matrix, max }: { matrix: number[][]; max: number }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "minmax(4.75rem, auto) repeat(7, minmax(0, 1fr))" }}
      role="table"
      aria-label="Pedidos entregados por franja y día"
    >
      <div role="columnheader" />
      {DIAS_MAPA.map((d) => (
        <div key={d} role="columnheader" className="pb-1 text-center text-xs font-bold uppercase text-[var(--text-tertiary)]">
          {d}
        </div>
      ))}
      {FRANJAS.map((franja, fi) => (
        <Fragment key={franja.label}>
          <div role="rowheader" className="flex items-center pr-2 text-xs font-semibold text-[var(--text-secondary)]">
            {franja.label}
          </div>
          {matrix[fi].map((v, di) => {
            const intensidad = v / max;
            return (
              <div
                key={di}
                role="cell"
                className="flex min-h-9 items-center justify-center rounded-md text-sm font-bold tabular-nums"
                style={{
                  background:
                    v === 0
                      ? "var(--surface-sunken)"
                      : `color-mix(in srgb, ${COLOR_CONCEPTO.pedidos} ${Math.round(Math.max(18, intensidad * 100))}%, transparent)`,
                  color: intensidad > 0.55 ? "var(--surface-raised)" : "var(--text-primary)",
                }}
                title={`${franja.label} del ${DIAS_MAPA[di]}: ${v} ${v === 1 ? "pedido" : "pedidos"}`}
              >
                {v > 0 ? v : ""}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
