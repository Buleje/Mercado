"use client";

/**
 * LothSeccionBarra — la barra de trabajo de una sección del LO-TH.
 *
 * Misma regla que el resto de los libros (`admin/shared/action-menu`): lo que
 * se hace todos los días queda a la vista —asentar una línea nueva— y lo que
 * se hace de vez en cuando entra a «Opciones» con su línea de explicación.
 *
 * Los filtros ya no viven acá (Brandon 07-10): el buscador «Código, especie o
 * GTF» y los desplegables Período, Estado y Especie pasaron al autofiltro de
 * cada cabecera de la tabla (`loth-seccion-filtros`) — código, especie, GTF,
 * fecha y estado tienen ahí su filtro, sobre la sección entera.
 *
 * «Nueva línea» vive acá y no en la cabina: la línea se asienta en la sección
 * que se está mirando, y en la cabina quedaba escondida dentro del panel de
 * Herramientas —la acción de todos los días, a dos clics y sin verse—.
 */

import type { ComponentType } from "react";
import { Plus } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

const PRIMARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 max-sm:flex-1";
const SECUNDARIO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 max-sm:flex-1";

export default function LothSeccionBarra({
  opciones,
  onNuevaLinea,
  principal,
}: {
  opciones: MenuAccion[];
  onNuevaLinea: () => void;
  /**
   * La acción de todos los días de ESTA sección, cuando no es «Nueva línea»:
   * en Despacho de trozas es «Despachar con guía» (28-09-2026) — la guía y sus
   * líneas en un solo registro. Con ella, «Nueva línea» pasa a secundario.
   */
  principal?: { label: string; title?: string; icon: ComponentType<{ className?: string }>; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
        <ActionMenu
          label="Opciones"
          title="Importar, etiquetas QR y descargar"
          actions={opciones}
          size="md"
          compactoEnMovil
        />
        <button
          type="button"
          onClick={onNuevaLinea}
          className={principal ? SECUNDARIO : PRIMARIO}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva línea
        </button>
        {principal && (
          <button type="button" onClick={principal.onClick} title={principal.title} className={PRIMARIO}>
            <principal.icon className="h-4 w-4" aria-hidden="true" />
            {principal.label}
          </button>
        )}
      </div>
    </div>
  );
}
