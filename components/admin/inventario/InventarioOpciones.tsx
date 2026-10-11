"use client";

import { AlertTriangle, CheckCircle, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Los desplegables del panel a 48 px. */
const FILTRO_EN_PANEL = "mt-0! min-w-0 [&_summary]:h-12 [&_summary]:rounded-xl";

/**
 * Lo que abre «Filtros» (estado, stock y vencimiento) y los avisos de la
 * importación y de los precios bajo el costo. Pieza de InventoryTab.
 *
 * Antes este panel era de VISTA e importar/exportar (Más columnas, Expandir,
 * Ajuste %, Añadir IMG Amplio, CSV, Excel, Subir CSV) aunque el botón decía
 * «Filtros», y los filtros de verdad estaban en las cabeceras de la tabla
 * (sólo en celular acá). Ahora: los filtros acá, en todos los anchos; lo
 * otro, en el ⋯ de la cabecera.
 */
export default function InventarioOpciones({ inv }: { inv: Inventario }) {
  const {
    loading, estadoFiltro, setEstadoFiltro, stockRango, setStockRango, vencRango, setVencRango, showFilters,
    csvResult, setCsvResult, totalProducts, activeProducts, inconsistentes, openEditModal,
  } = inv;
  return (
    <>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
          <FiltroColumnaMulti
            label="Estado"
            value={estadoFiltro}
            options={[
              { value: "Activo", count: activeProducts },
              { value: "Inactivo", count: totalProducts - activeProducts },
            ]}
            onChange={setEstadoFiltro}
            placeholder="Estado: todos"
            className={FILTRO_EN_PANEL}
          />
          <FiltroColumnaRango label="Stock" paso={1} valor={stockRango} onChange={(r) => setStockRango(r as Rango<number>)} placeholder="Stock: cualquiera" className={FILTRO_EN_PANEL} />
          <FiltroColumnaRango label="Vence" esFecha valor={vencRango} onChange={(r) => setVencRango(r as Rango<string>)} placeholder="Vence: cuando sea" className={FILTRO_EN_PANEL} />
        </div>
      )}

      {/* Resultado de «Subir CSV». */}
      {csvResult && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-3 py-2 text-sm sm:px-4",
            csvResult.errors.length > 0
              ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]"
              : "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]",
          )}
        >
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-bold">{csvResult.created} producto{csvResult.created !== 1 ? "s" : ""} importado{csvResult.created !== 1 ? "s" : ""}.</p>
            {csvResult.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {csvResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                {csvResult.errors.length > 5 && <li>…y {csvResult.errors.length - 5} más</li>}
              </ul>
            )}
          </div>
          <button type="button" aria-label="Quitar el aviso" onClick={() => setCsvResult(null)} className="-my-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Precios bajo el costo, en una línea. Antes «Corregir precios →» sólo
          limpiaba la búsqueda: ahora cada nombre abre su ficha para corregirlo. */}
      {!loading && inconsistentes.length > 0 && (
        <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-1 sm:px-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <span className="text-sm font-bold text-[var(--data-error-ink)]">
            {inconsistentes.length} se vende{inconsistentes.length !== 1 ? "n" : ""} bajo el costo:
          </span>
          {inconsistentes.slice(0, 3).map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => openEditModal(p)}
              title={`Costo ${formatCurrency(p.costPrice ?? 0)} > precio ${formatCurrency(Number(p.price))}: toca para corregir`}
              className="min-h-10 rounded-lg px-2 text-sm font-semibold text-[var(--data-error-ink)] underline underline-offset-2 hover:bg-[var(--data-error-500)]/10"
            >
              {p.name}
            </button>
          ))}
          {inconsistentes.length > 3 && <span className="text-sm text-[var(--data-error-ink)]">y {inconsistentes.length - 3} más</span>}
          <InfoTip
            what={inconsistentes.map(p => `${p.name}: costo ${formatCurrency(p.costPrice ?? 0)}, precio ${formatCurrency(Number(p.price))}`).join(" · ")}
            affects="Cada venta de estos productos te deja pérdida."
          />
        </div>
      )}
    </>
  );
}
