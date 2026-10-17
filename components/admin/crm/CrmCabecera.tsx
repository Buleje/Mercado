"use client";

import { useRef, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { BarChart3, Columns3, Download, MoreHorizontal, RefreshCw, UserPlus } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { exportToCSV } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { SEGMENT_CONFIG } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import { useParamDeEntrada } from "@/hooks/use-param-de-entrada";
import { MenuVistasGuardadas } from "@/components/admin/shared/MenuVistasGuardadas";
import { useVistasCrm } from "@/components/admin/crm/use-vistas-crm";

/**
 * La cabecera de Mis clientes en UNA fila (patrón del panel, 10-10): título ·
 * ⓘ · Indicadores · Nuevo cliente · ⋯. Actualizar, las descargas, Comparar y
 * Restablecer columnas van al «⋯» (antes, botones sueltos en la fila del
 * buscador, que empujaban a los filtros a tres renglones).
 */
export default function CrmCabecera({ crm, indicadores }: { crm: Crm; indicadores: ReactNode }) {
  const { customers, filtered, load, setShowNewClientModal, compareMode, setCompareMode, setComparePhones, orden } = crm;
  /* ActionMenu cierra sin devolverle el foco a su botón: la ventana que se abre
     guardaba «body» y, al cerrarla, el teclado volvía al inicio de la página. */
  const menuRef = useRef<HTMLDivElement>(null);
  /* «Nuevo cliente» desde el buscador del panel llega como `?nuevo=1` (M04). */
  useParamDeEntrada("nuevo", () => setShowNewClientModal(true), (p) => p.get("tab") === "clientes");
  const vistas = useVistasCrm(crm);
  const conFoco = (accion: () => void) => () => {
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    accion();
  };
  const acciones: MenuAccion[] = [
    { id: "actualizar", label: "Actualizar", hint: "Vuelve a traer los clientes y sus compras", icon: RefreshCw, onSelect: load },
    {
      id: "csv",
      label: "Descargar CSV",
      hint: "Todos los clientes, para abrir en cualquier programa",
      icon: Download,
      disabled: customers.length === 0,
      onSelect: () =>
        exportToCSV(
          customers.map(c => ({ nombre: c.name, teléfono: c.phone, ubicacion: c.location ?? "", gastado: c.totalSpent ?? 0, compras: c._orderCount ?? 0, segmento: c._segment ?? "nuevo" })),
          "crm-clientes",
        ),
    },
    {
      id: "excel",
      label: "Descargar Excel",
      hint: "Sólo los clientes que ves con los filtros de ahora",
      icon: Download,
      disabled: filtered.length === 0,
      onSelect: () => {
        const rows = filtered.map(c => ({
          Nombre: c.name,
          "Teléfono": c.phone,
          "Categoría": c.loyaltyTier ?? "—",
          Tags: (c._tags ?? []).join(", ") || "—",
          Compras: c._orderCount ?? 0,
          "Total gastado (S/)": Number((c.totalSpent ?? 0).toFixed(2)),
          "Última compra": c._lastOrder ? formatDateNumeric(c._lastOrder) : "Sin compras",
          Segmento: SEGMENT_CONFIG[c._segment ?? "nuevo"].label,
        }));
        exportToExcel(rows, `clientes-${new Date().toISOString().slice(0, 10)}`, "Clientes");
      },
    },
    {
      id: "comparar",
      label: compareMode ? "Salir de comparar" : "Comparar clientes",
      hint: "Marca hasta tres y míralos lado a lado",
      icon: BarChart3,
      activo: compareMode,
      onSelect: () => { setCompareMode(!compareMode); if (compareMode) setComparePhones(new Set()); },
    },
    ...(orden.cambiado
      ? [{ id: "columnas", label: "Restablecer columnas", hint: "Las columnas vuelven a su orden de fábrica", icon: Columns3, onSelect: orden.restablecer }]
      : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Mis clientes</SectionTitle>
        <InfoTip
          title="Mis clientes"
          what="Tus clientes con lo que compraron: ventas del POS con su celular y pedidos. Ordenados por lo que gastaron; toca uno para ver su ficha."
          affects="El segmento sale de cuántas veces compró y hace cuánto: Frecuente (5 o más), Ocasional (2 a 4), Nuevo (0 o 1) y Perdido (más de 90 días sin comprar)."
          example="Elige «Perdido» en Segmento para ver a quién escribirle."
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {indicadores}
        {/* M07 (17-10): tu vista de la lista —búsqueda, filtros, columnas— con un nombre. */}
        <MenuVistasGuardadas
          vistas={vistas}
          queGuarda="La búsqueda, los filtros y el orden de las columnas que tienes puestos ahora"
          ejemplo="Ej.: Fiados del barrio"
        />
        <button
          type="button"
          onClick={() => setShowNewClientModal(true)}
          className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4" })}
        >
          <UserPlus className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Nuevo cliente</span>
        </button>
        <div ref={menuRef} className="contents">
          <ActionMenu
            label="Más acciones de Mis clientes"
            icon={MoreHorizontal}
            actions={acciones.map(a => ({ ...a, onSelect: conFoco(a.onSelect) }))}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Actualizar, descargar, comparar y columnas"
          />
        </div>
      </div>
    </div>
  );
}
