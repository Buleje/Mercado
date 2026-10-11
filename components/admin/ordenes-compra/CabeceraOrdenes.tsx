"use client";

import { useRef, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export interface AyudaDeSeccion {
  title: string;
  what: string;
  affects: string;
  example: string;
}

/**
 * La cabecera de Órdenes y recepción en UNA fila (patrón del panel, 10-10):
 * título · ⓘ · secciones · Indicadores · acción principal · «Más». La usan las
 * dos secciones (Órdenes y Recepciones) con su ayuda, su acción y su menú; en
 * el celular las secciones bajan a su propia línea.
 */
export default function CabeceraOrdenes({
  barra,
  ayuda,
  indicadores,
  principal,
  acciones,
  tituloMenu,
}: {
  barra?: ReactNode;
  ayuda: AyudaDeSeccion;
  indicadores?: ReactNode;
  principal?: ReactNode;
  acciones: MenuAccion[];
  tituloMenu: string;
}) {
  /* ActionMenu cierra y llama a la acción sin devolverle el foco a su botón: la
     ventana que se abre guardaba «body» y, al cerrarla, el teclado volvía al
     inicio de la página. Se enfoca el ⋯ antes de abrir. */
  const menuRef = useRef<HTMLDivElement>(null);
  const conFoco = acciones.map((a) => ({
    ...a,
    onSelect: () => {
      menuRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
      a.onSelect();
    },
  }));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Órdenes de compra</SectionTitle>
        <InfoTip {...ayuda} />
      </div>
      {barra && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">{barra}</div>}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {indicadores}
        {principal}
        <div ref={menuRef} className="contents">
          <ActionMenu label="Más" icon={MoreHorizontal} actions={conFoco} soloIcono size="md" className="w-12 shrink-0" title={tituloMenu} />
        </div>
      </div>
    </div>
  );
}
