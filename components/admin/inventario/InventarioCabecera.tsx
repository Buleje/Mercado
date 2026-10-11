"use client";

import { useRef, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal, Plus } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { menuDeInventario } from "@/components/admin/inventario/hooks/use-menu-inventario";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/**
 * La cabecera de Productos y stock en UNA fila (patrón del panel, 10-10):
 * título · ⓘ · Indicadores · Nuevo · ⋯. Antes «Nuevo» y «Más acciones» iban
 * al final de la fila del buscador y empujaban los filtros a dos renglones.
 */
export default function InventarioCabecera({ inv, indicadores }: { inv: Inventario; indicadores: ReactNode }) {
  const { setShowPicker, setPickerSearch, setPickerCat, csvImportRef, handleCsvImport } = inv;
  /* ActionMenu cierra y llama a la acción sin devolverle el foco a su botón: la
     ventana que se abre guardaba «body» como de dónde vino y, al cerrarla, el
     teclado volvía al inicio de la página. Se enfoca el ⋯ antes de abrir. */
  const menuRef = useRef<HTMLDivElement>(null);
  const conFoco = (accion: () => void) => () => {
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    accion();
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Productos y stock</SectionTitle>
        <InfoTip
          title="Productos y stock"
          what="Tu catálogo con lo que hay de cada producto: búscalo, fíltralo y edítalo; el ⋯ de cada fila trae el resto."
          affects="Precio, stock mínimo y activo se ven en el POS y en tu tienda en línea."
          example="Toca «Bajo stock» para ver sólo lo que hay que reponer."
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {indicadores}
        <button
          type="button"
          onClick={() => { setPickerSearch(""); setPickerCat("todos"); setShowPicker(true); }}
          className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4" })}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> Nuevo
        </button>
        <div ref={menuRef} className="contents">
          <ActionMenu
            label="Más acciones de Productos y stock"
            icon={MoreHorizontal}
            actions={menuDeInventario(inv, { conFoco })}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Conteo, declaración, etiquetas, precios en %, fotos, descargas, vista y actualizar"
          />
        </div>
        <input ref={csvImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
      </div>
    </div>
  );
}
