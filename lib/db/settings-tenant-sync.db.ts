import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * SettingsTenantSyncDB
 *
 * Audit project-wide 2026-05-19 — métodos auxiliares para settings/route.ts.
 *
 * Propósito: resolver slug → cuid y propagar branding (logoUrl, businessName,
 * primaryColor, secondaryColor, coverUrl, bannerUrl) desde Settings hacia los
 * modelos Tenant y Store. Estas operaciones se usan SOLO en modo fire-and-forget
 * o en validación de tenantId — no bloquean la respuesta principal.
 *
 * NO tocar lib/db/settings.db.ts (archivo compartido protegido).
 */

/**
 * Resuelve slug de tenant → cuid.
 * Devuelve el cuid, o null si no se encuentra.
 */
export async function resolveTenantSlugToId(slug: string): Promise<string | null> {
  const t = await prisma.tenant
    .findUnique({ where: { slug }, select: { id: true } })
    .catch((err: unknown) => {
      logger.warn("[settings-tenant-sync] slug resolution failed", {
        slug,
        error: String(err),
      });
      return null;
    });
  return t?.id ?? null;
}

interface BrandingPayload {
  logoUrl?: string;
  businessName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  bannerUrl?: string;
  coverUrl?: string;
  description?: string;
}

/**
 * Propaga cambios de branding al modelo Tenant (fire-and-forget).
 * Llamar con `.catch((err) => logger.warn(...))` en el route handler.
 */
export function syncBrandingToTenant(
  tenantId: string,
  payload: Pick<BrandingPayload, "logoUrl" | "businessName" | "primaryColor" | "secondaryColor">,
): Promise<unknown> {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(payload.logoUrl !== undefined && { logoUrl: payload.logoUrl || null }),
      ...(payload.businessName !== undefined && payload.businessName && { name: payload.businessName }),
      ...(payload.primaryColor !== undefined && payload.primaryColor && { primaryColor: payload.primaryColor }),
      ...(payload.secondaryColor !== undefined && payload.secondaryColor && { secondaryColor: payload.secondaryColor }),
    },
  });
}

/**
 * Propaga cambios de branding al modelo Store (fire-and-forget).
 * Llamar con `.catch((err) => logger.warn(...))` en el route handler.
 */
export function syncBrandingToStore(
  tenantId: string,
  payload: Pick<BrandingPayload, "logoUrl" | "bannerUrl" | "description" | "businessName">,
): Promise<unknown> {
  return prisma.store.updateMany({
    where: { tenantId },
    data: {
      ...(payload.logoUrl !== undefined && { logo: payload.logoUrl || null }),
      ...(payload.bannerUrl !== undefined && { banner: payload.bannerUrl || null }),
      ...(payload.description !== undefined && { description: payload.description || null }),
      ...(payload.businessName !== undefined && payload.businessName && { name: payload.businessName }),
    },
  });
}

/**
 * Sincroniza Store.cover via raw SQL.
 * La columna existe en DB pero no en schema.prisma (patrón expand seguro).
 * Fire-and-forget — llamar con `.catch((err) => logger.warn(...))`.
 */
export function syncStoreCover(tenantId: string, coverUrl: string | undefined): Promise<unknown> {
  if (coverUrl === undefined) return Promise.resolve();
  return prisma.$executeRaw`UPDATE "Store" SET "cover" = ${coverUrl || null} WHERE "tenantId" = ${tenantId}`;
}

/**
 * Upsert de storeThemeJson en el modelo Settings de Prisma.
 * Usado cuando el body solo contiene `storeTheme` (path rápido del StoreCustomizer).
 * Devuelve void — el caller debe invalidar caché después.
 */
export async function upsertStoreThemeJson(
  tenantId: string,
  mergedTheme: Record<string, unknown>,
): Promise<void> {
  await prisma.settings.upsert({
    where: { tenantId },
    create: { tenantId, storeThemeJson: JSON.stringify(mergedTheme) },
    update: { storeThemeJson: JSON.stringify(mergedTheme) },
  });
}
