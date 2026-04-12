/**
 * lib/db/tenant-onboarding.db.ts
 *
 * Capa de acceso a datos para el onboarding automático de tenants.
 * Sigue el patrón establecido en lib/db/: server-only, prisma encapsulado,
 * tenantId obligatorio en todas las operaciones post-creación.
 *
 * Exporta tres funciones atómicas usadas por el Route Handler de onboarding:
 *   - createTenant        → crea Tenant + Store en una transacción
 *   - createAdminUser     → crea AdminUser + Settings (necesita tenantId)
 *   - seedTenantDefaults  → categorías default + datos iniciales por plantilla
 *   - findTenantBySlug    → lookup de unicidad antes de crear
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { logger } from "@/lib/logger";
import { getTemplateCategories } from "@/lib/store-templates";
import type { TemplateId } from "@/lib/store-templates";

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface CreateTenantInput {
  slug: string;
  storeName: string;
  ownerEmail: string;
  ownerPhone?: string;
  plan: "free" | "pro" | "business" | "enterprise";
  type: "store" | "supplier" | "delivery";
  trialEndsAt: Date;
}

export interface CreateAdminUserInput {
  tenantId: string;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
  businessName: string;
}

export interface SeedDefaultsInput {
  tenantId: string;
  template?: TemplateId | string;
  type: "store" | "supplier" | "delivery";
  slug: string;
  storeName: string;
  ownerEmail: string;
  ownerPhone?: string;
  adminName: string;
}

export interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
  type: string;
  trialEndsAt: Date | null;
}

// ─── Funciones públicas ──────────────────────────────────────────────────────

/**
 * Busca un tenant por slug. Devuelve null si no existe.
 * Usado para verificar unicidad antes de crear.
 */
export async function findTenantBySlug(slug: string): Promise<{ id: string } | null> {
  return prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
}

/**
 * Crea el Tenant y su Store vacío en una sola transacción.
 * Para type=supplier o delivery, la Store se omite — esos casos
 * tienen sus propios seeders en seedTenantDefaults.
 *
 * @returns El tenant creado con los campos mínimos necesarios para continuar.
 */
export async function createTenant(input: CreateTenantInput): Promise<CreatedTenant> {
  const { slug, storeName, ownerEmail, ownerPhone, plan, type, trialEndsAt } = input;

  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        slug,
        name: storeName,
        plan,
        type,
        active: true,
        ownerEmail,
        ownerPhone: ownerPhone ?? null,
        trialEndsAt,
      },
    });

    // Solo los tenants tipo "store" crean una Store inmediatamente.
    // Supplier y delivery tienen flujos distintos (seedTenantDefaults los maneja).
    if (type === "store") {
      await tx.store.create({
        data: {
          tenantId: t.id,
          slug,
          name: storeName,
          isPublished: false,
        },
      });
    }

    return t;
  });

  logger.info("[tenant-onboarding] Tenant creado", {
    tenantId: tenant.id,
    slug,
    plan,
    type,
  });

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    plan: tenant.plan,
    type: tenant.type,
    trialEndsAt: tenant.trialEndsAt,
  };
}

/**
 * Crea el AdminUser + Settings iniciales del tenant en una transacción.
 * Debe llamarse DESPUÉS de createTenant, con el tenantId real (CUID).
 *
 * @param input.tenantId  — ID canónico del tenant (CUID, NO el slug)
 */
export async function createAdminUser(input: CreateAdminUserInput): Promise<void> {
  const { tenantId, adminName, adminUsername, adminPassword, businessName } = input;

  const passwordHash = await hash(adminPassword, 12);

  await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        tenantId,
        username: adminUsername,
        passwordHash,
        role: "admin",
        name: adminName,
        active: true,
      },
    }),
    prisma.settings.create({
      data: {
        tenantId,
        businessName,
        mode: "checkout",
        cashEnabled: true,
        yapeEnabled: false,
      },
    }),
  ]);

  logger.info("[tenant-onboarding] Admin user y settings creados", {
    tenantId,
    adminUsername,
  });
}

/**
 * Ejecuta el seed de datos iniciales según el tipo de tenant y la plantilla elegida.
 * Todas las operaciones son best-effort: si alguna falla, se loguea pero no bloquea.
 *
 * Incluye:
 *   - Categorías de productos (desde plantilla o defaults)
 *   - Supplier + SupplierPortal para type=supplier
 *   - DeliveryPartner para type=delivery
 *   - Store para type=supplier (draft)
 */
export async function seedTenantDefaults(input: SeedDefaultsInput): Promise<void> {
  const { tenantId, template, type, slug, storeName, ownerEmail, ownerPhone, adminName } = input;

  // ── 1. Seed categorías desde plantilla ──────────────────────────────────────
  if (template) {
    const categories = getTemplateCategories(template);
    if (categories.length > 0) {
      prisma.settings
        .update({
          where: { tenantId },
          data: { productCategoriesJson: JSON.stringify(categories) },
        })
        .catch((err) => {
          logger.warn("[tenant-onboarding] seedTenantDefaults: fallo al guardar categorías", {
            tenantId,
            template,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  // ── 2. Seeds por tipo de actor ───────────────────────────────────────────────
  if (type === "supplier") {
    try {
      const supplier = await prisma.supplier.create({
        data: {
          id: slug,
          name: storeName,
          email: ownerEmail,
          phone: ownerPhone ?? null,
          tenantId,
        },
      });

      await prisma.$transaction([
        prisma.supplierPortal.create({
          data: {
            supplierId: supplier.id,
            isActive: true,
            autoPublish: true,
          },
        }),
        prisma.store.create({
          data: {
            tenantId,
            slug,
            name: storeName,
            isPublished: false,
          },
        }),
      ]);

      logger.info("[tenant-onboarding] Supplier + portal + store creados", {
        tenantId,
        supplierId: supplier.id,
      });
    } catch (err) {
      logger.error("[tenant-onboarding] seedTenantDefaults: fallo en seed supplier", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (type === "delivery") {
    try {
      await prisma.deliveryPartner.create({
        data: {
          name: adminName,
          phone: ownerPhone ?? "",
          email: ownerEmail,
          zone: "",
          tenantId,
        },
      });

      logger.info("[tenant-onboarding] DeliveryPartner creado", { tenantId });
    } catch (err) {
      logger.error("[tenant-onboarding] seedTenantDefaults: fallo en seed delivery", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // type === "store": la Store ya fue creada en createTenant — nada extra aquí
}
