/**
 * store-tenant-bridge.ts
 *
 * Helper compartido para resolver el `storeSlug` de marketplace a partir del
 * `tenantId` validado por `requireAdmin`. Cachea por-request usando
 * `React.cache` para evitar el patrón N+1 detectado en logs (3× tenant.findFirst
 * + 3× store.findFirst en una sola request al cambiar orden de categorías).
 *
 * Uso típico (route handler admin/marketplace):
 *
 *   const auth = await requireAdmin(req, ["admin", "manager"]);
 *   if (auth instanceof NextResponse) return auth;
 *   const slug = await resolveStoreSlugForTenant(auth.tenantId);
 *
 * `auth.tenantId` puede venir como CUID o slug — el helper consulta ambos.
 *
 * Detectado en sesión 2026-04-28 vía `/health` logger.
 * Refactor 2026-05-05 (deuda técnica del audit profundo).
 */

import { cache } from "react";
import { prisma } from "./prisma";

/**
 * Resuelve el `storeSlug` para el tenant dado.
 *
 * Devuelve `null` si:
 *   - el tenantId no corresponde a ningún tenant,
 *   - o el tenant no tiene store de marketplace asociada.
 *
 * Memoizado por request via `React.cache`. Las llamadas repetidas dentro de
 * la misma request server-side reutilizan el resultado.
 */
export const resolveStoreSlugForTenant = cache(async (tenantId: string): Promise<string | null> => {
  if (!tenantId) return null;

  const tenant = await prisma.tenant
    .findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { id: true, slug: true },
    })
    .catch(() => null);
  if (!tenant) return null;

  const store = await prisma.store
    .findFirst({
      where: { tenantId: { in: [tenant.id, tenant.slug] } },
      select: { slug: true },
    })
    .catch(() => null);

  return store?.slug ?? null;
});
