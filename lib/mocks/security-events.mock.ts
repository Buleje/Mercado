/**
 * Mock dataset para el Security Center del superadmin.
 *
 * Eventos deterministas de seguridad (login, 2FA, rotaciones, alertas)
 * usados en la vista Overview y AuditLog del Security Center.
 *
 * TODO (ADR futuro): reemplazar con:
 *   - GET /api/superadmin/security/events?window=7d
 *   - GET /api/superadmin/security/audit-log?resource=X&user=Y&action=Z
 */

export type SecurityEventSeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityEventCategory =
  | "auth"
  | "secrets"
  | "tenant"
  | "config"
  | "access"
  | "compliance";

export interface SecurityEvent {
  id: string;
  category: SecurityEventCategory;
  severity: SecurityEventSeverity;
  title: string;
  detail: string;
  user: string;
  ip: string | null;
  timestamp: string; // ISO
}

function relativeISO(daysAgo: number, hoursAgo = 0, minutesAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString();
}

// ── Timeline overview (últimos 10 eventos de seguridad) ─────────────────────
export const SECURITY_EVENTS_TIMELINE: SecurityEvent[] = [
  {
    id: "evt-001",
    category: "auth",
    severity: "info",
    title: "Login exitoso",
    detail: "Acceso al panel superadmin desde Lima, PE",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(0, 2),
  },
  {
    id: "evt-002",
    category: "auth",
    severity: "medium",
    title: "Intentos fallidos detectados",
    detail: "2 intentos fallidos de login consecutivos",
    user: "desconocido",
    ip: "190.232.45.201",
    timestamp: relativeISO(0, 4),
  },
  {
    id: "evt-003",
    category: "tenant",
    severity: "info",
    title: "Nuevo tenant aprobado",
    detail: "Aplicación de vendor vendor-123 aprobada y activada",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(1, 3),
  },
  {
    id: "evt-004",
    category: "auth",
    severity: "info",
    title: "TOTP 2FA validado",
    detail: "Segundo factor verificado correctamente",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(1, 5),
  },
  {
    id: "evt-005",
    category: "access",
    severity: "low",
    title: "Impersonación iniciada",
    detail: "Sesión de soporte abierta para tenant bodega-el-trebol",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(2, 1),
  },
  {
    id: "evt-006",
    category: "config",
    severity: "medium",
    title: "Cambio de rol aplicado",
    detail: "Usuario admin@bodegarosita.pe pasó de cajero a admin",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(3, 6),
  },
  {
    id: "evt-007",
    category: "auth",
    severity: "high",
    title: "IP bloqueada por lockout",
    detail: "5 intentos fallidos → bloqueo automático por 15 minutos",
    user: "desconocido",
    ip: "45.77.122.33",
    timestamp: relativeISO(5, 2),
  },
  {
    id: "evt-008",
    category: "secrets",
    severity: "info",
    title: "Rotación de CRON_SECRET",
    detail: "Secret rotado exitosamente durante ventana programada",
    user: "automation",
    ip: null,
    timestamp: relativeISO(30, 0),
  },
  {
    id: "evt-009",
    category: "compliance",
    severity: "info",
    title: "Export de datos cumplimiento",
    detail: "Export generado por solicitud Ley 29733 Art. 18",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(12, 4),
  },
  {
    id: "evt-010",
    category: "config",
    severity: "low",
    title: "Policy actualizada",
    detail: "Password policy modificada: min 12 caracteres, expiración 90d",
    user: "platform@buleje.pe",
    ip: "190.232.14.88",
    timestamp: relativeISO(14, 3),
  },
];

// ── Login failures (últimos 7 días para chart) ──────────────────────────────
export interface LoginFailurePoint {
  day: string; // label corto
  failed: number;
  succeeded: number;
}

