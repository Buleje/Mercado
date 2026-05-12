"use client";

/**
 * AuthSessionsTab — Sesiones activas + 2FA + login chart + política.
 *
 * Mejoras 2026-05-11:
 *  - Stat row hero (Sesiones / Fallos 7d / Éxitos 7d / Cobertura TOTP)
 *  - Chart con Y-axis labels + hover tooltip por barra
 *  - Cards consistentes con el resto del Security Center (rounded-2xl, accent icons)
 *  - Acción destructiva "Forzar logout" con confirm dialog
 *
 * Disclaimer honesto: las sesiones del superadmin son JWT stateless. La lista
 * de abajo se deriva del audit log (último login_success sin logout posterior).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
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
  Users,
  CheckCircle2,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Types ──────────────────────────────────────────────────────────────

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
  const browser =
    /Chrome\/[\d.]+/.exec(ua)?.[0] ??
    /Safari\/[\d.]+/.exec(ua)?.[0] ??
    /Firefox\/[\d.]+/.exec(ua)?.[0] ??
    "Browser";
  return { label: browser.split("/")[0] + (isMobile ? " mobile" : ""), isMobile };
}

// ─── Component ──────────────────────────────────────────────────────────

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

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-sessions-refresh", handler);
    return () => window.removeEventListener("security-sessions-refresh", handler);
  }, [reload]);

  const totpAdmins = posture?.totpCoverage.admins ?? [];
  const series = useMemo(() => posture?.loginSeries7d ?? [], [posture]);
  const totalFailures = useMemo(() => series.reduce((acc, p) => acc + p.failed, 0), [series]);
  const totalSuccess = useMemo(() => series.reduce((acc, p) => acc + p.succeeded, 0), [series]);
  const totpPct = posture
    ? posture.totpCoverage.total === 0
      ? 0
      : Math.round((posture.totpCoverage.enrolled / posture.totpCoverage.total) * 100)
    : 0;
  const successRate =
    totalFailures + totalSuccess === 0
      ? 100
      : Math.round((totalSuccess / (totalFailures + totalSuccess)) * 100);

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      const res = await fetch("/api/superadmin/security/sessions/revoke", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        description:
          "Todas las sesiones (incluida la tuya) serán invalidadas en su próximo request.",
      });
      setRevokeOpen(false);
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
      {/* Feedback alert */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
            feedback.kind === "success"
              ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]"
              : "border-amber-300/60 bg-amber-50/40 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
          }`}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-display text-sm font-extrabold">{feedback.title}</p>
            {feedback.description && (
              <p className="text-xs opacity-90 mt-0.5">{feedback.description}</p>
            )}
          </div>
        </div>
      )}

      {/* ─── KPIs row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi
          icon={Users}
          label="Sesiones"
          value={sessions.length}
          subtitle="Ventana 8h"
          tone="accent"
        />
        <MiniKpi
          icon={CheckCircle2}
          label="Éxitos 7d"
          value={totalSuccess}
          subtitle={`${successRate}% tasa éxito`}
          tone="success"
        />
        <MiniKpi
          icon={AlertTriangle}
          label="Fallos 7d"
          value={totalFailures}
          subtitle={totalFailures > 10 ? "Sobre el umbral" : "Dentro del umbral"}
          tone={totalFailures > 10 ? "warning" : "neutral"}
        />
        <MiniKpi
          icon={ShieldCheck}
          label="TOTP 2FA"
          value={`${totpPct}%`}
          subtitle={`${posture?.totpCoverage.enrolled ?? 0} de ${posture?.totpCoverage.total ?? 0}`}
          tone={totpPct === 100 ? "success" : totpPct >= 50 ? "warning" : "danger"}
        />
      </div>

      {/* ─── Disclaimer + Force logout ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
          <Info className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
            Cómo se calculan estas sesiones
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Las sesiones del superadmin son JWT stateless (sin tabla persistente). La lista se
            deriva del audit log: último login exitoso sin logout posterior por usuario, ventana
            de 8h. Para invalidación efectiva ante incidente, usá{" "}
            <strong className="text-[var(--text-primary)]">Forzar logout global</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRevokeOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-md/20 transition hover:bg-rose-700"
        >
          <LogOut className="h-4 w-4" strokeWidth={2.5} />
          Forzar logout
        </button>
      </div>

      {/* ─── Sesiones activas table ──────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Sesiones activas
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"} en la ventana de
                8 horas
              </p>
            </div>
          </div>
        </header>
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-[var(--text-tertiary)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando sesiones…
          </div>
        ) : error ? (
          <div
            role="alert"
            className="m-5 rounded-xl border border-rose-300/60 bg-rose-50/40 p-4 flex items-start gap-2 text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
              <Users className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
            </div>
            <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
              Sin sesiones activas
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              No hay logins exitosos sin logout en las últimas 8 horas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="px-5 py-3 font-extrabold">Usuario</th>
                  <th className="px-3 py-3 font-extrabold">Dispositivo</th>
                  <th className="px-3 py-3 font-extrabold">IP</th>
                  <th className="px-3 py-3 font-extrabold">Iniciada</th>
                  <th className="px-5 py-3 font-extrabold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {sessions.map((s) => {
                  const dev = deviceFromUA(s.userAgent);
                  const DeviceIcon = dev.isMobile ? Smartphone : Monitor;
                  return (
                    <tr key={s.id} className="transition hover:bg-[var(--surface-sunken)]/50">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--text-primary)]">{s.user}</span>
                          {s.isCurrent && (
                            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                              Sesión actual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <DeviceIcon
                            className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                            aria-hidden
                          />
                          {dev.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                        {s.ip ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        {fmtRelative(s.startedAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
                            s.isCurrent
                              ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              s.isCurrent ? "bg-[var(--accent)]" : "bg-[var(--data-success-500)]"
                            }`}
                          />
                          {s.isCurrent ? "Tú" : "Activa"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── TOTP coverage + Chart ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* TOTP per user */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Key className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                TOTP 2FA por superadmin
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Estado del segundo factor de autenticación
              </p>
            </div>
          </header>
          {totpAdmins.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[var(--text-tertiary)]">Sin superadmins registrados</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {totpAdmins.map((u) => (
                <li
                  key={u.username}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-[var(--surface-sunken)]/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                        u.totpEnabled
                          ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      }`}
                    >
                      <Key className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--text-primary)] truncate">
                        {u.username}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {u.lastLoginAt
                          ? `Último login ${fmtRelative(u.lastLoginAt)}`
                          : "Sin logins registrados"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
                      u.totpEnabled
                        ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        u.totpEnabled ? "bg-[var(--data-success-500)]" : "bg-amber-500"
                      }`}
                    />
                    {u.totpEnabled ? "Habilitado" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Chart */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Login failures — últimos 7 días
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {totalFailures} fallidos de {totalFailures + totalSuccess} intentos totales
              </p>
            </div>
          </header>
          <LoginFailuresChart series={series} />
        </section>
      </div>

      {/* ─── Política de contraseñas ─────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Política de contraseñas
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Reglas vigentes aplicadas a todos los usuarios admin
            </p>
          </div>
        </header>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[var(--rule-soft)]">
          <PolicyField
            icon={Lock}
            label="Longitud mínima"
            value={`${PASSWORD_POLICY.minLength}`}
            unit="caracteres"
          />
          <PolicyField icon={Key} label="Complejidad" value="A·a·1·#" unit="May/min/núm/sym" />
          <PolicyField
            icon={ShieldCheck}
            label="Expiración"
            value={`${PASSWORD_POLICY.expirationDays}`}
            unit="días"
          />
          <PolicyField
            icon={Lock}
            label="Lockout"
            value={`${PASSWORD_POLICY.lockoutAttempts}→${PASSWORD_POLICY.lockoutMinutes}m`}
            unit="intentos → min bloqueo"
          />
        </div>
      </section>

      {/* ─── Confirm dialog ──────────────────────────────────────── */}
      <AlertDialog.Root open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-[var(--shadow-xl)] p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
                  ¿Forzar logout global?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-[var(--text-secondary)] mt-1.5">
                  Esto invalida <strong>todas las sesiones</strong> de superadmin emitidas hasta
                  ahora, <strong>incluyendo la tuya</strong>. Vas a tener que volver a iniciar
                  sesión inmediatamente.
                </AlertDialog.Description>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  Usalo ante un incidente sospechoso (cookie filtrado, equipo robado, etc.). La
                  acción queda registrada en el audit log.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <AlertDialog.Cancel asChild>
                <button
                  disabled={revoking}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--rule-base)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </AlertDialog.Cancel>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  void handleRevokeAll();
                }}
                disabled={revoking}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-md/20 disabled:opacity-50"
              >
                {revoking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={2.5} />
                )}
                Sí, cerrar todas
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function MiniKpi({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle: string;
  tone: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-2.5 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
    </div>
  );
}

