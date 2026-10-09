"use client";

import { CardTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { RefreshCw, X } from "@buleje/design-system/icons";
import ProductModifiersEditor from "@/components/admin/inventario/ProductModifiersEditor";
import ImageBankPicker from "@/components/admin/inventario/ImageBankPicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InventoryContextMenu } from "@/components/admin/inventario/InventoryContextMenu";
import KardexModal from "@/components/admin/KardexModal";
import { Field } from "@/components/admin/shared/Field";
import { formatCurrency } from "@/lib/format";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import dynamic from "next/dynamic";

const ExpandedStockModal = dynamic(() => import("@/components/admin/inventario/ExpandedStockModal"), { ssr: false });
const BulkImageAssignModal = dynamic(() => import("@/components/admin/inventario/BulkImageAssignModal"), { ssr: false });

/** Kardex, adicionales, fotos, QR, auto-reorden, tabla ampliada y menú contextual. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioVentanas({ inv }: { inv: Inventario }) {
  const {
    products, setProducts, movements, view, editModalProduct, editForm, setEditForm, showAdd,
    setShowAdd, EMPTY_ADD, setAddForm, setImgInfo, setImgError, showImageBank, setShowImageBank,
    showBulkImageAssign, setShowBulkImageAssign, showAutoReorder, setShowAutoReorder, arThreshold,
    setArThreshold, arQty, setArQty, autoReorderPanelRef, autoReorderTitleId, ventanaAutoReorder,
    showQRProduct, setShowQRProduct, qrDataUrl, qrPanelRef, qrTitleId, ventanaQR, showExpandedTable,
    setShowExpandedTable, kardexProduct, setKardexProduct, modifiersProduct, setModifiersProduct,
    ctxMenu, setCtxMenu, openEditModal, autoSaveImage, deleteProduct, saveAutoReorder,
    autoReorderCount,
  } = inv;
  return (
    <>
      {/* Kardex Modal */}
      {kardexProduct && (
        <KardexModal
          productId={kardexProduct.id}
          productName={kardexProduct.name}
          onClose={() => setKardexProduct(null)}
        />
      )}

      {/* Modifiers Editor */}
      {modifiersProduct && (
        <ProductModifiersEditor
          productId={modifiersProduct.id}
          productName={modifiersProduct.name}
          onClose={() => setModifiersProduct(null)}
        />
      )}

      {/* Bulk image assign — drag&drop banco → productos sin imagen */}
      {showBulkImageAssign && (
        <BulkImageAssignModal
          open={showBulkImageAssign}
          onOpenChange={setShowBulkImageAssign}
          products={products}
          onAssigned={(productId, imageUrl) => {
            // Optimistic update local — evita refetch que rompe scroll del modal
            setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image: imageUrl } : p)));
          }}
        />
      )}

      {/* Image Bank picker — comparte el state showImageBank entre add+edit modal */}
      <ImageBankPicker
        open={showImageBank}
        onOpenChange={setShowImageBank}
        onPick={(picked) => {
          // Si el modal edit está abierto, fill ahí Y auto-save la imagen.
          if (editModalProduct) {
            setEditForm(f => ({ ...f, image: picked.imageUrl }));
            // Si el nombre del producto en el form está vacío, sugerir el del banco.
            if (!editForm.name?.trim()) {
              setEditForm(f => ({ ...f, name: picked.name }));
            }
            // AUTO-SAVE inmediato del campo image — Brandon esperaba que se
            // aplicara de inmediato sin necesidad de click "Guardar" extra.
            void autoSaveImage(editModalProduct.id, picked.imageUrl);
          } else if (showAdd) {
            // En el add form (producto nuevo) no hay productId aun, persiste
            // al click "Crear producto". Solo actualiza preview.
            setAddForm(f => ({ ...f, image: picked.imageUrl, name: f.name || picked.name }));
            toast.success("Imagen seleccionada. Click Crear para guardar el producto.", { duration: 2500 });
          }
          setImgInfo(null);
          setImgError(null);
        }}
      />

      {/* Mejora 6 nueva: QR Modal */}
      {showQRProduct && (
        <>
          <div className="modal-backdrop" onClick={() => !ventanaQR.fijado && setShowQRProduct(null)} />
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && !ventanaQR.fijado && setShowQRProduct(null)}>
            <div
              ref={qrPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={qrTitleId}
              tabIndex={-1}
              className="relative w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4 text-center"
            >
              <div {...ventanaQR.asaProps} className="flex items-center justify-between">
                <CardTitle id={qrTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Codigo QR</CardTitle>
                <span className="ml-auto flex items-center gap-1">
                  <ControlesDeVentana ventana={ventanaQR} />
                  <button aria-label="Cerrar" onClick={() => setShowQRProduct(null)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] ">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </span>
              </div>
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- data URL local, next/image no aplica */
                <img
                  src={qrDataUrl}
                  alt={`QR ${showQRProduct.name}`}
                  className="mx-auto bg-[var(--surface-raised)] p-2 rounded-lg"
                  width={200}
                  height={200}
                />
              ) : (
                <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
              )}
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{showQRProduct.name}</p>
              <p className="text-lg font-extrabold text-primary">{formatCurrency(Number(showQRProduct.price))}</p>
              {showQRProduct.barcode && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">SKU: {showQRProduct.barcode}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!qrDataUrl) return;
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(`<html><head><title>QR ${showQRProduct.name}</title><style>body{text-align:center;font-family:sans-serif;padding:40px}img{margin:20px auto;width:300px;height:300px}@media print{button{display:none}}</style></head><body><h2>${showQRProduct.name}</h2><img src="${qrDataUrl}" alt="QR" /><p style="font-size:24px;font-weight:bold;color:var(--color-primary)">${formatCurrency(Number(showQRProduct.price))}</p><button onclick="window.print()">Imprimir</button></body></html>`);
                      w.document.close();
                    }
                  }}
                  className="flex-1 py-2 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-bold text-xs hover:bg-[var(--surface-alt)] transition-colors flex items-center justify-center gap-1.5"
                >
                  Imprimir
                </button>
                <a
                  href={qrDataUrl ?? "#"}
                  download={`qr-${showQRProduct.name.replace(/\s+/g, "-")}.png`}
                  aria-disabled={!qrDataUrl}
                  className={cn(
                    "flex-1 py-2 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5",
                    !qrDataUrl && "pointer-events-none opacity-50"
                  )}
                >
                  Descargar
                </a>
              </div>
              <TiradorDeVentana ventana={ventanaQR} />
            </div>
          </div>
        </>
      )}

      {/* Mejora 5 nueva: Auto-reorden modal */}
      {showAutoReorder !== null && (
        <>
          <div className="modal-backdrop" onClick={() => !ventanaAutoReorder.fijado && setShowAutoReorder(null)} />
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && !ventanaAutoReorder.fijado && setShowAutoReorder(null)}>
            <div
              ref={autoReorderPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={autoReorderTitleId}
              tabIndex={-1}
              className="relative w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4"
            >
              <div {...ventanaAutoReorder.asaProps} className="flex items-center justify-between">
                <CardTitle id={autoReorderTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Configurar Auto-Reorden</CardTitle>
                <span className="ml-auto flex items-center gap-1">
                  <ControlesDeVentana ventana={ventanaAutoReorder} />
                  <button aria-label="Cerrar" onClick={() => setShowAutoReorder(null)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] ">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </span>
              </div>
              <Field label="Reordenar cuando stock sea menor o igual a:" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                <input
                  type="number" min="1" value={arThreshold} onChange={e => setArThreshold(e.target.value)}
                  className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="5"
                />
              </Field>
              <Field label="Cantidad a pedir:" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                <input
                  type="number" min="1" value={arQty} onChange={e => setArQty(e.target.value)}
                  className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="10"
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAutoReorder(null)} className="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
                  Cancelar
                </button>
                <button onClick={() => saveAutoReorder(showAutoReorder)} className="flex-1 px-4 min-h-10 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark  transition-colors">
                  Guardar
                </button>
              </div>
              <TiradorDeVentana ventana={ventanaAutoReorder} />
            </div>
          </div>
        </>
      )}

      {/* Mejora 5 nueva: Resumen de auto-reorden */}
      {autoReorderCount > 0 && view === "productos" && (
        <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold">
            {autoReorderCount} producto{autoReorderCount > 1 ? "s" : ""} con reorden automatico configurado
          </p>
        </div>
      )}

      {/* Expanded table modal */}
      {showExpandedTable && (
        <ExpandedStockModal products={products} movements={movements} onClose={() => setShowExpandedTable(false)} />
      )}

      {/* Context menu for product rows (right-click) */}
      {ctxMenu && (
        <InventoryContextMenu
          product={ctxMenu.product}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onEdit={(p) => { openEditModal(p); setCtxMenu(null); }}
          onView={(p) => { setKardexProduct({ id: p.id, name: p.name }); setCtxMenu(null); }}
          onDuplicate={(p) => {
            setAddForm({
              ...EMPTY_ADD,
              type: p.type ?? "product",
              brand: p.brand ?? "",
              taxType: p.taxType ?? "gravado",
              weightKg: p.weightKg != null ? String(p.weightKg) : "",
              dimensions: p.dimensions ?? "",
              durationLabel: p.durationLabel ?? "",
              pricingUnit: p.pricingUnit ?? "fijo",
              notes: p.notes ?? "",
              description: p.description ?? "",
              name: `${p.name} (Copia)`,
              category: p.category,
              price: String(p.price),
              unit: p.unit,
              badge: p.badge ?? "",
              image: p.image ?? "",
              barcode: "",
              costPrice: p.costPrice != null ? String(p.costPrice) : "",
              stock: "0",
              stockMin: p.stockMin != null ? String(p.stockMin) : "",
              stockMax: p.stockMax != null ? String(p.stockMax) : "",
              expiryDate: "",
              isVariant: false,
              variantOf: "",
              variantAttr: "",
            });
            setShowAdd(true);
            setCtxMenu(null);
          }}
          onDelete={(p) => { deleteProduct(p.id); setCtxMenu(null); }}
        />
      )}
    </>
  );
}
