"use client";

import type { Dispatch, SetStateAction } from "react";
import { Camera, LayoutGrid, List, Plus, ScanLine } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PurchaseSortBy as SortBy } from "@/lib/types/purchases";
import type { CompraCatalogo } from "./use-compra-catalogo";
import type { CompraCarrito } from "./use-compra-carrito";

interface Props {
  catalogo: CompraCatalogo;
  carrito: CompraCarrito;
  processing: boolean;
  showScanner: boolean;
  setShowScanner: Dispatch<SetStateAction<boolean>>;
  onEscanearFactura: () => void;
  onNuevoProveedor: () => void;
}

/** Contadores, aviso de reposición y barra de controles del Punto de compra. */
export default function CompraBarraControles({ catalogo, carrito, processing, showScanner, setShowScanner, onEscanearFactura, onNuevoProveedor }: Props) {
  const { products, needsReorderCount, setSoloReponer, setPage, soloReponer, suppliers, search, setSearch, viewMode, setViewMode, sortBy, setSortBy } = catalogo;
  const { selectedSupplier, setSelectedSupplier } = carrito;
  return (
    <>
      {/* Toolbar — el header del módulo (Compras) lo da el padre ComprasModule.
          Aquí solo contadores + acción rápida. */}
      <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
          {products.length} productos
        </span>
        {needsReorderCount > 0 && (
          <button
            type="button"
            onClick={() => { setSoloReponer(true); setPage(1); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--data-error-500)] border border-[var(--data-error-500)]/30 bg-[var(--surface-raised)] hover:bg-[var(--data-error-500)]/5 px-2.5 py-1 rounded-full transition-colors"
            title="Productos con stock en o por debajo del mínimo que fijaste. La pestaña Sugerencias cuenta distinto: mira cuánto se vendió, no el mínimo."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
            {needsReorderCount} a reponer
          </button>
        )}
        {/* Reporte QA Compras 2026-08-12: acá decía "2 a reponer" y Sugerencias
            "Nada que reponer" con los mismos datos. No es una contradicción: son
            dos preguntas distintas; la aclaración va en el ⓘ, no en una línea. */}
        {needsReorderCount > 0 && (
          <InfoTip
            title="A reponer"
            what={<span>Cuenta los productos en o bajo el stock mínimo que fijaste.</span>}
            example={<span>Sugerencias mira lo que se vendió estos días, así que puede darte otro número.</span>}
          />
        )}
      </div>

      {/* Aviso reposición destacado */}
      {needsReorderCount > 5 && !soloReponer && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-500)]">
          <span className="shrink-0">●</span>
          <p>
            Tienes <strong>{needsReorderCount}</strong> productos por debajo del stock mínimo.{" "}
            <button type="button" onClick={() => { setSoloReponer(true); setPage(1); }} className="underline font-semibold">
              Ver todos
            </button>
          </p>
        </div>
      )}

      {/* Barra de controles */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Selector proveedor + botón crear nuevo inline */}
        <div className="flex items-center gap-1">
          <select
            value={selectedSupplier?.id ?? ""}
            onChange={(e) => {
              const found = suppliers.find((s) => s.id === e.target.value);
              setSelectedSupplier(found ?? null);
            }}
            disabled={processing}
            aria-label="Seleccionar proveedor"
            className="flex-1 sm:flex-none min-h-11 sm:min-h-0 px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onNuevoProveedor()}
            disabled={processing}
            title="Crear nuevo proveedor"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        </div>

        {/* Toggle solo reponer */}
        <button
          type="button"
          onClick={() => setSoloReponer((v) => !v)}
          aria-pressed={soloReponer}
          className={cn(
            "px-3 py-1.5 min-h-11 sm:min-h-0 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            soloReponer
              ? "bg-[var(--data-error-500)] text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
          )}
        >
          Solo reponer
        </button>

        {/* Búsqueda */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          aria-label="Buscar producto por nombre o código"
          className="flex-1 min-w-full sm:min-w-36 min-h-11 sm:min-h-0 px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />

        {/* Botón escáner de código de barras */}
        <button
          type="button"
          onClick={() => setShowScanner(!showScanner)}
          className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", showScanner ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}
          title="Buscar por código de barras (F2)"
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" /> Código
        </button>

        {/* Botón escáner de factura OCR */}
        <button
          type="button"
          onClick={() => onEscanearFactura()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-primary/10 hover:text-primary transition-colors"
          title="Escanear factura con cámara"
        >
          <Camera className="h-3.5 w-3.5 shrink-0" /> Factura
        </button>

        {/* Toggle vista */}
        <button
          type="button"
          onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
          aria-label={viewMode === "grid" ? "Cambiar a vista lista" : "Cambiar a vista cuadrícula"}
          className="p-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {viewMode === "grid" ? (
            <List className="h-4 w-4" />
          ) : (
            <LayoutGrid className="h-4 w-4" />
          )}
        </button>

        {/* Ordenar por */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Ordenar por"
          className="px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <option value="stock">Stock ↑</option>
          <option value="price">Precio</option>
          <option value="name">Nombre</option>
        </select>
      </div>
    </>
  );
}
