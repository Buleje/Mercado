/**
 * #58 Audit trail superadmin dedicado — lib/audit/superadmin-audit.ts
 *
 * Registra y consulta acciones del panel superadmin en ActivityLog,
 * usando entity="superadmin.audit" y tenantId="main" para aislarlo
 * de los logs de tenants.
 *
 * Uso:
 *   import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
 *   logSuperadminAction("impersonate", "tenant X", { targetTenantId: "..." }, "admin-user").catch(() => {});
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Constantes ────────────────────────────────────────────────────────────────

/** Identificador de entidad para auditoría exclusiva del panel superadmin. */
const SUPERADMIN_ENTITY = "superadmin.audit";

/**
 * tenantId especial para registros de plataforma (no pertenecen a ningún tenant).
 * Usamos "main" consistentemente con la convención de lib/activity-logger.ts.
 */
const PLATFORM_TENANT_ID = "main";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface SuperadminAuditEntry {
  id: string;
  action: string;
  detail: string;
  user: string;
  createdAt: string;
}

// ─── Write — fire-and-forget ───────────────────────────────────────────────────

/**
 * Registra una acción del superadmin en ActivityLog.
 * Fire-and-forget: el caller debe hacer `.catch(() => {})` para no bloquear.
 *
 * @param action   - Tipo de acción (ej: "login", "impersonate", "purge-tenant")
 * @param detail   - Descripción legible de la acción
 * @param metadata - Datos adicionales serializados como JSON en entityId
 * @param userId   - Username del operador superadmin (default: "superadmin")
 */
export async function logSuperadminAction(
  action: string,
  detail: string,
  metadata?: Record<string, unknown>,
  userId = "superadmin",
): Promise<void> {
  try {
    logger.info("[superadmin-audit]", { action, detail, userId });
    await prisma.activityLog.create({
      data: {
        action,
        entity: SUPERADMIN_ENTITY,
        entityId: metadata ? JSON.stringify(metadata) : undefined,
        detail,
        user: userId,
        tenantId: PLATFORM_TENANT_ID,
      },
    });
  } catch (err) {
    // Non-critical: nunca dejar que el log rompa el flujo principal
    logger.warn("[superadmin-audit] Error al escribir log:", {
      error: (err as Error).message,
    });
  }
}

// ─── Read ──────────────────────────────────────────────────────────────────────

/**
 * Consulta los registros de auditoría superadmin más recientes.
 *
 * @param limit - Número máximo de registros (default 100)
 * @param from  - Filtrar registros creados desde esta fecha (opcional)
 */
export async function getSuperadminAuditLog(
  limit = 100,
  from?: Date,
): Promise<SuperadminAuditEntry[]> {
  const rows = await prisma.activityLog.findMany({
    where: {
      entity: SUPERADMIN_ENTITY,
      tenantId: PLATFORM_TENANT_ID,
      ...(from ? { createdAt: { gte: from } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500), // techo de seguridad
    select: {
      id: true,
      action: true,
      detail: true,
      user: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    user: r.user,
    createdAt: r.createdAt.toISOString(),
  }));
}
