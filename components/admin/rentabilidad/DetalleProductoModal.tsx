"use client";

/**
 * El detalle de un producto de Rentabilidad, en su ventana.
 *
 * Salió de `ProfitabilityTab.tsx` (2026-10-11) sin cambiar nada de lo que
 * dibuja: el archivo pasaba de 460 líneas y la ventana traía su propio foco,
 * su Escape y su ventana movible (ADR-420).
 */

import { useEffect, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { formatCurrency, formatNumber } from "@/lib/format";

export type ProfitLine = {
  id: string;
  product: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number;
  period: string;
  /** El costo de alguna línea salió del producto, no de la venta: margen aproximado. */
  costEstimated: boolean;
};

const fmt = (n: number) => `${formatCurrency(n)}`;
const pct = (n: number) => (Math.abs(n) > 999 ? "—" : `${n.toFixed(1)}%`);

export default function DetalleProductoModal({ detail, onClose }: { detail: ProfitLine | null; onClose: () => void }) {
  const detailPanelRef = useRef<HTMLDivElement>(null);
  // El propio Escape de abajo ya cierra el detalle — el hook sólo aporta foco
  // inicial + trampa de Tab (por eso cerrarConEscape: false).
  useModalAccesible(detailPanelRef, { cerrarConEscape: false, activo: !!detail });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventanaDetalle = useVentanaDeModal(!!detail, {
    ref: detailPanelRef,
    aplicarTranslate: true,
    claveMemoria: "profitability-detalle-producto",
  });

  // Escape cierra el detalle (regla del proyecto: todo modal con click-fuera + Escape).
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, onClose]);

  if (!detail) return null;
  return (
    <div
      className="modal-backdrop p-4"
      role="button"
      tabIndex={0}
      aria-label="Cerrar detalle"
      onClick={() => { if (!ventanaDetalle.fijado) onClose(); }}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !ventanaDetalle.fijado) onClose(); }}
    >
      <div
        ref={detailPanelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de producto"
        tabIndex={-1}
        className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div {...ventanaDetalle.asaProps} className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Detalle de producto</CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventanaDetalle} />
          </span>
          <button onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
        </div>
        <div className="space-y-2 text-sm">
          {[
            ["Producto", detail.product], ["Categoría", detail.category], ["Período", detail.period],
            ["Uds. vendidas", formatNumber(detail.unitsSold)],
            ["Ingresos", fmt(detail.revenue)], ["Costo de venta", fmt(detail.cogs)],
            ["Margen bruto", fmt(detail.grossMargin)], ["% Margen", pct(detail.marginPct)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
              <span className="text-[var(--text-secondary)] dark:text-muted">{k}</span>
              <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{v}</span>
            </div>
          ))}
        </div>
        <TiradorDeVentana ventana={ventanaDetalle} />
      </div>
    </div>
  );
}
