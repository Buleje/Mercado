"use client";

import { Loader2, ShoppingCart, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import PedirPrecioWhatsApp from "./PedirPrecioWhatsApp";
import type { SugerenciasCompra } from "./use-sugerencias-compra";

/**
 * La barra fija que aparece al marcar sugerencias: cuántas, cuántas unidades,
 * el costo de referencia, «Pedir precio» (WhatsApp a los proveedores, sin crear
 * nada) y «Crear órdenes» (una por proveedor). El costo es la
 * vista previa con el último precio; el total de cada orden lo calcula el
 * servidor al crearla.
 */
export default function SugerenciasBarraSeleccion({ sc }: { sc: SugerenciasCompra }) {
  const { selected, setSelected, selectedStats, creating, createOCs } = sc;
  if (selected.size === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-full max-w-[calc(100vw-1.5rem)] -translate-x-1/2 px-2 sm:w-auto">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 shadow-[var(--shadow-xl)] sm:flex-nowrap sm:gap-4 sm:px-5">
        <div className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-0">
          <p className="truncate font-extrabold text-[var(--text-primary)]">
            {selected.size} {selected.size === 1 ? "producto" : "productos"} · {selectedStats.qty} {selectedStats.qty === 1 ? "unidad" : "unidades"}
          </p>
          <p className="truncate text-sm text-[var(--text-secondary)]">
            {selectedStats.cost > 0 ? `≈ S/${formatNumber(Math.round(selectedStats.cost))} · ` : ""}
            {selectedStats.supplierGroups} {selectedStats.supplierGroups === 1 ? "orden" : "órdenes"} por proveedor
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          aria-label="Limpiar selección"
          className={button({ variant: "ghost", className: "w-12 shrink-0 rounded-xl px-0 sm:w-auto sm:px-3" })}
        >
          <X className="h-4 w-4 sm:hidden" aria-hidden />
          <span className="max-sm:sr-only">Limpiar</span>
        </button>
        <PedirPrecioWhatsApp sc={sc} />
        <button
          type="button"
          onClick={() => void createOCs()}
          disabled={creating}
          className={button({ variant: "primary", className: "min-w-0 flex-1 shrink-0 gap-2 rounded-xl px-4 sm:flex-none" })}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
          {creating ? "Creando…" : "Crear órdenes"}
        </button>
      </div>
    </div>
  );
}
