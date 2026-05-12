"use client";

/**
 * OverviewTab — Vista consolidada del Security Center.
 *
 * Hero KPIs (4) + Eventos recientes (severity-colored) + Postura (TOTP barra)
 * + IPs sospechosas (extraído del endpoint, antes oculto).
 *
 * Datos REALES:
 *  - GET /api/superadmin/security/posture
 *  - GET /api/superadmin/security?days=7
 */

import { useEffect, useState, useCallback, useMemo } from "react";
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
  TrendingUp,
  CheckCircle2,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Types ──────────────────────────────────────────────────────────────

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

const SEVERITY_META: Record<
  Severity,
  { icon: LucideIcon; label: string; cls: string; dot: string }
> = {
  critical: {
    icon: ShieldAlert,
    label: "Crítica",
    cls: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  high: {
    icon: ShieldAlert,
    label: "Alta",
    cls: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  medium: {
    icon: AlertTriangle,
    label: "Media",
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  low: {
    icon: Info,
    label: "Baja",
    cls: "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  info: {
    icon: Shield,
    label: "Info",
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
};

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

// ─── Component ──────────────────────────────────────────────────────────

export function OverviewTab() {
  const [posture, setPosture] = useState<PostureResponse["data"] | null>(null);
  const [events, setEvents] = useState<SecurityEventsResponse["data"]["events"]>([]);
  const [suspiciousIPs, setSuspiciousIPs] = useState<
    SecurityEventsResponse["data"]["suspiciousIPs"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

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
      setEvents(eData.data.events.slice(0, 20));
      setSuspiciousIPs(eData.data.suspiciousIPs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Listener para botón "Actualizar" del Hero (custom event).
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-overview-refresh", handler);
    return () => window.removeEventListener("security-overview-refresh", handler);
  }, [reload]);

  const filteredEvents = useMemo(() => {
    if (severityFilter === "all") return events;
    return events.filter((ev) => {
      const sev = ACTION_META[ev.action]?.severity ?? "info";
      return sev === severityFilter;
    });
  }, [events, severityFilter]);

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
      <div
        role="alert"
        className="rounded-2xl border border-rose-300/60 bg-rose-50/40 p-5 dark:border-rose-700/40 dark:bg-rose-950/30"
      >
        <div className="flex items-start gap-3 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-display text-base font-extrabold">
              No se pudo cargar el panel
            </p>
            <p className="text-sm opacity-80 mt-0.5">{error}</p>
            <button
              onClick={reload}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-bold transition hover:bg-rose-100 dark:hover:bg-rose-900/40"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!posture) return null;

  const totpPct =
    posture.totpCoverage.total === 0
      ? 0
      : Math.round((posture.totpCoverage.enrolled / posture.totpCoverage.total) * 100);

  return (
    <div className="space-y-6">
      {/* ─── KPIs Hero (4 cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={ShieldAlert}
          label="Vulnerabilidades"
          value={posture.vulnerabilities.connected ? String(posture.vulnerabilities.count) : "—"}
          subtitle={
            posture.vulnerabilities.connected
              ? `Escáner: ${posture.vulnerabilities.scannerName}`
              : "Sin escáner conectado"
          }
          tone={posture.vulnerabilities.count > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          icon={Lock}
          label="Login fallidos 24h"
          value={String(posture.loginsFailed24h)}
          subtitle="Ventana últimas 24 horas"
          tone={posture.loginsFailed24h > 10 ? "warning" : "neutral"}
        />
        <KpiCard
          icon={Ban}
          label="IPs bloqueadas"
          value={String(posture.ipsBlocked)}
          subtitle="≥5 fails en 24h"
          tone={posture.ipsBlocked > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          icon={Users}
          label="Sesiones activas"
          value={String(posture.activeSessions)}
          subtitle="Estimadas vía audit log"
          tone="success"
        />
      </div>

      {/* ─── Eventos recientes + Postura side-by-side ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Eventos (col 2) */}
        <section className="lg:col-span-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                <Shield className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                  Eventos recientes
                </h3>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {filteredEvents.length} de {events.length} en los últimos 7 días
                </p>
              </div>
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
              className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="all">Todas las severidades</option>
              <option value="critical">Críticas</option>
              <option value="high">Altas</option>
              <option value="medium">Medias</option>
              <option value="low">Bajas</option>
              <option value="info">Info</option>
            </select>
          </header>
          {filteredEvents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                <Shield className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
              </div>
              <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
                Sin eventos en la ventana
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                No hubo actividad que coincida con el filtro.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {filteredEvents.map((ev) => {
                const meta = ACTION_META[ev.action] ?? { severity: "info" as Severity, title: ev.action };
                const sev = SEVERITY_META[meta.severity];
                const Icon = sev.icon;
                return (
                  <li
                    key={ev.id}
                    className="group flex items-start gap-3 px-5 py-3 transition hover:bg-[var(--surface-sunken)]/50"
                  >
                    <div className="mt-0.5">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${sev.cls}`}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-sm text-[var(--text-primary)]">
                          {meta.title}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${sev.cls}`}
                        >
                          <span className={`h-1 w-1 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {ev.detail}
                      </p>
                      {ev.ipAddress && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                          <Globe className="h-2.5 w-2.5" aria-hidden />
                          {ev.ipAddress}
                        </span>
                      )}
                    </div>
                    <time className="shrink-0 whitespace-nowrap text-[10px] text-[var(--text-tertiary)]">
                      {fmtRelative(ev.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Postura (col 1) */}
        <aside className="space-y-4">
          {/* TOTP Coverage con progress bar */}
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h4 className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                    Cobertura TOTP 2FA
                  </h4>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Superadmins con 2FA habilitado
                  </p>
                </div>
              </div>
              <span className="font-display text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {totpPct}%
              </span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={`h-full rounded-full transition-all ${
                  totpPct === 100
                    ? "bg-[var(--data-success-500)]"
                    : totpPct >= 50
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${totpPct}%` }}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {posture.totpCoverage.enrolled} de {posture.totpCoverage.total} enrolados
            </p>
          </div>

          {/* Checks postura compactos */}
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <h4 className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                Checks de postura
              </h4>
            </header>
            <ul className="divide-y divide-[var(--rule-soft)]">
              <PostureCheck
                icon={Lock}
                label="Lockout automático"
                status="ok"
                detail="5 intentos → 15 min bloqueo"
              />
              <PostureCheck
                icon={Shield}
                label="Auditoría activa"
                status="ok"
                detail="Registro continuo de acciones"
              />
              <PostureCheck
                icon={ShieldCheck}
                label="TOTP enrolado"
                status={totpPct === 100 ? "ok" : "warning"}
                detail={`${totpPct}% cobertura`}
              />
            </ul>
          </div>
        </aside>
      </div>

      {/* ─── IPs sospechosas (extraído del endpoint, antes oculto) ── */}
      {suspiciousIPs.length > 0 && (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/30 overflow-hidden dark:border-amber-700/40 dark:bg-amber-950/20">
          <header className="flex items-center gap-3 border-b border-amber-200/60 dark:border-amber-700/40 px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-amber-800 dark:text-amber-200">
                IPs sospechosas detectadas
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                {suspiciousIPs.length} IP{suspiciousIPs.length === 1 ? "" : "s"} con ≥3 intentos
                fallidos en los últimos 7 días
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
            {suspiciousIPs.slice(0, 12).map((sip) => (
              <div
                key={sip.ip}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-[var(--surface-raised)] px-3 py-2 dark:border-amber-700/30"
              >
                <span className="font-mono text-xs font-bold text-[var(--text-primary)] truncate">
                  {sip.ip}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  <TrendingUp className="h-2.5 w-2.5" />
                  {sip.failedAttempts} fails
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle: string;
  tone: "neutral" | "warning" | "danger" | "success";
}) {
  const iconBg =
    tone === "warning"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
      : tone === "danger"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
        : tone === "success"
          ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
          : "bg-[var(--accent)]/10 text-[var(--accent)]";
  const valueTone =
    tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "danger"
        ? "text-rose-700 dark:text-rose-300"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums tracking-tight ${valueTone}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
    </div>
  );
}

function PostureCheck({
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
  const meta = {
    ok: { cls: "text-[var(--data-success-500)]", dot: "bg-[var(--data-success-500)]", txt: "Activo" },
    warning: { cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", txt: "Revisar" },
    error: { cls: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500", txt: "Inactivo" },
  }[status];
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Icon
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">{label}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{detail}</p>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider ${meta.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.txt}
      </span>
    </li>
  );
}
