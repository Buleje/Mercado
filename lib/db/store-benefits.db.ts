import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * StoreBenefitsDB — acceso a la columna `Store.benefits` (JSONB, fuera del
 * schema Prisma). Centraliza el patrón raw-SQL parametrizado para que los
 * routes NO toquen `prisma.*` directo (regla multi-tenant).
 *
 * `benefits` mezcla perks de superadmin (verified/searchBoost/ownBanner) con
 * flags self-serve de la bodega (acceptsFiado). El merge JSONB (`|| $::jsonb`)
 * solo pisa la clave enviada, preservando el resto.
 */

/** Resuelve el id de la tienda (marketplace) del tenant. null si no existe. */
async function resolveStoreId(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: { id: true, slug: true },
  });
  if (!tenant) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Store" WHERE "tenantId" = ANY($1::text[]) LIMIT 1`,
    [tenant.id, tenant.slug],
  );
  return rows[0]?.id ?? null;
}

export const StoreBenefitsDB = {
  /**
   * Estado del beneficio "Acepta fiado" de la tienda del tenant.
   * `hasStore=false` cuando el tenant aún no publicó tienda en el marketplace.
   */
  async getFiado(
    tenantId: string,
  ): Promise<{ acceptsFiado: boolean; hasStore: boolean }> {
    const storeId = await resolveStoreId(tenantId);
    if (!storeId) return { acceptsFiado: false, hasStore: false };

    const rows = await prisma.$queryRawUnsafe<
      Array<{ benefits: Record<string, unknown> | null }>
    >(`SELECT benefits FROM "Store" WHERE id = $1 LIMIT 1`, storeId);
    const benefits = rows[0]?.benefits ?? {};
    return { acceptsFiado: Boolean(benefits.acceptsFiado), hasStore: true };
  },

  /**
   * Setea `benefits.acceptsFiado` para la tienda del tenant. Devuelve el
   * storeId afectado, o null si el tenant no tiene tienda.
   */
  async setFiado(tenantId: string, enabled: boolean): Promise<string | null> {
    const storeId = await resolveStoreId(tenantId);
    if (!storeId) return null;

    await prisma.$executeRawUnsafe(
      `UPDATE "Store" SET benefits = COALESCE(benefits, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify({ acceptsFiado: enabled }),
      storeId,
    );
    logger.info("[StoreBenefitsDB] acceptsFiado actualizado", {
      tenantId,
      storeId,
      enabled,
    });
    return storeId;
  },
};
