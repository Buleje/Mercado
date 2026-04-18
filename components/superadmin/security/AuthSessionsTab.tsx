"use client";

/**
 * AuthSessionsTab — Sesiones activas + 2FA + password policy + login chart.
 *
 * Muestra las sesiones vivas con acción "Revocar" (stub), el estado TOTP por
 * usuario superadmin, y un chart simple SVG de login failures 7d sin Recharts
 * para evitar overhead en el primer load del tab.
 */

import { useState, useMemo } from "react";
import {
  Lock,
  Key,
  ShieldCheck,
  Smartphone,
  Monitor,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  AdminGrid,
  AdminSection,
  BadgeStatus,
  BodyText,
  Caption,
  CardTitle,
  DataTable,
  Kicker,
  SuccessAlert,
  WarningAlert,
} from "@buleje/design-system";
import {
  ACTIVE_SESSIONS,
  type ActiveSession,
  type SessionRole,
  TOTP_STATUS_MOCK,
  PASSWORD_POLICY,
} from "@/lib/mocks/active-sessions.mock";
import { LOGIN_FAILURES_7D, fmtRelative } from "@/lib/mocks/security-events.mock";

const ROLE_LABEL: Record<SessionRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  cajero: "Cajero",
  almacenero: "Almacenero",
  vendor: "Vendor",
};

function deviceIcon(device: string): LucideIcon {
  return /mobile|android|ios|iphone/i.test(device) ? Smartphone : Monitor;
}

