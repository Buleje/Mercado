/**
 * lib/compliance/checklist-data.ts
 *
 * Catálogo único de controles de cumplimiento para el Security Center.
 * Antes vivía hardcoded en ComplianceTab.tsx — ahora server-side para que
 * el endpoint pueda enriquecer cada control con `lastCheckedAt`/`lastCheckedBy`
 * desde el audit log y permitir cambios sin redeploy del front.
 *
 * Tres normas cubiertas:
 *  - Ley 29733 (Perú) — Protección de datos personales
 *  - OWASP Top 10 (2021) — Web
 *  - OWASP API Security Top 10 (2023) — REST/GraphQL
 */

import "server-only";

export type ComplianceStatus = "pass" | "partial" | "fail" | "na";
export type ComplianceNorm = "ley-29733" | "owasp-web" | "owasp-api";
export type Severity = "high" | "medium" | "low" | "info";

export interface ChecklistItem {
  id: string;
  norm: ComplianceNorm;
  title: string;
  description: string;
  status: ComplianceStatus;
  severity: Severity;
  /** Referencia para el operador (artículo, URL, ADR). */
  reference?: string;
}

// ─── Ley 29733 (Perú) ────────────────────────────────────────────────────────

export const LEY_29733: ChecklistItem[] = [
  {
    id: "ley-13",
    norm: "ley-29733",
    title: "Art. 13 — Consentimiento informado",
    description: "El usuario acepta explícitamente el tratamiento de sus datos al registrarse.",
    status: "pass",
    severity: "high",
    reference: "Ley 29733 Art. 13",
  },
  {
    id: "ley-18",
    norm: "ley-29733",
    title: "Art. 18 — Derecho de acceso",
    description: "Exportación de datos por DNI disponible vía skill gdpr-export.",
    status: "pass",
    severity: "high",
    reference: "Ley 29733 Art. 18",
  },
  {
    id: "ley-20",
    norm: "ley-29733",
    title: "Art. 20 — Derecho de rectificación",
    description: "El cliente puede editar sus datos desde /cuenta/perfil.",
    status: "pass",
    severity: "medium",
    reference: "Ley 29733 Art. 20",
  },
  {
    id: "ley-21",
    norm: "ley-29733",
    title: "Art. 21 — Derecho de supresión",
    description: "Flujo de baja con retención legal de 5 años para facturación SUNAT.",
    status: "partial",
    severity: "high",
    reference: "Ley 29733 Art. 21",
  },
  {
    id: "ley-22",
    norm: "ley-29733",
    title: "Art. 22 — Datos sensibles",
    description:
      "Datos biométricos / salud / origen étnico requieren consentimiento explícito. Hoy no recolectamos ninguno (DNI/teléfono/email no son sensibles).",
    status: "pass",
    severity: "high",
    reference: "Ley 29733 Art. 22",
  },
  {
    id: "ley-24",
    norm: "ley-29733",
    title: "Art. 24 — Seguridad de la información",
    description:
      "Aislamiento multi-tenant + HTTPS forzado + audit log + bcrypt passwords + TOTP 2FA superadmin + CSRF P0/P1 cerrado.",
    status: "pass",
    severity: "high",
    reference: "Ley 29733 Art. 24",
  },
  {
    id: "ley-28",
    norm: "ley-29733",
    title: "Art. 28 — Flujo transfronterizo",
    description: "Hosting en Supabase (AWS US) — pendiente aviso previo para datos sensibles.",
    status: "partial",
    severity: "medium",
    reference: "Ley 29733 Art. 28",
  },
];

// ─── OWASP Top 10 Web (2021) ─────────────────────────────────────────────────

export const OWASP_TOP_10: ChecklistItem[] = [
  {
    id: "owasp-a01",
    norm: "owasp-web",
    title: "A01 — Broken Access Control",
    description:
      "RBAC con 6 roles y validación en middleware. requireAdmin() en routes protegidas.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A01:2021",
  },
  {
    id: "owasp-a02",
    norm: "owasp-web",
    title: "A02 — Cryptographic Failures",
    description:
      "AUTH_SECRET validado en startup. Passwords con bcrypt. TLS obligatorio en prod.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A02:2021",
  },
  {
    id: "owasp-a03",
    norm: "owasp-web",
    title: "A03 — Injection",
    description:
      "Prisma parametriza 100% de queries. Raw SQL sólo con $1/$2, nunca interpolation.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A03:2021",
  },
  {
    id: "owasp-a04",
    norm: "owasp-web",
    title: "A04 — Insecure Design",
    description: "ADRs documentados (68-75). Zona peligrosa marcada en CLAUDE.md.",
    status: "pass",
    severity: "medium",
    reference: "OWASP Top 10 A04:2021",
  },
  {
    id: "owasp-a05",
    norm: "owasp-web",
    title: "A05 — Security Misconfiguration",
    description:
      "CSP headers + rate limit + lockout 5 intentos. Env vars validadas al arranque.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A05:2021",
  },
  {
    id: "owasp-a06",
    norm: "owasp-web",
    title: "A06 — Vulnerable Components",
    description: "Scanner activo. 1 CVE medium pendiente (prisma 7.7 → 7.8).",
    status: "partial",
    severity: "medium",
    reference: "OWASP Top 10 A06:2021",
  },
  {
    id: "owasp-a07",
    norm: "owasp-web",
    title: "A07 — Identification & Auth Failures",
    description: "TOTP 2FA para superadmin. Lockout automático. Rotación JWT.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A07:2021",
  },
  {
    id: "owasp-a08",
    norm: "owasp-web",
    title: "A08 — Software & Data Integrity",
    description: "CI con lint + tsc + test + build. Dependency lockfile versionado.",
    status: "pass",
    severity: "medium",
    reference: "OWASP Top 10 A08:2021",
  },
  {
    id: "owasp-a09",
    norm: "owasp-web",
    title: "A09 — Logging & Monitoring",
    description: "Audit log exhaustivo. Sentry integrado. SLO dashboard activo.",
    status: "pass",
    severity: "high",
    reference: "OWASP Top 10 A09:2021",
  },
  {
    id: "owasp-a10",
    norm: "owasp-web",
    title: "A10 — Server-Side Request Forgery",
    description: "Endpoints externos pasan por whitelist configurado en lib/env.ts.",
    status: "partial",
    severity: "medium",
    reference: "OWASP Top 10 A10:2021",
  },
];

