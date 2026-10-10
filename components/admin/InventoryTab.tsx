"use client";

import { BlockTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import type { ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import { cn } from "@/lib/utils";
import type { DbProduct } from "@/lib/jsondb";
import { useInventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioBarra from "@/components/admin/inventario/InventarioBarra";
import InventarioResumen from "@/components/admin/inventario/InventarioResumen";
import InventarioAlertaOC from "@/components/admin/inventario/InventarioAlertaOC";
import InventarioOpciones from "@/components/admin/inventario/InventarioOpciones";
import InventarioTarjetas from "@/components/admin/inventario/InventarioTarjetas";
import InventarioTabla from "@/components/admin/inventario/InventarioTabla";
import InventarioSelectorProductos from "@/components/admin/inventario/InventarioSelectorProductos";
import ModalNuevoProducto from "@/components/admin/inventario/ModalNuevoProducto";
import ModalEditarProducto from "@/components/admin/inventario/ModalEditarProducto";
import InventarioMasivo from "@/components/admin/inventario/InventarioMasivo";
import InventarioEdicionMasiva from "@/components/admin/inventario/InventarioEdicionMasiva";
import InventarioVentanas from "@/components/admin/inventario/InventarioVentanas";
import InventarioCargando from "@/components/admin/inventario/InventarioCargando";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

export default function InventoryTab({ headerActions = [] }: { headerActions?: ModuleActionItem[] } = {}) {
  // El estado y las acciones viven en `useInventario` (inventario/hooks/); cada bloque de la vista,
  // en su pieza de `inventario/`. Partido el 09-10 sin cambiar el DOM.
  const inv = useInventario(headerActions);
  const {
    loading, view, setEditModalProduct, showScanner, setShowScanner, handleBarcodeScan, catLabelOf,
    filteredProducts,
  } = inv;

  if (loading) return <InventarioCargando />;

  // `space-y-4` y no 6: entre la barra de filtros y el primer producto había
  // cinco separaciones de 24 px —120 px de aire— y a Inventario se entra a ver
  // productos, no el cromo.
  return (
    <div className="space-y-4">
      <InventarioBarra inv={inv} />

      <InventarioResumen inv={inv} />

      <InventarioAlertaOC inv={inv} />

      <InventarioOpciones inv={inv} />
      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : view === "productos" ? (
        /* ── Products View ──────────────────────────────────────── */
        <>
          <InventarioTarjetas inv={inv} />

          <InventarioTabla inv={inv} />
        </>
      ) : view === "kanban" ? (
        /* ── Kanban Stock View ────────────────────────────────────── */
        (() => {
          const columns = [
            { key: "agotado", label: "Agotado", color: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20", badgeColor: "bg-[var(--data-error-500)]", filter: (p: DbProduct) => (p.stock ?? 0) === 0 },
            { key: "bajo", label: "Pocas Existencias", color: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20", badgeColor: "bg-[var(--data-warning-500)]", filter: (p: DbProduct) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5) },
            { key: "normal", label: "Normal", color: "border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15", badgeColor: "bg-primary/10", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMin ?? 5) && (p.stock ?? 0) <= (p.stockMax ?? 999) },
            { key: "exceso", label: "Exceso", color: "border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15", badgeColor: "bg-primary/10", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMax ?? 999) },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
              {columns.map(col => {
                const items = filteredProducts.filter(col.filter);
                return (
                  <div key={col.key} className={cn("rounded-xl border-2 p-3 min-h-50", col.color)}>
                    <div className="flex items-center justify-between mb-3">
                      <BlockTitle>{col.label}</BlockTitle>
                      <span className={cn("text-white text-xs font-bold px-2 py-0.5 rounded-full", col.badgeColor)}>{items.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">Sin productos</p>
                      ) : items.map(p => (
                        <div key={p.id} role="button" tabIndex={0}
                          aria-label={`Editar ${p.name}`}
                          className="bg-[var(--surface-raised)] rounded-lg p-2.5  border border-[var(--rule-soft)] dark:border-border cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                          onClick={() => { setEditModalProduct(p); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditModalProduct(p); } }}>
                          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                            {p.type === "service" && <span className="mr-1 rounded bg-primary/10 px-1 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--accent)]">Serv</span>}
                            {p.name}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{catLabelOf(p.category)}</span>
                            <span className="text-xs font-bold">{p.stock ?? 0} uds</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : null}

      {/* Barcode Scanner */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      <InventarioSelectorProductos inv={inv} />

      <ModalNuevoProducto inv={inv} />

      <ModalEditarProducto inv={inv} />

      <InventarioMasivo inv={inv} />

      <InventarioEdicionMasiva inv={inv} />

      <InventarioVentanas inv={inv} />
    </div>
  );
}
