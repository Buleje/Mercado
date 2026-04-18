"use client";

/**
 * OverviewTab — Vista consolidada del Security Center.
 *
 * 4 KPIs hero (Vulnerabilidades, Login fallidos 24h, IPs bloqueadas,
 * Sesiones activas) + timeline de los últimos 10 eventos de seguridad.
 */

import { useMemo } from "react";
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
import {
  SECURITY_EVENTS_TIMELINE,
  type SecurityEventSeverity,
  severityToBadgeVariant,
  SEVERITY_LABEL,
  fmtRelative,
} from "@/lib/mocks/security-events.mock";
import { ACTIVE_SESSIONS } from "@/lib/mocks/active-sessions.mock";
import { CVE_LIST } from "@/lib/mocks/cve-list.mock";

/**
 * Mapea severidad a ícono neutro (sin color, se combina con Badge).
 * Motivación: el ícono comunica tipo, no urgencia — el Badge comunica urgencia.
 */
const SEVERITY_ICON: Record<SecurityEventSeverity, LucideIcon> = {
  critical: ShieldAlert,
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
  info: Shield,
};

export function OverviewTab() {
  const {
    criticalCount,
    failedLogins24h,
    blockedIps,
    activeSessionsCount,
  } = useMemo(() => {
    const critical = CVE_LIST.filter(
      (c) => (c.severity === "critical" || c.severity === "high") && c.status !== "patched",
    ).length;
    const failed = 6; // agregado últimos 24h según LOGIN_FAILURES_7D
    const blocked = 1; // IPs bloqueadas por lockout activo
    const sessions = ACTIVE_SESSIONS.length;
    return {
      criticalCount: critical,
      failedLogins24h: failed,
      blockedIps: blocked,
      activeSessionsCount: sessions,
    };
  }, []);

  return (
    <div className="space-y-6">
      <AdminGrid cols={4} gap={4}>
        <StatCard
          icon={ShieldAlert}
          label="Vulnerabilidades"
          value={criticalCount}
          subValue={`${CVE_LIST.length} total detectadas`}
          emphasis={criticalCount > 0 ? "warning" : "neutral"}
          density="comfortable"
        />
        <StatCard
          icon={Lock}
          label="Login fallidos 24h"
          value={failedLogins24h}
          subValue="Ventana últimas 24 horas"
          emphasis={failedLogins24h > 10 ? "warning" : "neutral"}
          density="comfortable"
        />
        <StatCard
          icon={Ban}
          label="IPs bloqueadas"
          value={blockedIps}
          subValue="Lockout activo (15 min)"
          density="comfortable"
        />
        <StatCard
          icon={Users}
          label="Sesiones activas"
          value={activeSessionsCount}
          subValue="Todos los tenants"
          density="comfortable"
        />
      </AdminGrid>

      <AdminSection
        title="Eventos recientes"
        description="Últimos 10 eventos de seguridad en toda la plataforma"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {SECURITY_EVENTS_TIMELINE.map((ev) => {
              const Icon = SEVERITY_ICON[ev.severity];
              const badgeVariant = severityToBadgeVariant(ev.severity);
              return (
                <li
                  key={ev.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--surface-sunken)] p-1.5">
                    <Icon
                      className="h-4 w-4 text-[var(--text-secondary)]"
                      aria-hidden
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BodyText className="font-medium">{ev.title}</BodyText>
                      <BadgeStatus
                        variant={badgeVariant}
                        label={SEVERITY_LABEL[ev.severity]}
                        size="sm"
                      />
                    </div>
                    <Caption className="mt-0.5 block text-[var(--text-tertiary)]">
                      {ev.detail} — {ev.user}
                      {ev.ip && (
                        <>
                          {" "}
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3 w-3" aria-hidden />
                            {ev.ip}
                          </span>
                        </>
                      )}
                    </Caption>
                  </div>
                  <time className="shrink-0 whitespace-nowrap text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {fmtRelative(ev.timestamp)}
                  </time>
                </li>
              );
            })}
          </ul>
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
            status="ok"
            detail="2 de 3 superadmin enrolados"
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
            <Icon
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden
            />
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
