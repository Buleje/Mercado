/**
 * Mock dataset: sesiones activas del Security Center.
 *
 * Representa sesiones vivas de usuarios superadmin y admin tenant
 * para el tab "Auth & Sesiones".
 *
 * TODO (ADR futuro): reemplazar con:
 *   - GET /api/superadmin/security/sessions?status=active
 *   - POST /api/superadmin/security/sessions/revoke { sessionId }
 */

export type SessionRole = "superadmin" | "admin" | "cajero" | "almacenero" | "vendor";

export interface ActiveSession {
  id: string;
  user: string;
  role: SessionRole;
  tenant: string | null;
  ip: string;
  userAgent: string;
  device: string; // extraído del UA para display compacto
  location: string;
  loginAt: string; // ISO
  lastActivityAt: string; // ISO
  /** Esta sesión es la del viewer actual (no se puede revocar) */
  current?: boolean;
}

function relativeISO(minutesAgo: number, hoursAgo = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString();
}

export const ACTIVE_SESSIONS: ActiveSession[] = [
  {
    id: "sess-001",
    user: "platform@buleje.pe",
    role: "superadmin",
    tenant: null,
    ip: "190.232.14.88",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0",
    device: "Chrome — Windows 11",
    location: "Lima, PE",
    loginAt: relativeISO(0, 2),
    lastActivityAt: relativeISO(3),
    current: true,
  },
  {
    id: "sess-002",
    user: "qaadmin@buleje.pe",
    role: "admin",
    tenant: "main",
    ip: "190.238.98.12",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari",
    device: "Safari Mobile — iOS",
    location: "Pucallpa, PE",
    loginAt: relativeISO(15),
    lastActivityAt: relativeISO(2),
  },
  {
    id: "sess-003",
    user: "admin@bodegarosita.pe",
    role: "admin",
    tenant: "bodega-rosita",
    ip: "200.48.221.5",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Firefox/121",
    device: "Firefox — macOS",
    location: "Lima, PE",
    loginAt: relativeISO(0, 1),
    lastActivityAt: relativeISO(8),
  },
  {
    id: "sess-004",
    user: "cajero1@bodega-san-martin.pe",
    role: "cajero",
    tenant: "bodega-san-martin",
    ip: "190.232.180.44",
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128",
    device: "Chrome Mobile — Android",
    location: "Pucallpa, PE",
    loginAt: relativeISO(35),
    lastActivityAt: relativeISO(12),
  },
  {
    id: "sess-005",
    user: "almacenero@bodega-el-trebol.pe",
    role: "almacenero",
    tenant: "bodega-el-trebol",
    ip: "190.232.180.87",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Edge/128",
    device: "Edge — Windows 10",
    location: "Pucallpa, PE",
    loginAt: relativeISO(0, 3),
    lastActivityAt: relativeISO(45),
  },
];

// ── 2FA / TOTP status por superadmin user ──────────────────────────────────
export interface TotpStatus {
  user: string;
  enabled: boolean;
  enrolledAt: string | null;
  lastUsedAt: string | null;
  method: "TOTP" | "SMS" | null;
}

export const TOTP_STATUS_MOCK: TotpStatus[] = [
  {
    user: "platform@buleje.pe",
    enabled: true,
    enrolledAt: "2025-11-15T14:00:00.000Z",
    lastUsedAt: relativeISO(0, 2),
    method: "TOTP",
  },
  {
    user: "soporte@buleje.pe",
    enabled: true,
    enrolledAt: "2025-12-03T09:30:00.000Z",
    lastUsedAt: relativeISO(0, 18),
    method: "TOTP",
  },
  {
    user: "ops@buleje.pe",
    enabled: false,
    enrolledAt: null,
    lastUsedAt: null,
    method: null,
  },
];

// ── Password policy ─────────────────────────────────────────────────────────
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  expirationDays: number;
  historyDepth: number;
  lockoutAttempts: number;
  lockoutMinutes: number;
}

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  expirationDays: 90,
  historyDepth: 5,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
};
