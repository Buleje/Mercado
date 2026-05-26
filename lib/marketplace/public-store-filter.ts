import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Slugs reservados — referencia histórica. YA NO se usan para ocultar tiendas
 * (ver `publicStoreWhere`). Se mantienen exportados por compatibilidad.
 */
export const RESERVED_STORE_SLUGS = ["tienda-3", "buleje", "main", "demo"] as const;

/**
 * Where-fragment Prisma para tiendas PÚBLICAS del marketplace.
 *
 * 2026-05-26: la visibilidad es 100% `isPublished`, controlada por el SUPERADMIN
 * desde /superadmin/stores (PATCH isPublished). Antes este filtro ocultaba
 * "internamente" cualquier tienda con test/prueba/demo en nombre/slug + slugs
 * reservados → tiendas de prueba publicadas NO contaban ni salían en "Cerca tuyo"
 * aunque sí aparecían en el listado (inconsistencia). Ahora criterio único: si el
 * superadmin la publicó, se ve; para ocultarla, la despublica. Listado, contador
 * y destacados quedan consistentes.
 */
export const publicStoreWhere = {
  isPublished: true,
} satisfies Prisma.StoreWhereInput;
