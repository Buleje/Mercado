"use client";

/**
 * OverviewTab — Vista consolidada del Security Center.
 *
 * 4 KPIs hero (Vulnerabilidades, Login fallidos 24h, IPs bloqueadas,
 * Sesiones activas) + timeline de los últimos 10 eventos de seguridad.
 *
 * Datos REALES desde:
 *  - GET /api/superadmin/security/posture (KPIs + TOTP coverage)
 *  - GET /api/superadmin/security?days=1   (eventos recientes del audit log)
 */

import { useEffect, useState, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  Users,
  Globe,
  Lock,
  Shield,
  AlertTriangle,
  Info,
  Loader2,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  AdminGrid,
  AdminSection,
  StatCard,
  BadgeStatus,
  BodyText,
  Caption,
} from "@buleje/design-system";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostureResponse {
  data: {
    vulnerabilities: { count: number; connected: boolean; scannerName: string | null };
    loginsFailed24h: number;
    ipsBlocked: number;
    activeSessions: number;
    totpCoverage: {
      enrolled: number;
      total: number;
      admins: Array<{ username: string; totpEnabled: boolean; lastLoginAt: string | null }>;
    };
    loginSeries7d: Array<{ day: string; failed: number; succeeded: number; iso: string }>;
    generatedAt: string;
  };
}

interface SecurityEventsResponse {
  data: {
    events: Array<{
      id: string;
      action: string;
      detail: string;
      ipAddress: string | null;
      createdAt: string;
    }>;
    summary: Record<string, number>;
    uniqueIPs: number;
    suspiciousIPs: Array<{ ip: string; failedAttempts: number }>;
  };
}

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  critical: ShieldAlert,
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
  info: Shield,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  info: "Info",
};

const SEVERITY_BADGE: Record<Severity, "info" | "warning" | "error" | "neutral"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "info",
  info: "neutral",
};