// ─── OWASP API Security Top 10 (2023) ────────────────────────────────────────

export const OWASP_API_TOP_10: ChecklistItem[] = [
  {
    id: "api-01",
    norm: "owasp-api",
    title: "API1 — Broken Object Level Authorization",
    description:
      "Todas las queries filtran por tenantId 1er param. DB classes en lib/db/*.db.ts garantizan aislamiento.",
    status: "pass",
    severity: "high",
    reference: "OWASP API Top 10 API1:2023",
  },
  {
    id: "api-02",
    norm: "owasp-api",
    title: "API2 — Broken Authentication",
    description:
      "JWT firmados con HMAC-SHA256, sesión 8h hard cap + 30min idle. TOTP en superadmin.",
    status: "pass",
    severity: "high",
    reference: "OWASP API Top 10 API2:2023",
  },
  {
    id: "api-03",
    norm: "owasp-api",
    title: "API3 — Broken Object Property Level Auth",
    description:
      "Zod safeParse en todos los endpoints — sólo campos permitidos pasan al ORM.",
    status: "pass",
    severity: "high",
    reference: "OWASP API Top 10 API3:2023",
  },
  {
    id: "api-04",
    norm: "owasp-api",
    title: "API4 — Unrestricted Resource Consumption",
    description:
      "Rate-limit STRICT / GENEROUS por endpoint. lib/rate-limit con tiers.",
    status: "pass",
    severity: "medium",
    reference: "OWASP API Top 10 API4:2023",
  },
  {
    id: "api-05",
    norm: "owasp-api",
    title: "API5 — Broken Function Level Authorization",
    description:
      "requireAdmin(req, roles[]) en routes protegidas. Superadmin path separado con cookie distinta.",
    status: "pass",
    severity: "high",
    reference: "OWASP API Top 10 API5:2023",
  },
  {
    id: "api-06",
    norm: "owasp-api",
    title: "API6 — Unrestricted Access to Business Flows",
    description:
      "Endpoints destructivos (purge/impersonate) requieren CSRF + TOTP + cooldown 60s.",
    status: "pass",
    severity: "high",
    reference: "OWASP API Top 10 API6:2023",
  },
  {
    id: "api-07",
    norm: "owasp-api",
    title: "API7 — Server Side Request Forgery",
    description: "Whitelist de hosts externos en lib/env.ts. WhatsApp y SUNAT validados.",
    status: "partial",
    severity: "medium",
    reference: "OWASP API Top 10 API7:2023",
  },
  {
    id: "api-08",
    norm: "owasp-api",
    title: "API8 — Security Misconfiguration",
    description:
      "Headers no-store + nosniff via secureJson(). CORS restrictivo. CSP estricto.",
    status: "partial",
    severity: "medium",
    reference: "OWASP API Top 10 API8:2023",
  },
  {
    id: "api-09",
    norm: "owasp-api",
    title: "API9 — Improper Inventory Management",
    description:
      "OpenAPI generado en /api-docs. 158 endpoints listados. Versiones marcadas en path.",
    status: "partial",
    severity: "low",
    reference: "OWASP API Top 10 API9:2023",
  },
  {
    id: "api-10",
    norm: "owasp-api",
    title: "API10 — Unsafe Consumption of APIs",
    description:
      "RENIEC/SUNAT/Stripe responses validados con Zod antes de persistir.",
    status: "pass",
    severity: "medium",
    reference: "OWASP API Top 10 API10:2023",
  },
];

// ─── Retention rules (estática — política interna) ───────────────────────────

export const RETENTION_RULES = [
  { type: "Datos de cuenta", period: "Mientras la cuenta esté activa + 1 año" },
  { type: "Órdenes y facturas", period: "5 años (obligación SUNAT)" },
  { type: "Audit log", period: "2 años" },
  { type: "Logs de seguridad", period: "1 año" },
  { type: "Backups", period: "35 días rotativos" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAllControls(): ChecklistItem[] {
  return [...LEY_29733, ...OWASP_TOP_10, ...OWASP_API_TOP_10];
}

export interface ChecklistStats {
  total: number;
  pass: number;
  partial: number;
  fail: number;
  na: number;
  percentage: number;
  highSeverityFails: number;
}

export function computeStats(items: ChecklistItem[]): ChecklistStats {
  const total = items.length;
  const pass = items.filter((i) => i.status === "pass").length;
  const partial = items.filter((i) => i.status === "partial").length;
  const fail = items.filter((i) => i.status === "fail").length;
  const na = items.filter((i) => i.status === "na").length;
  const highSeverityFails = items.filter(
    (i) => i.severity === "high" && (i.status === "fail" || i.status === "partial"),
  ).length;
  return {
    total,
    pass,
    partial,
    fail,
    na,
    percentage: total > 0 ? Math.round((pass / total) * 100) : 0,
    highSeverityFails,
  };
}