export const LOGIN_FAILURES_7D: LoginFailurePoint[] = [
  { day: "Vie", failed: 2, succeeded: 48 },
  { day: "Sáb", failed: 1, succeeded: 32 },
  { day: "Dom", failed: 0, succeeded: 28 },
  { day: "Lun", failed: 3, succeeded: 54 },
  { day: "Mar", failed: 7, succeeded: 41 },
  { day: "Mié", failed: 4, succeeded: 46 },
  { day: "Jue", failed: 2, succeeded: 52 },
];

// ── Audit log completo (para AuditLogTab) ───────────────────────────────────
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  detail: string;
  ip: string;
}

export const AUDIT_LOG_ENTRIES: AuditLogEntry[] = [
  {
    id: "audit-001",
    timestamp: relativeISO(0, 1),
    user: "platform@buleje.pe",
    action: "read",
    resource: "security",
    detail: "Consulta de panel de seguridad",
    ip: "190.232.14.88",
  },
  {
    id: "audit-002",
    timestamp: relativeISO(0, 2, 15),
    user: "platform@buleje.pe",
    action: "login",
    resource: "superadmin-session",
    detail: "Inicio de sesión con TOTP",
    ip: "190.232.14.88",
  },
  {
    id: "audit-003",
    timestamp: relativeISO(0, 3),
    user: "platform@buleje.pe",
    action: "update",
    resource: "tenant",
    detail: "Plan de bodega-el-trebol cambiado a business",
    ip: "190.232.14.88",
  },
  {
    id: "audit-004",
    timestamp: relativeISO(0, 5),
    user: "platform@buleje.pe",
    action: "write",
    resource: "vendor-application",
    detail: "Aprobación de aplicación vendor-123",
    ip: "190.232.14.88",
  },
  {
    id: "audit-005",
    timestamp: relativeISO(1, 0),
    user: "platform@buleje.pe",
    action: "impersonate",
    resource: "tenant",
    detail: "Sesión de soporte abierta para bodega-rosita",
    ip: "190.232.14.88",
  },
  {
    id: "audit-006",
    timestamp: relativeISO(1, 4),
    user: "platform@buleje.pe",
    action: "update",
    resource: "admin-user",
    detail: "Rol modificado: user-423 → admin",
    ip: "190.232.14.88",
  },
  {
    id: "audit-007",
    timestamp: relativeISO(2, 2),
    user: "automation",
    action: "rotate",
    resource: "secrets",
    detail: "Rotación programada CRON_SECRET",
    ip: "10.0.0.1",
  },
  {
    id: "audit-008",
    timestamp: relativeISO(2, 6),
    user: "platform@buleje.pe",
    action: "read",
    resource: "activity-log",
    detail: "Export CSV últimos 30d",
    ip: "190.232.14.88",
  },
  {
    id: "audit-009",
    timestamp: relativeISO(3, 1),
    user: "platform@buleje.pe",
    action: "delete",
    resource: "tenant",
    detail: "Suspensión permanente de tenant test-demo",
    ip: "190.232.14.88",
  },
  {
    id: "audit-010",
    timestamp: relativeISO(3, 7),
    user: "platform@buleje.pe",
    action: "write",
    resource: "security-policy",
    detail: "Password policy actualizada (min 12 chars)",
    ip: "190.232.14.88",
  },
];

// ── Helpers de presentación ─────────────────────────────────────────────────

export function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60_000));
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD}d`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Mapea severidad a BadgeStatus variant del design system.
 */
export function severityToBadgeVariant(
  s: SecurityEventSeverity,
): "info" | "warning" | "error" | "success" | "neutral" {
  switch (s) {
    case "critical":
      return "error";
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "info";
    case "info":
      return "neutral";
  }
}

export const SEVERITY_LABEL: Record<SecurityEventSeverity, string> = {
  info: "Info",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const CATEGORY_LABEL: Record<SecurityEventCategory, string> = {
  auth: "Autenticación",
  secrets: "Secretos",
  tenant: "Tenants",
  config: "Configuración",
  access: "Acceso",
  compliance: "Cumplimiento",
};
