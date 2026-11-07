import "server-only";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "@/lib/db/settings.db";

/**
 * MarcasRevisadasDB — las marcas de asistencia que el dueño ya miró y aprobó
 * («Marcas para revisar», `lib/rrhh/marcas-para-revisar.ts`). Sin migración:
 * viven en `Settings.featureFlagsJson[CLAVE]` como `{ <idMarca>: <ISO> }`.
 *
 * Corregir una marca crea una versión nueva con otro id, así que una
 * aprobación vieja nunca tapa un cambio posterior. `tenantId` 1.º y en el WHERE.
 */

export const CLAVE_MARCAS_REVISADAS = "rrhh_marcas_revisadas";

function leerIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    const sub = (obj as Record<string, unknown>)[CLAVE_MARCAS_REVISADAS];
    return sub && typeof sub === "object" && !Array.isArray(sub) ? Object.keys(sub) : [];
  } catch {
    return [];
  }
}

export const MarcasRevisadasDB = {
  async ids(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.settings.findUnique({ where: { tenantId }, select: { featureFlagsJson: true } });
    return leerIds(row?.featureFlagsJson);
  },

  /** Aprueba las marcas que SON de este negocio y siguen vivas; devuelve cuáles quedaron. */
  async aprobar(tenantId: string, ids: string[]): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const propias = await prisma.asistencia.findMany({ where: { tenantId, id: { in: ids }, deletedAt: null }, select: { id: true } });
    if (propias.length === 0) return [];
    const ahora = new Date().toISOString();
    await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_MARCAS_REVISADAS, Object.fromEntries(propias.map((p) => [p.id, ahora])));
    return propias.map((p) => p.id);
  },
};
