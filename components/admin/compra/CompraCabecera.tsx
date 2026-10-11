"use client";

import { useRef } from "react";
import { SectionTitle } from "@buleje/design-system";
import { ArrowUpDown, Camera, LayoutGrid, List, MoreHorizontal, Receipt, UserPlus } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { PurchaseSortBy as SortBy } from "@/lib/types/purchases";
import type { CompraCatalogo } from "./use-compra-catalogo";

/** El orden de los productos (antes un desplegable más en la fila de filtros). */
const ORDENES: ReadonlyArray<{ id: SortBy; label: string }> = [
  { id: "stock", label: "Menos stock primero" },
  { id: "price", label: "Por precio" },
  { id: "name", label: "Por nombre" },
];

/** Gastos fijos e historial se mudaron a Mi Plata (ola 3): el camino queda en el «⋯». */
const HREF_GASTOS = "/admin?tab=plata&vista=gastos";

interface Props {
  catalogo: CompraCatalogo;
  processing: boolean;
  onEscanearFactura: () => void;
  onNuevoProveedor: () => void;
}

/**
 * La cabecera de Comprar en UNA fila (patrón del panel, 10-10): título · ⓘ ·
 * Leer factura · ⋯. Antes los contadores iban en una fila propia a la derecha,
 * «Nuevo», «Código», «Factura», la vista y el orden sueltos en la fila de
 * filtros, y el enlace a los gastos fijos en otra línea más. «N a reponer» es
 * ahora el chip de la fila de filtros (con su cuenta) y el lector de códigos,
 * el botón dentro del buscador.
 */
export default function CompraCabecera({ catalogo, processing, onEscanearFactura, onNuevoProveedor }: Props) {
  const { viewMode, setViewMode, sortBy, setSortBy } = catalogo;
  /* ActionMenu no le devuelve el foco a su botón: la ventana que se abre
     guardaba «body» y, al cerrarla, el teclado volvía al inicio de la página. */
  const menuRef = useRef<HTMLDivElement>(null);
  const conFoco = (accion: () => void) => () => {
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    accion();
  };
  const acciones: MenuAccion[] = [
    { id: "proveedor", label: "Nuevo proveedor", hint: "Lo creas acá y queda elegido para esta compra", icon: UserPlus, onSelect: conFoco(onNuevoProveedor), disabled: processing },
    {
      id: "vista",
      label: viewMode === "grid" ? "Ver como lista" : "Ver como cuadrícula",
      icon: viewMode === "grid" ? List : LayoutGrid,
      onSelect: () => setViewMode((v) => (v === "grid" ? "list" : "grid")),
    },
    { id: "gastos", label: "Gastos fijos e historial", hint: "En Mi Plata › Gastos y presupuesto", icon: Receipt, onSelect: () => irAEnlace(HREF_GASTOS) },
    ...ORDENES.map(({ id, label }) => ({ id: `orden-${id}`, label, seccion: "Ordenar", icon: ArrowUpDown, activo: sortBy === id, onSelect: () => setSortBy(id) })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Comprar</SectionTitle>
        <InfoTip
          title="Comprar"
          what="Arma la compra al proveedor: elige productos de tu inventario o lee la factura con la cámara, y confírmala en la canasta."
          affects="Al confirmar se crea la orden de compra: la recibes en Órdenes y recepción, y si es a crédito queda en Por pagar."
          example="«A reponer» cuenta los productos en o bajo el stock mínimo que fijaste; Sugerencias mira cuánto se vendió, así que puede darte otro número."
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onEscanearFactura}
          title="Lee la factura con la cámara y arma la canasta"
          className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}
        >
          <Camera className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Leer factura</span>
        </button>
        <div ref={menuRef} className="contents">
          <ActionMenu
            label="Más acciones de Comprar"
            icon={MoreHorizontal}
            actions={acciones}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Nuevo proveedor, vista, orden y gastos fijos"
          />
        </div>
      </div>
    </div>
  );
}
