import "server-only";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "@/lib/db/settings.db";
import { ROLES_REVISADOS } from "@/lib/forestal/revision-proveedores";
import type { EstadoVigilante } from "@/lib/forestal/vigilante-proveedores";

/**
 * ForestVigilanteDB — la memoria del vigilante mensual de proveedores
 * (`lib/forestal/vigilante-proveedores.ts`). Sin migración: «lo que vio la vez
 * anterior» vive en `Settings.featureFlagsJson[CLAVE_VIGILANTE]`, igual que los
 * chats de Telegram o las marcas revisadas. Se pisa SOLO esa clave, en una
 * sentencia (`pisarClavesFlags`), así no le borra nada a nadie.
 */

export const CLAVE_VIGILANTE = "vigilante_proveedores";

const estadoSchema = z.object({
  v: z.literal(1),
  revisadoEn: z.string().min(10),
  corteSerfor: z.string().nullable(),
  claves: z.array(z.string()).max(5000),
});

function leerEstado(raw: string | null | undefined): EstadoVigilante | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const leido = estadoSchema.safeParse((obj as Record<string, unknown>)[CLAVE_VIGILANTE]);
    return leido.success ? leido.data : null;
  } catch {
    return null;
  }
}

export const ForestVigilanteDB = {
  /**
   * Los negocios con alguien que revisar: una ficha activa con papel de
   * proveedor/cliente/transportista… o un permiso activo. Cruza negocios a
   * propósito (lo usa SOLO el cron, como `ForestCtpRespaldoDB.tenantsConLibro`).
   */
  async tenantsConProveedores(): Promise<string[]> {
    const [partes, permisos] = await Promise.all([
      prisma.forestParty.findMany({
        where: { deletedAt: null, activo: true, roles: { hasSome: [...ROLES_REVISADOS] } },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.forestContrato.findMany({
        where: { deletedAt: null, isActive: true },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
    ]);
    return [...new Set([...partes, ...permisos].map((r) => r.tenantId))].sort();
  },

  async estado(tenantId: string): Promise<EstadoVigilante | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.settings.findUnique({ where: { tenantId }, select: { featureFlagsJson: true } });
    return leerEstado(row?.featureFlagsJson);
  },

  async guardar(tenantId: string, estado: EstadoVigilante): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await SettingsDB.pisarClavesFlags(tenantId, { [CLAVE_VIGILANTE]: estado });
  },
};
