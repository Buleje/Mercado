"use client";

/**
 * EncabezadoAgenda — la cabecera de cada vista de Administración en UNA fila
 * (patrón de `rrhh/EncabezadoDeVista`): título + ⓘ · secciones · a la derecha
 * la acción principal y «⋯» con lo secundario. En el celular las secciones
 * bajan a su propia fila.
 */
import type { ReactNode } from "react";
import { MoreHorizontal } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export interface AyudaAgenda {
  what: ReactNode;
  affects?: ReactNode;
  example?: ReactNode;
}

interface Props {
  titulo: string;
  ayuda: AyudaAgenda;
  /** Pegado al título (mes/semana, la fecha de hoy). */
  secciones?: ReactNode;
  acciones?: ReactNode;
  menu?: readonly MenuAccion[];
}

export function EncabezadoAgenda({ titulo, ayuda, secciones, acciones, menu = [] }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <SectionTitle className="truncate">{titulo}</SectionTitle>
        <InfoTip title={titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">{secciones}</div>}
      {(acciones || menu.length > 0) && (
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {acciones}
          {menu.length > 0 && (
            <ActionMenu
              label="Más"
              icon={MoreHorizontal}
              actions={[...menu]}
              soloIcono
              size="md"
              className="w-12 shrink-0"
              title={menu.map((a) => a.label).join(", ")}
            />
          )}
        </div>
      )}
    </div>
  );
}
