/**
 * lib/db/admin-totp.db.ts
 *
 * DB class para operaciones TOTP sobre AdminUser y SuperadminUser.
 *
 * El Prisma client generado no incluye aún los campos totpSecret/totpEnabledAt
 * (el cliente debe regenerarse tras ADR-048). Mientras tanto usamos
 * $queryRawUnsafe / $executeRawUnsafe con parámetros posicionales ($1 $2 $3)
 * para cumplir la regla CLAUDE.md #11 (sin string interpolation).
 *
 * Una vez regenerado el cliente (npx prisma generate), estos métodos pueden
 * migrarse a prisma.adminUser.update / prisma.superadminUser.update normales.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Tipos de retorno ──────────────────────────────────────────────────────────

export interface AdminTotpRow {
  id: string;
  username: string;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
}

export interface SuperadminTotpRow {
  id: string;
  username: string;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
}

// ── AdminUser TOTP ────────────────────────────────────────────────────────────

export const AdminTotpDB = {
  /**
   * Obtiene los campos TOTP del AdminUser identificado por username + tenantId.
   * Devuelve null si no existe.
   */
  async getByUsername(
    tenantId: string,
    username: string,
  ): Promise<AdminTotpRow | null> {
    const rows = await prisma.$queryRawUnsafe<AdminTotpRow[]>(
      `SELECT id, username, "totpSecret", "totpEnabledAt"
       FROM "AdminUser"
       WHERE "tenantId" = $1
         AND username = $2
       LIMIT 1`,
      tenantId,
      username,
    );
    return rows[0] ?? null;
  },

  /**
   * Guarda el secret TOTP pendiente de verificación para un AdminUser.
   * No activa 2FA (totpEnabledAt sigue null).
   */
  async saveSecret(
    tenantId: string,
    username: string,
    secret: string,
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser"
       SET "totpSecret" = $1, "updatedAt" = NOW()
       WHERE "tenantId" = $2
         AND username = $3`,
      secret,
      tenantId,
      username,
    );
  },

  /**
   * Activa 2FA para el AdminUser: setea totpEnabledAt = NOW().
   * Solo llamar después de verificar el primer token con éxito.
   */
  async activate(tenantId: string, username: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser"
       SET "totpEnabledAt" = NOW(), "updatedAt" = NOW()
       WHERE "tenantId" = $1
         AND username = $2`,
      tenantId,
      username,
    );
  },
} as const;

// ── SuperadminUser TOTP ───────────────────────────────────────────────────────

export const SuperadminTotpDB = {
  /**
   * Obtiene (o crea) el SuperadminUser identificado por username.
   * Si no existe en DB devuelve null — el endpoint de enroll debe crear el row
   * o el seed debe haberlo creado previamente.
   */
  async getByUsername(username: string): Promise<SuperadminTotpRow | null> {
    const rows = await prisma.$queryRawUnsafe<SuperadminTotpRow[]>(
      `SELECT id, username, "totpSecret", "totpEnabledAt"
       FROM "SuperadminUser"
       WHERE username = $1
       LIMIT 1`,
      username,
    );
    return rows[0] ?? null;
  },

  /**
   * Guarda el secret TOTP pendiente de verificación para un SuperadminUser.
   * No activa 2FA todavía.
   */
  async saveSecret(username: string, secret: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "SuperadminUser"
       SET "totpSecret" = $1, "updatedAt" = NOW()
       WHERE username = $2`,
      secret,
      username,
    );
  },

  /**
   * Activa 2FA para el SuperadminUser: setea totpEnabledAt = NOW().
   */
  async activate(username: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "SuperadminUser"
       SET "totpEnabledAt" = NOW(), "updatedAt" = NOW()
       WHERE username = $1`,
      username,
    );
  },
} as const;