function PolicyField({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <Icon
          className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
          strokeWidth={1.75}
          aria-hidden
        />
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-display text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)]">{unit}</p>
    </div>
  );
}

function LoginFailuresChart({
  series,
}: {
  series: Array<{ day: string; failed: number; succeeded: number }>;
}) {
  const maxVal = Math.max(...series.map((d) => Math.max(d.failed, d.succeeded)), 1);

  if (series.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Sin datos en la ventana</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Bars */}
      <div className="flex items-end gap-2 h-40">
        {series.map((d, i) => {
          const failedH = (d.failed / maxVal) * 100;
          const successH = (d.succeeded / maxVal) * 100;
          return (
            <div
              key={`${d.day}-${i}`}
              className="flex-1 flex flex-col items-center gap-1 group"
            >
              <div className="relative w-full flex-1 flex items-end gap-1">
                {/* Success bar */}
                <div
                  className="flex-1 rounded-t-md bg-[var(--data-success-500)]/30 transition-all group-hover:bg-[var(--data-success-500)]/60"
                  style={{ height: `${successH}%` }}
                  title={`${d.succeeded} éxitos`}
                />
                {/* Failed bar */}
                <div
                  className={`flex-1 rounded-t-md transition-all ${
                    d.failed > 5
                      ? "bg-rose-500 group-hover:brightness-110"
                      : d.failed > 0
                        ? "bg-amber-500 group-hover:brightness-110"
                        : "bg-[var(--surface-sunken)]"
                  }`}
                  style={{ height: `${Math.max(failedH, d.failed > 0 ? 2 : 0)}%` }}
                  title={`${d.failed} fallidos`}
                />
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">{d.day}</p>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--rule-soft)]">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-[var(--data-success-500)]/30" />
          Éxitos
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-amber-500" />
          Fallidos (≤5)
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-rose-500" />
          Pico (&gt;5)
        </span>
      </div>
    </div>
  );
}
