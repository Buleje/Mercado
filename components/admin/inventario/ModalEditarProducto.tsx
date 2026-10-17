"use client";

import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { Package, Loader2, Layers, CheckCircle, Sliders } from "@buleje/design-system/icons";
import ProductVariantsInline from "@/components/admin/inventario/ProductVariantsInline";
import ProductSpecsEditor from "@/components/admin/inventario/ProductSpecsEditor";
import ProductRichContentEditor from "@/components/admin/inventario/ProductRichContentEditor";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import EditarProductoDatos from "@/components/admin/inventario/EditarProductoDatos";
import EditarProductoMas from "@/components/admin/inventario/EditarProductoMas";

/** Ventana «Editar producto». Pieza de InventoryTab: recibe `useInventario` entero. */
export default function ModalEditarProducto({ inv }: { inv: Inventario }) {
  const {
    editModalProduct,
    editForm,
    setEditForm,
    saving,
    editSpecs,
    setEditSpecs,
    editRich,
    setEditRich,
    setModifiersProduct,
    closeEditModal,
    saveEdit,
    catLabelOf,
  } = inv;
  return (
    <>
      {/* ── Edit product modal ── */}
      <AdminModal
        open={!!editModalProduct}
        onClose={closeEditModal}
        title={editModalProduct?.name ?? ""}
        description={
          (editForm.type ?? "product") === "service" ? "Editar servicio" : "Editar producto"
        }
        size="lg"
        claveVentana="inventario-editar-producto"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeEditModal}
              className={button({ variant: "secondary" })}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className={button({ variant: "primary", className: "gap-2" })}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" strokeWidth={2.5} />
              )}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </ModalFooter>
        }
      >
        {editModalProduct && (
          <div className={`space-y-6 ${MODAL_BODY}`}>
            {/* Vista previa en vivo */}
            <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              {editForm.image ? (
                <Image
                  src={editForm.image}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized={editForm.image.startsWith("data:")}
                  className="h-12 w-12 rounded-lg object-cover border border-[var(--rule-soft)] bg-[var(--surface-alt)]"
                />
              ) : (
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Package className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                  {editForm.name?.trim() || "Producto"}
                </p>
                <p className="truncate text-xs text-[var(--text-tertiary)]">
                  {editForm.category ? catLabelOf(editForm.category) : "Sin categoría"} ·{" "}
                  {(editForm.type ?? "product") === "service" ? "Servicio" : "Producto"}
                </p>
              </div>
              <span className="shrink-0 font-mono text-base font-extrabold text-primary">
                {editForm.price ? fmt(Number(editForm.price)) : "S/—"}
              </span>
            </div>
            {/* Tipo: producto físico vs servicio */}
            <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
              {(
                [
                  ["product", "Producto"],
                  ["service", "Servicio"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, type: val }))}
                  className={cn(
                    "flex-1 rounded-xl px-3 min-h-11 text-sm font-semibold transition-colors",
                    (editForm.type ?? "product") === val
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <EditarProductoDatos inv={inv} />

            {/* Contenido rico (estilo Amazon) — ficha técnica editable + bloques A+ */}
            <ProductSpecsEditor value={editSpecs} onChange={setEditSpecs} />
            <ProductRichContentEditor value={editRich} onChange={setEditRich} />

            {/* Variantes — editor inline real (CRUD vía /api/.../variants) */}
            <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Layers className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  Variantes / presentaciones
                </p>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
                  — Tamaños, colores, sabores. Cada uno con su foto y stock.
                </span>
              </div>
              <ProductVariantsInline
                productId={editModalProduct.id}
                basePrice={Number(editForm.price) || editModalProduct.price}
                parentImage={editForm.image ?? null}
              />
            </div>

            {/* Adicionales / Modificadores — extras que el cliente elige al ordenar */}
            <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                      Adicionales / extras
                    </p>
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1 leading-snug">
                    Cosas que el cliente elige <strong>encima</strong> del producto base — cremas,
                    salsas, presa, sabores, toppings, palta extra.{" "}
                    <strong>No afecta el stock</strong> del producto principal.
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                    Ejemplos: <em>Pollo a la brasa</em> con grupo &quot;Cremas&quot; (mayonesa +0,
                    ají +0.5, mostaza +0) o <em>Hamburguesa</em> con &quot;Extras&quot; (queso +2,
                    tocino +3, palta +2).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    editModalProduct &&
                    setModifiersProduct({ id: editModalProduct.id, name: editModalProduct.name })
                  }
                  className="inline-flex items-center gap-1.5 px-3 min-h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shrink-0"
                >
                  <Sliders className="h-4 w-4" />
                  Configurar adicionales
                </button>
              </div>
            </div>

            <EditarProductoMas inv={inv} />
            <div className="flex items-center justify-between p-4 bg-[var(--surface-alt)] rounded-xl">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  Estado del producto
                </p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                  {editForm.active ? "Visible en la tienda" : "Oculto en la tienda"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={editForm.active}
                aria-label="Estado del producto: visible en la tienda"
                onClick={() => setEditForm((f) => ({ ...f, active: !f.active }))}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer",
                  editForm.active ? "bg-primary/10" : "bg-[var(--rule-soft)]",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform",
                    editForm.active ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          </div>
        )}
      </AdminModal>
    </>
  );
}
