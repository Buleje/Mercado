"use client";

/**
 * «Columnas n/m» y «Restablecer el orden» como renglones de «Opciones», con
 * las casillas en una ventana: lo que usan las vistas del Libro TH cuando sus
 * botones se mudan al riel del libro (compactación 17-10). En el riel no hay
 * lugar para un botón de columnas propio, y es algo de vez en cuando.
 * Lo usan GTF (`LothGtfCabecera`) y Secciones (`LothSeccionBarra`).
 */

import { useState, type ReactNode } from "react";
import { ArrowUpDown, Columns3 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import {
  CasillasColumnas,
  type UseOrdenColumnasResult,
  type UseVisibilidadColumnasResult,
} from "@/components/admin/shared/columnas-ordenables";

export interface ColumnasDeLaTabla {
  vis: UseVisibilidadColumnasResult;
  orden: UseOrdenColumnasResult;
}

export function useMenuColumnas(
  columnas: ColumnasDeLaTabla | null | undefined,
  titulo: string,
): { acciones: MenuAccion[]; ventana: ReactNode } {
  const [ver, setVer] = useState(false);
  if (!columnas) return { acciones: [], ventana: null };
  const acciones: MenuAccion[] = [
    {
      id: "columnas",
      label: "Columnas",
      hint: "Ocultar o mostrar columnas de la tabla",
      meta: `${columnas.vis.cuantasVisibles}/${columnas.vis.columnas.length}`,
      icon: Columns3,
      onSelect: () => setVer(true),
    },
    ...(columnas.orden.cambiado
      ? [{
          id: "orden",
          label: "Restablecer el orden",
          hint: "Las columnas vuelven a su orden de siempre (arrastraste un título)",
          icon: ArrowUpDown,
          onSelect: columnas.orden.restablecer,
        }]
      : []),
  ];
  const ventana = (
    <AdminModal
      open={ver}
      onClose={() => setVer(false)}
      title={titulo}
      description="Lo que ocultes se recuerda en este navegador. Arrastra un título para cambiarlo de lugar."
      icon={Columns3}
      size="sm"
    >
      <div role="group" aria-label="Columnas visibles" className={MODAL_BODY}>
        <CasillasColumnas vis={columnas.vis} />
      </div>
    </AdminModal>
  );
  return { acciones, ventana };
}
