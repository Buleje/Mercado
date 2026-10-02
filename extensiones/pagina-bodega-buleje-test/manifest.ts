/**
 * Página propia "Página propia de Bodega Buleje Test" — manifiesto (ADR-458, enchufe `tienda.pagina`).
 *
 * La página pública ENTERA de `/t/<negocio>` para UN solo negocio: el
 * superadmin la prende en la ficha del negocio y nadie más puede tenerla. El
 * negocio NO se escribe acá (la asignación vive en la tabla `TenantPieza`).
 * Cómo cambiarla: LEEME.md de esta carpeta.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

/** Sin opciones: lo que cambia esta página se escribe en `servidor.tsx`. */
export const opciones = z.object({}).strict();

export type Opciones = z.output<typeof opciones>;

export const manifiesto = {
  id: "pagina-bodega-buleje-test",
  nombre: "Página propia de Bodega Buleje Test",
  descripcion:
    "Página pública propia de UN negocio: reemplaza su página entera (/t/<negocio>). " +
    "Arranca igual a la general y se cambia en el código. Si falla, se ve la general.",
  version: "1.0.0",
  enchufes: ["tienda.pagina"],
  opciones,
} as const satisfies ManifiestoPieza<typeof opciones>;
