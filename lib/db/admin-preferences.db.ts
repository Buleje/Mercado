/**
 * lib/db/admin-preferences.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de app/api/admin/preferences/route.ts.
 * Antes: prisma.settings directo en el route handler.
 * Ahora: clase canónica con guard cross-tenant + tenantId primer argumento.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export const AdminPreferencesDB = {
  /**
   * Lee el bloque "admin_prefs" del featureFlagsJson del tenant.
   * Guard: la query filtra por tenantId — nunca expone settings de otro tenant.
   */
  async read(tenantId: string): Promise<Record<string, unknown>> {
    const row = await prisma.settings.findFirst({
      where: { tenantId },
      select: { featureFlagsJson: true },
    });
    if (!row?.featureFlagsJson) return {};
    try {
      const flags = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
      const prefs = flags["admin_prefs"];
      return typeof prefs === "object" && prefs !== null
        ? (prefs as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  },

  /**
   * Hace merge del patch sobre "admin_prefs" en featureFlagsJson.
   * Guard: upsert by tenantId — solo afecta el settings row del tenant dado.
   */
  async write(tenantId: string, patch: Record<string, unknown>): Promise<void> {
    const row = await prisma.settings.findFirst({
      where: { tenantId },
      select: { featureFlagsJson: true },
    });

    let flags: Record<string, unknown> = {};
    if (row?.featureFlagsJson) {
      try {
        flags = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
      } catch {
        /* JSON corrupto — se sobreescribe limpio */
      }
    }

    const existing =
      typeof flags["admin_prefs"] === "object" && flags["admin_prefs"] !== null
        ? (flags["admin_prefs"] as Record<string, unknown>)
        : {};
    flags["admin_prefs"] = { ...existing, ...patch };

    await prisma.settings.upsert({
      where: { tenantId },
      create: { tenantId, featureFlagsJson: JSON.stringify(flags) },
      update: { featureFlagsJson: JSON.stringify(flags) },
    });
  },
};
