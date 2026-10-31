"use client";

/**
 * La cabecera de Entradas y salidas y de Vencimientos en UNA fila: título + ⓘ
 * · secciones (si hay) · Indicadores + acción principal + «Más». En el celular
 * las secciones bajan a su propia fila (patrón de `TurnosModule`).
 */
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

/** El `tabpanel` que controla la `BarraDeSecciones` de la cabecera. */
export type PanelDeSeccion = { id: string; etiquetadoPor: string };

interface Props {
  titulo: string;
  ayuda: { what: string; affects?: string; example?: string };
  /** La `BarraDeSecciones` de la vista, si tiene secciones. */
  secciones?: ReactNode;
  indicadores?: ReactNode;
  accion?: ReactNode;
  acciones: MenuAccion[];
  tituloMenu: string;
}

export function CabeceraVista({ titulo, ayuda, secciones, indicadores, accion, acciones, tituloMenu }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">{titulo}</SectionTitle>
        <InfoTip title={titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">{secciones}</div>}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {indicadores}
        {accion}
        {/* `shrink-0` en un envoltorio: el del botón no alcanza al `div.relative`
            del menú, que en una fila llena se encogía a 31 px y dejaba el «⋯»
            asomando 17 px fuera de la vista (Rentabilidad, 2026-10-11). */}
        <div className="shrink-0">
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title={tituloMenu} />
        </div>
      </div>
    </div>
  );
}

/** El cuerpo de una sección: `tabpanel` si la vista tiene secciones; si no, un bloque más. */
export function CuerpoDeSeccion({ panel, children }: { panel?: PanelDeSeccion; children: ReactNode }) {
  return panel
    ? <div role="tabpanel" id={panel.id} aria-labelledby={panel.etiquetadoPor} className="space-y-3">{children}</div>
    : <div className="space-y-3">{children}</div>;
}
