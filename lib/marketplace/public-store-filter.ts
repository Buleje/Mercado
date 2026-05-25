import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Slugs reservados (plataforma / test / demo) — NUNCA aparecen en el listado
 * público del marketplace. "main" = tienda de la plataforma; el resto son de
 * prueba/onboarding.
 */
export const RESERVED_STORE_SLUGS = ["tienda-3", "buleje", "main", "demo"] as const;

/**
 * Where-fragment Prisma para tiendas PÚBLICAS del marketplace:
 *   - publicadas
 *   - sin slugs reservados
 *   - sin nombres/slugs de test/prueba/demo
 *
 * Mismo criterio que `/api/marketplace/stores` (audit P0 2026-05-20).
 * Centralizado aquí para que el listado, "Cerca tuyo" (featured-stores) y el
 * CONTEO de tiendas activas coincidan — antes featured-stores y el contador
 * incluían las de prueba y mostraban 6 donde el público ve 3.
 */
export const publicStoreWhere = {
  isPublished: true,
  slug: { notIn: [...RESERVED_STORE_SLUGS] },
  NOT: [
    { slug: { contains: "test", mode: "insensitive" } },
    { slug: { contains: "prueba", mode: "insensitive" } },
    { slug: { contains: "demo", mode: "insensitive" } },
    { name: { contains: "prueba", mode: "insensitive" } },
    { name: { contains: "test", mode: "insensitive" } },
  ],
} satisfies Prisma.StoreWhereInput;
