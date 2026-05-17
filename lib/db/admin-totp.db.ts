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
import { encryptTotpSecret, decryptTotpSecret } from "@/lib/crypto/totp-cipher";

// ── Tipos de retorno ──────────────────────────────────────────────────────────

export interface AdminTotpRow {
  id: string;
  username: string;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpLastUsedStep: number | null;
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
      `SELECT id, username, "totpSecret", "totpEnabledAt", "totpLastUsedStep"
       FROM "AdminUser"
       WHERE "tenantId" = $1
         AND username = $2
       LIMIT 1`,
      tenantId,
      username,
    );
    const row = rows[0];
    if (!row) return null;
    // Audit 2026-05-17 05-P1-5: descifrar TOTP secret al leer.
    // Compat: si está en texto plano (pre-cifrado), decryptTotpSecret
    // devuelve as-is — migración lazy en próximo saveSecret.
    if (row.totpSecret) {
      row.totpSecret = await decryptTotpSecret(row.totpSecret);
    }
    return row;
  },

  /**
   * Guarda el secret TOTP pendiente de verificación para un AdminUser.
   * No activa 2FA (totpEnabledAt sigue null).
   * Audit 2026-05-17 05-P1-5: cifra con AES-GCM antes de persistir.
   */
  async saveSecret(
    tenantId: string,
    username: string,
    secret: string,
  ): Promise<void> {
    const encrypted = await encryptTotpSecret(secret);
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser"
       SET "totpSecret" = $1, "updatedAt" = NOW()
       WHERE "tenantId" = $2
         AND username = $3`,
      encrypted,
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

  /**
   * SECURITY 2026-05-06 (pentest H002): persistir el último step TOTP usado
   * para rechazar replay del mismo código en su ventana de 60s.
   */
  async setLastUsedStep(
    tenantId: string,
    username: string,
    step: number,
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "AdminUser"
       SET "totpLastUsedStep" = $3, "updatedAt" = NOW()
       WHERE "tenantId" = $1
         AND username = $2`,
      tenantId,
      username,
      step,
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
    const row = rows[0];
    if (!row) return null;
    // Audit 2026-05-17 05-P1-5: descifrar TOTP secret al leer.
    if (row.totpSecret) {
      row.totpSecret = await decryptTotpSecret(row.totpSecret);
    }
    return row;
  },

  /**
   * Guarda el secret TOTP pendiente de verificación para un SuperadminUser.
   * No activa 2FA todavía.
   * Audit 2026-05-17 05-P1-5: cifra con AES-GCM antes de persistir.
   */
  async saveSecret(username: string, secret: string): Promise<void> {
    const encrypted = await encryptTotpSecret(secret);
    await prisma.$executeRawUnsafe(
      `UPDATE "SuperadminUser"
       SET "totpSecret" = $1, "updatedAt" = NOW()
       WHERE username = $2`,
      encrypted,
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
