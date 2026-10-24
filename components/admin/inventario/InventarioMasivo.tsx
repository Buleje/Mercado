"use client";

import { CardTitle } from "@buleje/design-system";
import { Trash2, X, Camera, Download, Eye, EyeOff, Sliders } from "@buleje/design-system/icons";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Barra de selección y confirmaciones de quitar fotos y borrar. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioMasivo({ inv }: { inv: Inventario }) {
  const {
    selectedIds, setBulkModal, setBulkField, setBulkValue, bulkDeleteConfirm, setBulkDeleteConfirm,
    bulkDeleting, bulkClearImagesConfirm, setBulkClearImagesConfirm, bulkClearingImages,
    dontAskBulkClear, setDontAskBulkClear, load, clearSelection, executeBulkDelete,
    executeBulkClearImages, exportSelectedCSV, bulkEstado,
  } = inv;
  return (
    <>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-2 py-1.5 shadow-lg backdrop-blur-md animate-[slideUp_0.2s_ease-out]">
          {/* Conteo — chip discreto, sin barra de color saturada */}
          <span className="inline-flex items-center gap-2 pl-1.5 pr-1 text-sm font-semibold text-[var(--text-primary)]">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-black tabular-nums text-[var(--accent)]">
              {selectedIds.size}
            </span>
            <span className="hidden sm:inline">seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
          </span>

          <span className="mx-1 h-6 w-px bg-[var(--rule-soft)]" aria-hidden />

          {/* Activar / Desactivar — toggle rápido del estado (ghost monocromo) */}
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              // Activar/desactivar en lote toca la vidriera de N productos:
              // si el servidor rechaza, la selección se limpiaba igual y no
              // quedaba rastro de que no había pasado nada.
              if (await bulkEstado(ids, true)) { clearSelection(); load(); }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Activar</span>
          </button>
          <button
            onClick={async () => {
              const ids = Array.from(selectedIds);
              if (await bulkEstado(ids, false)) { clearSelection(); load(); }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <EyeOff className="h-4 w-4" /> <span className="hidden sm:inline">Desactivar</span>
          </button>

          {/* Editar campos — abre el modal con TODAS las opciones (precio, stock,
              categoría, etiqueta…). Única acción con fondo sutil para marcarla
              como primaria sin gritar. */}
          <button
            onClick={() => { setBulkField("active"); setBulkValue("true"); setBulkModal(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--rule-soft)]"
          >
            <Sliders className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
          </button>

          {/* Overflow — acciones secundarias + la destructiva (Radix, auto-flip
              hacia arriba porque el bar vive abajo). */}
          <ModuleActionMenu
            iconOnly
            label="Más acciones"
            align="end"
            items={[
              { label: "Exportar selección (CSV)", icon: Download, onClick: exportSelectedCSV },
              {
                label: "Quitar imágenes",
                icon: Camera,
                description: "Borra solo la imagen, no el producto",
                onClick: () => {
                  const skip =
                    typeof window !== "undefined" &&
                    localStorage.getItem("admin-skip-bulk-clear-images-confirm") === "1";
                  if (skip) executeBulkClearImages();
                  else setBulkClearImagesConfirm(true);
                },
              },
              {
                label: `Eliminar ${selectedIds.size} producto${selectedIds.size > 1 ? "s" : ""}`,
                icon: Trash2,
                destructive: true,
                dividerBefore: true,
                onClick: () => setBulkDeleteConfirm(true),
              },
            ]}
          />

          <span className="mx-1 h-6 w-px bg-[var(--rule-soft)]" aria-hidden />

          {/* Limpiar selección */}
          <button
            onClick={clearSelection}
            aria-label="Limpiar selección"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk clear images confirmation modal */}
      {bulkClearImagesConfirm && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-warning-100)] dark:bg-orange-950/30">
                  <Camera className="h-5 w-5 text-[var(--data-warning-500)]" />
                </div>
                <div>
                  <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Quitar imágenes</CardTitle>
                  <p className="text-sm text-muted">Solo borra la imagen, no el producto</p>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                ¿Quitar la imagen de <strong>{selectedIds.size}</strong> producto{selectedIds.size > 1 ? "s" : ""}?
                Los productos siguen activos pero quedan sin imagen hasta que subas una nueva con
                fondo transparente.
              </p>
              <label className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontAskBulkClear}
                  onChange={(e) => setDontAskBulkClear(e.target.checked)}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                />
                <span>No volver a preguntar (puedo deshacer desde la cuenta)</span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkClearImagesConfirm(false)}
                  className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (dontAskBulkClear) {
                      try {
                        localStorage.setItem("admin-skip-bulk-clear-images-confirm", "1");
                      } catch { /* silent */ }
                    }
                    executeBulkClearImages();
                  }}
                  disabled={bulkClearingImages}
                  className="flex-1 min-h-11 rounded-xl bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/90 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {bulkClearingImages ? "Quitando…" : `Sí, quitar ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--data-error-100)] dark:bg-red-950/30">
                  <Trash2 className="h-5 w-5 text-[var(--data-error-500)]" />
                </div>
                <div>
                  <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Eliminar productos</CardTitle>
                  <p className="text-sm text-muted">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                ¿Estás seguro de eliminar <strong>{selectedIds.size}</strong> producto{selectedIds.size > 1 ? "s" : ""}? Se quitarán del catálogo y ya no aparecerán en la tienda.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 min-h-11 rounded-xl bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {bulkDeleting ? "Eliminando…" : `Sí, eliminar ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
