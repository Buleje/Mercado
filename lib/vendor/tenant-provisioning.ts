import "server-only";

import { logger } from "@/lib/logger";
import type { VendorApplication } from "@/lib/generated/prisma/client";

/**
 * lib/vendor/tenant-provisioning.ts
 *
 * ADR-079 §2.4 — stub del hook `provisionTenant`.
 *
 * Cuando una VendorApplication pasa a `approved`, este hook es el
 * responsable de crear el Tenant real para que la bodega pueda entrar a
 * su admin. Crear un Tenant de verdad toca prisma/schema.prisma (131
 * modelos), seed de AdminUser, setup de StoreTheme, seed demo data, etc.
 *
 * Ese trabajo es PELIGROSO y requiere su propio ADR (ADR-080). Hasta
 * entonces, este stub:
 *
 *   1. Loggea un warning (con todos los datos necesarios para
 *      provisionar manualmente).
 *   2. Genera un id/slug con prefijo `stub-` para marcar claramente que
 *      el tenant NO existe todavia.
 *   3. Actualiza la aplicacion con esos valores y marca status como
 *      `tenant_provisioned` (loop simplificado: approved -> stub provisioned).
 *
 * Cuando ADR-080 aterrice, reemplazar `provisionTenantStub` por
 * `provisionTenantReal` en `VendorApplicationsDB.approve`.
 */

function genStubId(ruc: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `stub-${ruc}-${rand}`;
}

function genStubSlug(businessName: string): string {
  const base = businessName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 6);
  return `stub-${base || "bodega"}-${rand}`;
}

export interface ProvisionResult {
  tenantId: string;
  tenantSlug: string;
  isStub: true;
}

/**
 * Stub de provisioning. NO crea un Tenant real.
 *
 * Flujo esperado cuando ADR-080 reemplace este stub:
 *   - Crear Tenant con `prisma.tenant.create({ data: {...} })`
 *   - Crear AdminUser con password temporal
 *   - Enviar email con credenciales
 *   - Seed StorePage con defaults (primaryColor, logo placeholder)
 *   - Setup webhook Stripe (si plan=pro)
 *   - Log audit trail
 */
export async function provisionTenantStub(
  application: VendorApplication,
): Promise<ProvisionResult> {
  const tenantId = genStubId(application.ruc);
  const tenantSlug = genStubSlug(application.businessName);

  logger.warn("[vendor-provisioning] STUB — Tenant NOT created", {
    todo: "ADR-080 will replace this stub with real tenant creation",
    applicationId: application.id,
    businessName: application.businessName,
    ruc: application.ruc,
    plan: application.plan,
    contactEmail: application.contactEmail,
    stubTenantId: tenantId,
    stubTenantSlug: tenantSlug,
  });

  // Import tardio para evitar circular dependency con vendor-applications.db
  const { VendorApplicationsDB } = await import("@/lib/db/vendor-applications.db");

  try {
    await VendorApplicationsDB.markTenantProvisioned(
      application.id,
      tenantId,
      tenantSlug,
    );
  } catch (err) {
    // Si ya paso a tenant_provisioned o el status cambio, dejar warning.
    // No re-throw: fire-and-forget (CLAUDE.md #7).
    logger.warn("[vendor-provisioning] markTenantProvisioned skipped", {
      applicationId: application.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { tenantId, tenantSlug, isStub: true };
}
