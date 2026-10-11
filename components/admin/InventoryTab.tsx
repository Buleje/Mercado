"use client";

import { BlockTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import type { ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import { cn } from "@/lib/utils";
import type { DbProduct } from "@/lib/jsondb";
import { useInventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioBarra from "@/components/admin/inventario/InventarioBarra";
import InventarioCabecera from "@/components/admin/inventario/InventarioCabecera";
import { useIndicadoresInventario, MargenPorCategoria, AvisoDuplicados } from "@/components/admin/inventario/InventarioResumen";
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
import { useState } from "react";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

export default function InventoryTab({ headerActions = [] }: { headerActions?: ModuleActionItem[] } = {}) {
  // El estado y las acciones viven en `useInventario` (inventario/hooks/); cada bloque de la vista,
  // en su pieza de `inventario/`. Partido el 09-10 sin cambiar el DOM.
  const inv = useInventario(headerActions);
  const {
    loading, view, setEditModalProduct, showScanner, setShowScanner, handleBarcodeScan, catLabelOf,
    filteredProducts, setSearch,
  } = inv;
  // El escáner del buscador: el código leído pasa a la búsqueda (que ya mira el código de
  // barras). El otro escáner, el de «Más acciones», sigue creando un producto nuevo.
  const [escanerBusca, setEscanerBusca] = useState(false);
  const kpis = useIndicadoresInventario(inv);

  if (loading) return <InventarioCargando />;

  // Patrón del panel (10-10): cabecera en una fila (título · Indicadores ·
  // Nuevo · ⋯), los avisos en una línea y los filtros pegados a la tabla.
  return (
    <div className="space-y-3">
      <InventarioCabecera inv={inv} indicadores={kpis.boton} />

      {kpis.panel}
      {kpis.abierto && <MargenPorCategoria inv={inv} />}

      <InventarioAlertaOC inv={inv} />
      <AvisoDuplicados inv={inv} />

      <InventarioBarra inv={inv} onBuscarConEscaner={() => setEscanerBusca(true)} />

      <InventarioOpciones inv={inv} />
      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)]">
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
          /* Cada columna con su tono (fondo /10, borde /40: se lee en los dos temas) y la
             cifra en tinta del mismo tono (Exceso en azul `--data-6`: en /admin el «info» es
             turquesa como Normal). Antes «Normal» y «Exceso» ponían blanco
             sobre un turquesa al 10 % y el número no se veía. */
          const columns = [
            { key: "agotado", label: "Agotado", color: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10", badgeColor: "bg-[var(--data-error-100)] text-[var(--data-error-ink)]", filter: (p: DbProduct) => (p.stock ?? 0) === 0 },
            { key: "bajo", label: "Pocas existencias", color: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10", badgeColor: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]", filter: (p: DbProduct) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5) },
            { key: "normal", label: "Normal", color: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10", badgeColor: "bg-[var(--data-success-100)] text-[var(--data-success-ink)]", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMin ?? 5) && (p.stock ?? 0) <= (p.stockMax ?? 999) },
            { key: "exceso", label: "Exceso", color: "border-[var(--data-6)]/40 bg-[var(--data-6)]/10", badgeColor: "bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--data-6)]/40", filter: (p: DbProduct) => (p.stock ?? 0) > (p.stockMax ?? 999) },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
              {columns.map(col => {
                const items = filteredProducts.filter(col.filter);
                return (
                  <div key={col.key} className={cn("rounded-xl border p-3 min-h-50", col.color)}>
                    <div className="flex items-center justify-between mb-3">
                      <BlockTitle>{col.label}</BlockTitle>
                      <span className={cn("text-sm font-bold tabular-nums px-2 py-0.5 rounded-full", col.badgeColor)}>{items.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Sin productos</p>
                      ) : items.map(p => (
                        <div key={p.id} role="button" tabIndex={0}
                          aria-label={`Editar ${p.name}`}
                          className="bg-[var(--surface-raised)] rounded-lg p-2.5  border border-[var(--rule-soft)] dark:border-border cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                          onClick={() => { setEditModalProduct(p); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditModalProduct(p); } }}>
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {p.type === "service" && <span className="mr-1 rounded bg-primary/10 px-1 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)]">Serv.</span>}
                            {p.name}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm text-[var(--text-secondary)]">{catLabelOf(p.category)}</span>
                            <span className="text-sm font-bold">{p.stock ?? 0} {p.unit || "uds"}</span>
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
      {escanerBusca && (
        <BarcodeScanner
          onDetected={(code) => { setEscanerBusca(false); setSearch(code.trim()); }}
          onClose={() => setEscanerBusca(false)}
        />
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
