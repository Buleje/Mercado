/**
 * lib/tenant-module-overrides.ts — override de módulos del panel admin POR TENANT.
 *
 * Feynman: la plantilla global (/superadmin/plantilla) es "el menú para todos
 * los clientes". Este override es "la dieta especial de UN cliente": el
 * superadmin elige módulos específicos para un tenant y eso PISA la plantilla.
 * Si el tenant no tiene override → come del menú normal según su plan
 * (business = todos, pro = los suyos, etc. — el plan sigue siendo el techo).
 *
 * Persistencia: PlatformSetting key `admin-template:tenant:<tenantId>` —
 * cero cambios de schema. Solo se overridea `visible` (label/plan/orden
 * siguen siendo de la plantilla global).
 *
 * Editado desde /superadmin/tenants (vista lista → columna Módulos).
 * Consumido por GET /api/platform/admin-template (merge server-side).
 */

import type { AdminTemplate } from "@/lib/admin-template";

export interface TenantModuleOverrides {
  /** tabId → visible forzado. Solo módulos con override explícito. */
  overrides: Record<string, { visible: boolean }>;
  version: number;
}

export const TENANT_OVERRIDE_KEY_PREFIX = "admin-template:tenant:";
export const TENANT_OVERRIDE_SCHEMA_VERSION = 1;

export function tenantOverrideKey(tenantId: string): string {
  return `${TENANT_OVERRIDE_KEY_PREFIX}${tenantId}`;
}

/** Mergea el override per-tenant (solo visible) sobre la plantilla global. */
export function mergeTenantOverrides(
  global: AdminTemplate,
  perTenant: TenantModuleOverrides | null | undefined,
): AdminTemplate {
  if (!perTenant || Object.keys(perTenant.overrides ?? {}).length === 0) return global;
  const merged = { ...global.overrides };
  for (const [id, ov] of Object.entries(perTenant.overrides)) {
    if (typeof ov?.visible === "boolean") {
      merged[id] = { ...merged[id], visible: ov.visible };
    }
  }
  return { ...global, overrides: merged };
}
