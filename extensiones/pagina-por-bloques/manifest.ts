/**
 * Pieza `pagina-por-bloques` — manifiesto (ADR-457, capa 3 → capa 4).
 *
 * El puente entre el CMS y la portada: el CÓDIGO vive en archivos (esta pieza)
 * y el CONTENIDO lo edita el dueño en Mi Tienda → Páginas. La pieza reemplaza
 * el cuerpo de la portada por la página PUBLICADA del mismo negocio cuyo
 * enlace dice `paginaSlug`. Si esa página no existe, está en borrador o no
 * tiene bloques, se ve la portada de siempre.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

export const opcionesPaginaPorBloques = z
  .object({
    /**
     * El enlace de la página (Mi Tienda → Páginas), sin barras: «inicio»,
     * «campana-octubre». Mismo formato que exige el CMS al crearla. Por
     * defecto «inicio»: prender la pieza sin llenar nada busca esa página.
     */
    paginaSlug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones")
      .default("inicio"),
  })
  .strict();

export type OpcionesPaginaPorBloques = z.output<typeof opcionesPaginaPorBloques>;

export const manifiesto = {
  id: "pagina-por-bloques",
  nombre: "Portada armada por bloques",
  descripcion:
    "Cambia el cuerpo de la portada de la tienda por una página que el dueño arma en Mi Tienda → Páginas " +
    "(el enlace se elige acá). El menú, el encabezado y el pie se quedan. Si la página no está publicada, " +
    "se ve la portada de siempre.",
  version: "1.0.0",
  enchufes: ["tienda.portada"],
  opciones: opcionesPaginaPorBloques,
} as const satisfies ManifiestoPieza<typeof opcionesPaginaPorBloques>;
