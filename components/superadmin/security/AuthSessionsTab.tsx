"use client";

/**
 * AuthSessionsTab — Sesiones activas (derivadas) + 2FA + login chart.
 *
 * Datos REALES desde:
 *  - GET /api/superadmin/security/sessions  (sesiones derivadas del audit log)
 *  - GET /api/superadmin/security/posture   (TOTP coverage + chart 7d)
 *
 * Disclaimer honesto: las sesiones del superadmin son JWT stateless. La lista
 * que se ve aquí es una APROXIMACIÓN derivada del audit log (último login_success
 * sin logout posterior). Para invalidación efectiva, el botón "Forzar logout
 * global" rota el corte de issuedAt — sirve para incidentes pero cierra todas
 * las sesiones de golpe.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Lock,
  Key,
  ShieldCheck,
  Smartphone,
  Monitor,
  AlertTriangle,
  Loader2,
  LogOut,
  Info,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  user: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeen: string;
  isCurrent: boolean;
}

interface PostureData {
  totpCoverage: {
    enrolled: number;
    total: number;
    admins: Array<{ username: string; totpEnabled: boolean; lastLoginAt: string | null }>;
  };
  loginSeries7d: Array<{ day: string; failed: number; succeeded: number; iso: string }>;
}

const PASSWORD_POLICY = {
  minLength: 12,
  expirationDays: 90,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
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

function deviceFromUA(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Desconocido", isMobile: false };
  const isMobile = /mobile|android|ios|iphone|ipad/i.test(ua);
  // Extracción simple: Browser / OS
  const browser = /Chrome\/[\d.]+/.exec(ua)?.[0]
    ?? /Safari\/[\d.]+/.exec(ua)?.[0]
    ?? /Firefox\/[\d.]+/.exec(ua)?.[0]
    ?? "Browser";
  return { label: browser.split("/")[0] + (isMobile ? " mobile" : ""), isMobile };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuthSessionsTab() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [posture, setPosture] = useState<PostureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "success" | "warning"; title: string; description?: string } | null
  >(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/api/superadmin/security/sessions", { credentials: "include" }),
        fetch("/api/superadmin/security/posture", { credentials: "include" }),
      ]);
      if (!sRes.ok || !pRes.ok) throw new Error(`HTTP ${sRes.status}/${pRes.status}`);
      const sData = (await sRes.json()) as { data: { sessions: SessionRow[] } };
      const pData = (await pRes.json()) as { data: PostureData };
      setSessions(sData.data.sessions);
      setPosture(pData.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-sessions-refresh", handler);
    return () => window.removeEventListener("security-sessions-refresh", handler);
  }, [reload]);

  const totpStatus = posture?.totpCoverage.admins ?? [];
  const series = useMemo(() => posture?.loginSeries7d ?? [], [posture]);
  const totalFailures = useMemo(() => series.reduce((acc, p) => acc + p.failed, 0), [series]);
  const totalSuccess = useMemo(() => series.reduce((acc, p) => acc + p.succeeded, 0), [series]);

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      const res = await fetch("/api/superadmin/security/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setFeedback({
        kind: "warning",
        title: "Logout global disparado",
        description: "Todas las sesiones (incluyendo la tuya) serán invalidadas en su próximo request. Vas a tener que volver a entrar.",
      });
      setRevokeOpen(false);
      // El server invalida la sesión actual → la próxima request fallará. Recargar
      // sesiones para que se vea el efecto (se pueden vaciar antes de la expulsión).
      void reload();
    } catch (e) {
      setFeedback({
        kind: "warning",
        title: "Error al revocar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedback?.kind === "success" && (
        <SuccessAlert title={feedback.title} description={feedback.description} />
      )}
      {feedback?.kind === "warning" && (
        <WarningAlert title={feedback.title} description={feedback.description} />
      )}

      {/* Disclaimer honesto sobre la limitación del modelo de sesiones */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-[var(--text-tertiary)] mt-0.5 shrink-0" aria-hidden />
        <div className="flex-1">
          <BodyText className="font-medium">Cómo se calculan estas sesiones</BodyText>
          <Caption className="text-[var(--text-tertiary)]">
            Las sesiones del superadmin son JWT stateless (sin tabla persistente). La lista de abajo se deriva del audit log:
            último login exitoso sin logout posterior por usuario, ventana de 8h. Para invalidación efectiva ante incidente,
            usá <strong>Forzar logout global</strong> a la derecha — corta todas las sesiones a la vez.
          </Caption>
        </div>
        <button
          type="button"
          onClick={() => setRevokeOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-error-500)] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
        >
          <LogOut className="h-3.5 w-3.5" />
          Forzar logout global
        </button>
      </div>

      <AdminSection
        title="Sesiones activas"
        description={`${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"} en la ventana de 8 horas`}
      >
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-[var(--text-tertiary)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando sesiones…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-4 flex items-start gap-2 text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Dispositivo</th>
                <th>IP</th>
                <th>Iniciada</th>
                <th className="text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const dev = deviceFromUA(s.userAgent);
                const DeviceIcon = dev.isMobile ? Smartphone : Monitor;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--text-primary)]">{s.user}</span>
                        {s.isCurrent && (
                          <Caption className="text-[var(--accent)]">Sesión actual</Caption>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <DeviceIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
                        {dev.label}
                      </span>
                    </td>
                    <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      {s.ip ?? "—"}
                    </td>
                    <td className="text-[var(--text-secondary)]">{fmtRelative(s.startedAt)}</td>
                    <td className="text-right">
                      <BadgeStatus
                        variant={s.isCurrent ? "info" : "success"}
                        label={s.isCurrent ? "Tú" : "Activa"}
                        size="sm"
                        dot
                      />
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Caption className="block py-6 text-center text-[var(--text-tertiary)]">
                      No hay sesiones activas en las últimas 8 horas
                    </Caption>
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        )}
      </AdminSection>

      <AdminGrid cols={2} gap={4}>
        <AdminSection
          title="TOTP 2FA"
          description="Estado del segundo factor por usuario superadmin"
        >
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            {totpStatus.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Caption className="text-[var(--text-tertiary)]">Sin superadmins registrados</Caption>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)]">
                {totpStatus.map((u) => (
                  <li key={u.username} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 rounded-lg bg-[var(--surface-sunken)] p-2">
                        <Key className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <BodyText className="font-medium truncate">{u.username}</BodyText>
                        <Caption className="text-[var(--text-tertiary)]">
                          {u.lastLoginAt ? `Último login ${fmtRelative(u.lastLoginAt)}` : "Sin logins registrados"}
                        </Caption>
                      </div>
                    </div>
                    <BadgeStatus
                      variant={u.totpEnabled ? "success" : "warning"}
                      label={u.totpEnabled ? "Habilitado" : "Pendiente"}
                      size="sm"
                      dot
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AdminSection>

        <AdminSection
          title="Login failures — últimos 7 días"
          description={`${totalFailures} fallidos de ${totalFailures + totalSuccess} intentos`}
        >
          <LoginFailuresChart series={series} />
        </AdminSection>
      </AdminGrid>

      <AdminSection
        title="Política de contraseñas"
        description="Reglas vigentes aplicadas a todos los usuarios admin"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <AdminGrid cols={4} gap={4}>
            <PolicyField icon={Lock} label="Longitud mínima" value={`${PASSWORD_POLICY.minLength} caracteres`} />
            <PolicyField icon={Key} label="Complejidad" value="Mayúsc + minúsc + número + símbolo" />
            <PolicyField icon={ShieldCheck} label="Expiración" value={`${PASSWORD_POLICY.expirationDays} días`} />
            <PolicyField
              icon={Lock}
              label="Lockout"
              value={`${PASSWORD_POLICY.lockoutAttempts} intentos → ${PASSWORD_POLICY.lockoutMinutes} min`}
            />
          </AdminGrid>
        </div>
      </AdminSection>

      {/* Confirm dialog para "Forzar logout global" */}
      <AlertDialog.Root open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--data-error-500)]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
              </div>
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                  ¿Forzar logout global?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-[var(--text-secondary)] mt-1">
                  Esto invalida <strong>todas las sesiones</strong> de superadmin emitidas hasta ahora,
                  <strong> incluyendo la tuya</strong>. Vas a tener que volver a iniciar sesión inmediatamente.
                </AlertDialog.Description>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  Usalo ante un incidente de seguridad sospechoso (cookie filtrado, equipo robado, etc.).
                  La acción queda registrada en el audit log.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <AlertDialog.Cancel asChild>
                <button
                  disabled={revoking}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </AlertDialog.Cancel>
              <button
                onClick={(e) => { e.preventDefault(); void handleRevokeAll(); }}
                disabled={revoking}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-[var(--data-error-500)] hover:brightness-110 text-white disabled:opacity-50"
              >
                {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sí, cerrar todas
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function PolicyField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Lock;
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

function LoginFailuresChart({ series }: { series: Array<{ day: string; failed: number; succeeded: number }> }) {
  const w = 100;
  const h = 50;
  const maxFailed = Math.max(...series.map((d) => d.failed), 1);
  const step = series.length > 0 ? w / series.length : 0;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-end justify-between gap-2">
        <CardTitle>Intentos fallidos por día</CardTitle>
        <Caption className="text-[var(--text-tertiary)]">Pico: {maxFailed} en un día</Caption>
      </div>
      {series.length === 0 ? (
        <div className="mt-4 h-32 flex items-center justify-center">
          <Caption className="text-[var(--text-tertiary)]">Sin datos en la ventana</Caption>
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${w} ${h + 8}`} preserveAspectRatio="none" className="mt-4 h-32 w-full" aria-hidden>
            {series.map((d, i) => {
              const x = i * step + step * 0.2;
              const barW = step * 0.6;
              const barH = (d.failed / maxFailed) * h;
              const y = h - barH;
              return (
                <rect
                  key={`${d.day}-${i}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, 0.5)}
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
          <div className="mt-2 grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)` }}>
            {series.map((d, i) => (
              <Caption key={`${d.day}-${i}`} className="text-[var(--text-tertiary)]">
                {d.day}
              </Caption>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
