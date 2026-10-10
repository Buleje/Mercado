/**
 * lib/db/admin-preferences.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de app/api/admin/preferences/route.ts.
 * Antes: prisma.settings directo en el route handler.
 * Ahora: clase canónica con guard cross-tenant + tenantId primer argumento.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "@/lib/db/settings.db";

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
   * Hace merge del patch sobre "admin_prefs" en featureFlagsJson, en UNA
   * sentencia (`SettingsDB.pisarSubclavesFlags`): leer-mezclar-escribir el JSON
   * entero desde Node pisaba lo que otro guardó en el medio (webhooks, n8n, el
   * enlace del kiosko de asistencia — security 10-10 H3).
   * Guard: el WHERE va por tenantId — solo afecta el settings row del tenant dado.
   */
  async write(tenantId: string, patch: Record<string, unknown>): Promise<void> {
    await SettingsDB.pisarSubclavesFlags(tenantId, "admin_prefs", patch);
  },
};
