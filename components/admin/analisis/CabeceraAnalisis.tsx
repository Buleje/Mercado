"use client";

/**
 * La cabecera de cada vista de Análisis en UNA fila (el patrón del panel,
 * `TurnosModule`): título + ⓘ · secciones (si hay 2+) · a la derecha los
 * Indicadores, la acción principal y «Más».
 *
 * Antes cada vista apilaba su propio encabezado grande (Inteligencia tenía
 * cinco: «Inteligencia de Negocio», «Business Intelligence», «KPIs
 * Personalizados», «Tracker de Competencia»…) y la de Métricas un tercer
 * nivel de pestañas. Ahora las tres usan esta misma fila.
 */

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export interface AyudaVista {
  what: ReactNode;
  affects?: ReactNode;
  example?: ReactNode;
}

interface Props {
  titulo: string;
  ayuda: AyudaVista;
  /** La `BarraDeSecciones` de la vista, si tiene 2+ secciones. */
  secciones?: ReactNode;
  /** Indicadores y acción principal (h-12), a la derecha. */
  children?: ReactNode;
  /** Lo secundario: exportar, actualizar, lo que se mudó a otra pestaña. */
  acciones?: readonly MenuAccion[];
  /** El `title` del botón «Más»: qué hay adentro, en una línea. */
  tituloMas?: string;
}

export function CabeceraAnalisis({ titulo, ayuda, secciones, children, acciones = [], tituloMas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">{titulo}</SectionTitle>
        <InfoTip title={titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">{secciones}</div>}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {children}
        {acciones.length > 0 && (
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            actions={[...acciones]}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title={tituloMas ?? "Más acciones"}
          />
        )}
      </div>
    </div>
  );
}
