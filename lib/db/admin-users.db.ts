import "server-only";

/**
 * lib/db/admin-users.db.ts
 *
 * Lookup helpers para AdminUser scoped por tenant. Centraliza el patron
 * `prisma.adminUser.findFirst({ where: { tenantId, username } })` que
 * antes estaba esparcido en multiples routes (turnos, close-shift, etc).
 *
 * Cumple regla critica #1 — los routes ya no usan prisma directo para
 * resolver el adminUserId del session payload.
 */

import { prisma } from "@/lib/prisma";

export const AdminUsersDB = {
  /**
   * Resuelve el AdminUser.id desde el username del session payload.
   * Devuelve `null` si no existe (puede pasar tras delete del usuario
   * mientras la sesion sigue activa).
   */
  async resolveIdByUsername(tenantId: string, username: string): Promise<string | null> {
    // eslint-disable-next-line no-restricted-properties -- helper centralizado escoped por tenantId+username; punto canonico de lookup desde session payload.
    const row = await prisma.adminUser.findFirst({
      where: { tenantId, username },
      select: { id: true },
    });
    return row?.id ?? null;
  },

  /**
   * Verifica que un adminUserId pertenezca al tenant y este activo.
   * Usado al validar que el manager esta abriendo turno para un cajero
   * existente del propio tenant (no de otro).
   */
  async verifyActiveInTenant(tenantId: string, adminUserId: string): Promise<boolean> {
    // eslint-disable-next-line no-restricted-properties -- helper centralizado scoped por tenantId+id+active.
    const row = await prisma.adminUser.findFirst({
      where: { tenantId, id: adminUserId, active: true },
      select: { id: true },
    });
    return row !== null;
  },

  /**
   * Devuelve passwordHash de un admin activo para re-auth (flujo 2FA enroll).
   * Solo expone el hash — el comparador bcrypt corre en el route.
   */
  async getPasswordHashForReauth(
    tenantId: string,
    username: string,
  ): Promise<{ passwordHash: string } | null> {
    // eslint-disable-next-line no-restricted-properties -- helper centralizado scoped por tenantId+username+active.
    const row = await prisma.adminUser.findFirst({
      where: { tenantId, username, active: true },
      select: { passwordHash: true },
    });
    return row;
  },

  /**
   * Lookup completo (id, name, role, active) por username. Usado por
   * dashboards que necesitan el nombre/rol del cajero, no solo su id.
   */
  async getByUsername(
    tenantId: string,
    username: string,
  ): Promise<{ id: string; name: string | null; role: string; active: boolean } | null> {
    // eslint-disable-next-line no-restricted-properties -- helper centralizado scoped por tenantId+username.
    const row = await prisma.adminUser.findFirst({
      where: { tenantId, username },
      select: { id: true, name: true, role: true, active: true },
    });
    return row;
  },
};