// Mapea action del audit log a severity + título legible.
const ACTION_META: Record<string, { severity: Severity; title: string }> = {
  login_success: { severity: "info", title: "Login exitoso" },
  login_failed: { severity: "medium", title: "Login fallido" },
  login_locked: { severity: "high", title: "IP bloqueada por lockout" },
  login_honeypot: { severity: "high", title: "Bot detectado (honeypot)" },
  "2fa_failed": { severity: "high", title: "2FA fallido" },
  "2fa_challenge": { severity: "info", title: "Desafío 2FA emitido" },
  logout: { severity: "info", title: "Logout" },
  sessions_revoked_all: { severity: "high", title: "Force logout global" },
};

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return `hace ${Math.round(diffH / 24)}d`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverviewTab() {
  const [posture, setPosture] = useState<PostureResponse["data"] | null>(null);
  const [events, setEvents] = useState<SecurityEventsResponse["data"]["events"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, eRes] = await Promise.all([
        fetch("/api/superadmin/security/posture", { credentials: "include" }),
        fetch("/api/superadmin/security?days=7", { credentials: "include" }),
      ]);
      if (!pRes.ok || !eRes.ok) throw new Error(`HTTP ${pRes.status}/${eRes.status}`);
      const pData = (await pRes.json()) as PostureResponse;
      const eData = (await eRes.json()) as SecurityEventsResponse;
      setPosture(pData.data);
      setEvents(eData.data.events.slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Listener para botón "Actualizar" del Hero (custom event).
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-overview-refresh", handler);
    return () => window.removeEventListener("security-overview-refresh", handler);
  }, [reload]);

  if (loading && !posture) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando estado de seguridad…
      </div>
    );
  }

  if (error && !posture) {
    return (
      <div role="alert" className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-4">
        <div className="flex items-start gap-2 text-[var(--data-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <BodyText className="font-semibold text-[var(--data-error)]">No se pudo cargar el panel</BodyText>
            <Caption className="text-[var(--data-error)]/80">{error}</Caption>
            <button onClick={reload} className="mt-2 text-xs font-bold underline">Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  if (!posture) return null;

  const totpStatus = posture.totpCoverage.total === 0
    ? "warning" as const
    : posture.totpCoverage.enrolled === posture.totpCoverage.total
      ? "ok" as const
      : "warning" as const;

  return (
    <div className="space-y-6">
      <AdminGrid cols={4} gap={4}>
        <StatCard
          icon={ShieldAlert}
          label="Vulnerabilidades"
          value={posture.vulnerabilities.connected ? posture.vulnerabilities.count : "—"}
          subValue={
            posture.vulnerabilities.connected
              ? `Escaneadas por ${posture.vulnerabilities.scannerName}`
              : "Sin escáner conectado"
          }
          emphasis={posture.vulnerabilities.count > 0 ? "warning" : "neutral"}
          density="comfortable"
        />
        <StatCard
          icon={Lock}
          label="Login fallidos 24h"
          value={posture.loginsFailed24h}
          subValue="Ventana últimas 24 horas"
          emphasis={posture.loginsFailed24h > 10 ? "warning" : "neutral"}
          density="comfortable"
        />
        <StatCard
          icon={Ban}
          label="IPs bloqueadas"
          value={posture.ipsBlocked}
          subValue="≥5 fails en 24h"
          density="comfortable"
        />
        <StatCard
          icon={Users}
          label="Sesiones activas"
          value={posture.activeSessions}
          subValue="Estimadas vía audit log"
          density="comfortable"
        />
      </AdminGrid>

      <AdminSection
        title="Eventos recientes"
        description={`Últimos ${events.length} eventos de seguridad en toda la plataforma`}
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {events.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Shield className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
              <BodyText className="font-semibold">Sin eventos en la ventana</BodyText>
              <Caption className="text-[var(--text-tertiary)]">
                No hubo logins, intentos fallidos ni cambios de configuración en los últimos 7 días.
              </Caption>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {events.map((ev) => {
                const meta = ACTION_META[ev.action] ?? { severity: "info" as Severity, title: ev.action };
                const Icon = SEVERITY_ICON[meta.severity];
                return (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--surface-sunken)] p-1.5">
                      <Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BodyText className="font-medium">{meta.title}</BodyText>
                        <BadgeStatus
                          variant={SEVERITY_BADGE[meta.severity]}
                          label={SEVERITY_LABEL[meta.severity]}
                          size="sm"
                        />
                      </div>
                      <Caption className="mt-0.5 block text-[var(--text-tertiary)]">
                        {ev.detail}
                        {ev.ipAddress && (
                          <>
                            {" "}
                            <span className="inline-flex items-center gap-1">
                              <Globe className="h-3 w-3" aria-hidden />
                              {ev.ipAddress}
                            </span>
                          </>
                        )}
                      </Caption>
                    </div>
                    <time className="shrink-0 whitespace-nowrap text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      {fmtRelative(ev.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AdminSection>

      <AdminSection
        title="Checks de postura"
        description="Estado agregado de controles críticos"
      >
        <AdminGrid cols={3} gap={4}>
          <PostureCard
            icon={ShieldCheck}
            label="TOTP 2FA"
            status={totpStatus}
            detail={
              posture.totpCoverage.total === 0
                ? "Sin superadmins activos"
                : `${posture.totpCoverage.enrolled} de ${posture.totpCoverage.total} superadmin${posture.totpCoverage.total === 1 ? "" : "s"} enrolado${posture.totpCoverage.enrolled === 1 ? "" : "s"}`
            }
          />
          <PostureCard
            icon={Lock}
            label="Lockout automático"
            status="ok"
            detail="5 intentos → 15 min bloqueo"
          />
          <PostureCard
            icon={Shield}
            label="Auditoría activa"
            status="ok"
            detail="Registro continuo de acciones"
          />
        </AdminGrid>
      </AdminSection>
    </div>
  );
}

function PostureCard({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}) {
  const badge =
    status === "ok"
      ? { variant: "success" as const, label: "Activo" }
      : status === "warning"
        ? { variant: "warning" as const, label: "Revisar" }
        : { variant: "error" as const, label: "Inactivo" };
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-[var(--surface-sunken)] p-2">
            <Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <BodyText className="font-semibold">{label}</BodyText>
            <Caption className="text-[var(--text-tertiary)]">{detail}</Caption>
          </div>
        </div>
        <BadgeStatus variant={badge.variant} label={badge.label} size="sm" dot />
      </div>
    </div>
  );
}
