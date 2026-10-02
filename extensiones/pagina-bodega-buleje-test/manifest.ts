/**
 * Página propia «Buleje Beauty» (salón y cosmética capilar) — manifiesto (ADR-458, enchufe `tienda.pagina`).
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
  nombre: "Buleje Beauty — salón y cosmética capilar",
  descripcion:
    "Página pública propia de UN negocio (/t/<negocio>): tienda de belleza con anuncios, portada en carrusel, " +
    "ofertas con el descuento real, líneas propias, servicios del salón reservables por WhatsApp y el carrito de la tienda. " +
    "Viste también el resto de su tienda (catálogo propio, cuenta, pedidos, legales y checkout con su encabezado, pie y bolsa). " +
    "Si falla, se ve la general.",
  version: "2.1.0",
  enchufes: ["tienda.pagina"],
  opciones,
} as const satisfies ManifiestoPieza<typeof opciones>;
