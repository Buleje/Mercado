import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

/**
 * EmployeeInvitations — wrapper raw-SQL para la tabla EmployeeInvitation
 * (no está en schema.prisma; creada vía scripts/add-employee-invitations.ts).
 *
 * Reglas:
 *   - Métodos del admin reciben tenantId 1er param y lo aplican en el WHERE.
 *   - Métodos públicos (token-lookup) NO requieren tenantId — el token es
 *     el isolator (único + 48 chars hex).
 *   - .acceptAndCreateAdminUser() corre en TX para garantizar atomicidad.
 */

export interface InvitationRow {
  id: string;
  tenantId: string;
  phone: string;
  name: string;
  role: string;
  token: string;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export const EmployeeInvitationsDb = {
  async listByTenant(tenantId: string, limit = 100): Promise<InvitationRow[]> {
    return prisma.$queryRawUnsafe<InvitationRow[]>(
      `SELECT * FROM "EmployeeInvitation" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT ${Number(limit) || 100}`,
      tenantId,
    );
  },

  async create(args: {
    id: string;
    tenantId: string;
    phone: string;
    name: string;
    role: string;
    token: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeInvitation" ("id","tenantId","phone","name","role","token","status","expiresAt","createdBy") VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)`,
      args.id, args.tenantId, args.phone, args.name, args.role, args.token,
      args.expiresAt, args.createdBy,
    );
  },

  async revoke(id: string, tenantId: string): Promise<number> {
    return prisma.$executeRawUnsafe(
      `UPDATE "EmployeeInvitation" SET "status"='revoked' WHERE "id"=$1 AND "tenantId"=$2 AND "status"='pending'`,
      id, tenantId,
    );
  },

  async findByToken(token: string): Promise<InvitationRow | null> {
    const rows = await prisma.$queryRawUnsafe<InvitationRow[]>(
      `SELECT * FROM "EmployeeInvitation" WHERE "token"=$1 LIMIT 1`, token,
    );
    return rows[0] ?? null;
  },

  async markExpired(id: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "EmployeeInvitation" SET "status"='expired' WHERE "id"=$1`, id,
    );
  },

  async usernameExists(tenantId: string, username: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "AdminUser" WHERE "tenantId"=$1 AND "username"=$2 LIMIT 1`,
      tenantId, username,
    );
    return rows.length > 0;
  },

  /**
   * Acepta una invitación creando AdminUser + marcando accepted en TX.
   * Devuelve `{ tenantId }` o lanza si la TX falla.
   */
  async acceptAndCreateAdminUser(args: {
    invitationId: string;
    tenantId: string;
    name: string;
    role: string;
    username: string;
    password: string;
  }): Promise<{ tenantId: string }> {
    const passwordHash = await hash(args.password, 10);
    const adminUserId = `usr_${randomBytes(12).toString("hex")}`;
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `INSERT INTO "AdminUser" ("id","username","tenantId","passwordHash","role","name","active","createdAt","updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
        adminUserId, args.username, args.tenantId, passwordHash, args.role, args.name,
      ),
      prisma.$executeRawUnsafe(
        `UPDATE "EmployeeInvitation" SET "status"='accepted', "acceptedAt"=NOW() WHERE "id"=$1`,
        args.invitationId,
      ),
    ]);
    return { tenantId: args.tenantId };
  },
};