export function AuthSessionsTab() {
  const [feedback, setFeedback] = useState<
    { kind: "success" | "warning"; title: string; description?: string } | null
  >(null);
  const [revokedIds, setRevokedIds] = useState<Set<string>>(new Set());

  const liveSessions = useMemo(
    () => ACTIVE_SESSIONS.filter((s) => !revokedIds.has(s.id)),
    [revokedIds],
  );

  /**
   * TODO: reemplazar con POST /api/superadmin/security/sessions/revoke.
   * Por ahora es un stub que sólo marca la UI.
   */
  const handleRevoke = (session: ActiveSession) => {
    setRevokedIds((prev) => new Set(prev).add(session.id));
    setFeedback({
      kind: "success",
      title: "Sesión revocada (mock)",
      description: `La sesión de ${session.user} quedó marcada para cierre.`,
    });
  };

  const totalFailures = LOGIN_FAILURES_7D.reduce((acc, p) => acc + p.failed, 0);
  const totalSuccess = LOGIN_FAILURES_7D.reduce((acc, p) => acc + p.succeeded, 0);

  return (
    <div className="space-y-6">
      {feedback?.kind === "success" && (
        <SuccessAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}
      {feedback?.kind === "warning" && (
        <WarningAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}

      <AdminSection
        title="Sesiones activas"
        description="Sesiones vivas de usuarios superadmin y admin de tenants"
      >
        <DataTable>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Tenant</th>
              <th>Dispositivo</th>
              <th>IP</th>
              <th>Último acceso</th>
              <th className="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {liveSessions.map((s) => {
              const DeviceIcon = deviceIcon(s.device);
              return (
                <tr key={s.id}>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-medium text-[var(--text-primary)]">
                        {s.user}
                      </span>
                      <Caption className="text-[var(--text-tertiary)]">
                        {s.location}
                      </Caption>
                    </div>
                  </td>
                  <td>
                    <BadgeStatus
                      variant={s.role === "superadmin" ? "info" : "neutral"}
                      label={ROLE_LABEL[s.role]}
                      size="sm"
                    />
                  </td>
                  <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {s.tenant ?? "—"}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <DeviceIcon
                        className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                        aria-hidden
                      />
                      {s.device}
                    </span>
                  </td>
                  <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {s.ip}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {fmtRelative(s.lastActivityAt)}
                  </td>
                  <td className="text-right">
                    {s.current ? (
                      <Caption className="text-[var(--text-tertiary)]">
                        Sesión actual
                      </Caption>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRevoke(s)}
                        className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {liveSessions.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Caption className="block py-6 text-center text-[var(--text-tertiary)]">
                    No hay sesiones activas
                  </Caption>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </AdminSection>

      <AdminGrid cols={2} gap={4}>
        <AdminSection
          title="TOTP 2FA"
          description="Estado del segundo factor por usuario superadmin"
        >
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <ul className="divide-y divide-[var(--rule-soft)]">
              {TOTP_STATUS_MOCK.map((u) => (
                <li
                  key={u.user}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 rounded-lg bg-[var(--surface-sunken)] p-2">
                      <Key
                        className="h-4 w-4 text-[var(--text-secondary)]"
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0">
                      <BodyText className="font-medium truncate">
                        {u.user}
                      </BodyText>
                      <Caption className="text-[var(--text-tertiary)]">
                        {u.enabled && u.lastUsedAt
                          ? `Último uso ${fmtRelative(u.lastUsedAt)}`
                          : "Sin enrolar"}
                      </Caption>
                    </div>
                  </div>
                  <BadgeStatus
                    variant={u.enabled ? "success" : "warning"}
                    label={u.enabled ? "Habilitado" : "Pendiente"}
                    size="sm"
                    dot
                  />
                </li>
              ))}
            </ul>
          </div>
        </AdminSection>

        <AdminSection
          title="Login failures — últimos 7 días"
          description={`${totalFailures} fallidos de ${totalFailures + totalSuccess} intentos`}
        >
          <LoginFailuresChart />
        </AdminSection>
      </AdminGrid>

      <AdminSection
        title="Política de contraseñas"
        description="Reglas vigentes aplicadas a todos los usuarios admin"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <AdminGrid cols={4} gap={4}>
            <PolicyField
              icon={Lock}
              label="Longitud mínima"
              value={`${PASSWORD_POLICY.minLength} caracteres`}
            />
            <PolicyField
              icon={Key}
              label="Complejidad"
              value="Mayúsc + minúsc + número + símbolo"
            />
            <PolicyField
              icon={ShieldCheck}
              label="Expiración"
              value={`${PASSWORD_POLICY.expirationDays} días`}
            />
            <PolicyField
              icon={Lock}
              label="Lockout"
              value={`${PASSWORD_POLICY.lockoutAttempts} intentos → ${PASSWORD_POLICY.lockoutMinutes} min`}
            />
          </AdminGrid>
        </div>
      </AdminSection>
    </div>
  );
}

function PolicyField({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 rounded-lg bg-[var(--surface-sunken)] p-2">
        <Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
      </div>
      <div className="min-w-0">
        <Kicker>{label}</Kicker>
        <BodyText className="mt-0.5 font-medium">{value}</BodyText>
      </div>
    </div>
  );
}

// ── Chart SVG puro (sin Recharts) ────────────────────────────────────────────
function LoginFailuresChart() {
  const series = LOGIN_FAILURES_7D;
  const w = 100; // viewBox width
  const h = 50;
  const maxFailed = Math.max(...series.map((d) => d.failed), 1);
  const step = w / series.length;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-end justify-between gap-2">
        <CardTitle>Intentos fallidos por día</CardTitle>
        <Caption className="text-[var(--text-tertiary)]">
          Pico: {maxFailed} en un día
        </Caption>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h + 8}`}
        preserveAspectRatio="none"
        className="mt-4 h-32 w-full"
        aria-hidden
      >
        {series.map((d, i) => {
          const x = i * step + step * 0.2;
          const barW = step * 0.6;
          const barH = (d.failed / maxFailed) * h;
          const y = h - barH;
          return (
            <rect
              key={d.day}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={0.5}
              fill={
                d.failed === 0
                  ? "var(--surface-sunken)"
                  : d.failed > 5
                    ? "var(--data-warning)"
                    : "var(--text-tertiary)"
              }
            />
          );
        })}
      </svg>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {series.map((d) => (
          <Caption key={d.day} className="text-[var(--text-tertiary)]">
            {d.day}
          </Caption>
        ))}
      </div>
    </div>
  );
}
