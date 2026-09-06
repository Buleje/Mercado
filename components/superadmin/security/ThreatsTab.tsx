"use client";

/**
 * ThreatsTab — WAF en vivo del Security Center.
 *
 * Muestra los ataques detectados por el middleware (SQLi/XSS/traversal/scanner),
 * el desglose por severidad y tipo, la serie temporal, las IPs más agresivas y
 * la blocklist — con acciones de bloqueo/desbloqueo manual. Datos reales del
 * endpoint /api/superadmin/security/threats (ActivityLog + Redis blocklist).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Ban, Target, Database, Code2, FolderOpen, Command,
  ScanLine, Globe, Unlock, Loader2, type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

type Severity = "low" | "medium" | "high" | "critical";
type ThreatType = "sqli" | "nosqli" | "xss" | "path_traversal" | "command_injection" | "code_injection" | "ssrf" | "scanner" | "sensitive_probe";

interface Overview {
  windowDays: number;
  total: number;
  blockedInline: number;
  bySeverity: Record<Severity, number>;
  byType: Array<{ type: ThreatType; count: number }>;
  topIps: Array<{ ip: string; count: number; lastAt: string; types: ThreatType[] }>;
  timeline: Array<{ day: string; count: number }>;
  recent: Array<{ id: string; at: string; ip: string; path: string; method: string; types: ThreatType[]; maxSeverity: Severity; blockedInline: boolean }>;
  blockedIps: Array<{ ip: string; reason: string; at: string; ttl: number }>;
  blocklistEnabled: boolean;
  trustedIpsConfigured: boolean;
}

const TYPE_META: Record<ThreatType, { label: string; icon: LucideIcon }> = {
  sqli: { label: "SQL injection", icon: Database },
  nosqli: { label: "NoSQL injection", icon: Database },
  xss: { label: "Cross-site scripting", icon: Code2 },
  path_traversal: { label: "Path traversal", icon: FolderOpen },
  command_injection: { label: "Command injection", icon: Command },
  code_injection: { label: "Inyección de código", icon: Code2 },
  ssrf: { label: "SSRF", icon: Globe },
  scanner: { label: "Escáner / bot", icon: ScanLine },
  sensitive_probe: { label: "Sondeo de rutas", icon: Target },
};

const SEV_META: Record<Severity, { label: string; chip: string; dot: string }> = {
  critical: { label: "Crítica", chip: "bg-rose-100 text-[var(--data-error-700)] dark:bg-rose-500/15 dark:text-[var(--data-error-500)]", dot: "bg-rose-500" },
  high: { label: "Alta", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500" },
  medium: { label: "Media", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500" },
  low: { label: "Baja", chip: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300", dot: "bg-slate-400" },
};

function fmtWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtTtl(sec: number): string {
  if (sec < 0) return "permanente";
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[var(--surface-sunken)]" />)}
      </div>
      <div className="h-48 rounded-2xl bg-[var(--surface-sunken)]" />
      <div className="h-64 rounded-2xl bg-[var(--surface-sunken)]" />
    </div>
  );
}

export function ThreatsTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIp, setBusyIp] = useState<string | null>(null);
  const abortRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/security/threats?days=7", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Overview;
      if (!abortRef.current) { setData(json); setError(null); }
    } catch (e) {
      if (!abortRef.current) setError(e instanceof Error ? e.message : "Error");
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    abortRef.current = false;
    load();
    const onRefresh = () => load();
    window.addEventListener("security-overview-refresh", onRefresh);
    return () => { abortRef.current = true; window.removeEventListener("security-overview-refresh", onRefresh); };
  }, [load]);

  const act = async (ip: string, action: "block" | "unblock") => {
    setBusyIp(ip);
    try {
      await fetch("/api/superadmin/security/threats", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action, ip }),
      });
      await load();
    } catch { /* silent */ } finally { setBusyIp(null); }
  };

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div role="alert" className="rounded-2xl border-2 border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 p-4 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        No se pudo cargar el WAF ({error ?? "sin datos"}).
      </div>
    );
  }

  const criticals = data.bySeverity.critical + data.bySeverity.high;
  const maxTimeline = Math.max(...data.timeline.map((t) => t.count), 1);
  const blockedSet = new Set(data.blockedIps.map((b) => b.ip));

  return (
    <div className="space-y-6">
      {/* Estado del WAF */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Firewall de aplicación activo</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Inspecciona cada request en el borde · bloqueo inline de firmas críticas ·{" "}
            {data.blocklistEnabled
              ? "auto-bloqueo de IPs reincidentes + alerta a Sentry"
              : <span className="text-amber-600 dark:text-amber-400">blocklist distribuida OFF (configurá Upstash Redis)</span>}
            {data.trustedIpsConfigured && " · IPs de confianza exentas"}
          </p>
        </div>
      </div>

      {/* Stat cells */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCell icon={Target} tone="info" label="Amenazas (7d)" value={String(data.total)} subtitle="detectadas en el borde" />
        <StatCell icon={ShieldAlert} tone="danger" label="Críticas + altas" value={String(criticals)} subtitle="mayor riesgo" />
        <StatCell icon={ShieldCheck} tone="success" label="Bloqueadas inline" value={String(data.blockedInline)} subtitle="403 automático por firma" />
        <StatCell icon={Ban} tone="warning" label="IPs bloqueadas" value={String(data.blockedIps.length)} subtitle="ban activo" />
      </div>

      {/* Timeline + severidad */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Amenazas por día</h3>
          <p className="text-xs text-[var(--text-tertiary)]">Últimos {data.windowDays} días</p>
          <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
            {data.timeline.map((t) => (
              <div key={t.day} className="flex flex-1 flex-col items-center gap-1" title={`${t.day}: ${t.count}`}>
                <div className="flex w-full items-end justify-center" style={{ height: 96 }}>
                  <div
                    className={cn("w-full max-w-[28px] rounded-t-md", t.count > 0 ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)]")}
                    style={{ height: `${Math.max((t.count / maxTimeline) * 100, t.count > 0 ? 8 : 3)}%` }}
                  />
                </div>
                <span className="text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{t.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Por severidad</h3>
          <div className="mt-3 space-y-2">
            {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
              const c = data.bySeverity[sev];
              const pct = data.total > 0 ? (c / data.total) * 100 : 0;
              return (
                <div key={sev} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm font-semibold text-[var(--text-secondary)]">{SEV_META[sev].label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div className={cn("h-full rounded-full", SEV_META[sev].dot)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">{c}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Tipos de ataque */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Tipos de ataque</h3>
        {data.byType.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">Sin ataques detectados en la ventana. 🎉</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.byType.map(({ type, count }) => {
              const Icon = TYPE_META[type].icon;
              return (
                <div key={type} className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 p-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{TYPE_META[type].label}</p>
                    <p className="text-[length:var(--ts-xs)] tabular-nums text-[var(--text-tertiary)]">{count} eventos</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Top IPs agresivas */}
      <section className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <header className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">IPs más agresivas</h3>
          <p className="text-xs text-[var(--text-tertiary)]">Bloqueá una IP para rechazar todas sus requests</p>
        </header>
        {data.topIps.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Sin actividad sospechosa. Todo tranquilo.</p>
        ) : (
          <div className="divide-y divide-[var(--rule-soft)]">
            {data.topIps.map((row) => {
              const blocked = blockedSet.has(row.ip);
              return (
                <div key={row.ip} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Globe className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{row.ip}</span>
                  <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-secondary)]">
                    {row.count} amenazas
                  </span>
                  <div className="hidden items-center gap-1 sm:flex">
                    {row.types.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                        {TYPE_META[t].label}
                      </span>
                    ))}
                  </div>
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{fmtWhen(row.lastAt)}</span>
                  <div className="ml-auto">
                    {blocked ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--data-error-700)] dark:bg-rose-500/15 dark:text-[var(--data-error-500)]">
                        <Ban className="h-3.5 w-3.5" /> Bloqueada
                      </span>
                    ) : (
                      <button
                        onClick={() => act(row.ip, "block")}
                        disabled={busyIp === row.ip || !data.blocklistEnabled}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-rose-400 hover:text-[var(--data-error-500)] disabled:opacity-40"
                        title={data.blocklistEnabled ? "Bloquear esta IP" : "Requiere Upstash Redis"}
                      >
                        {busyIp === row.ip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Bloquear
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Blocklist activa */}
      {data.blockedIps.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <header className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <Ban className="h-4 w-4 text-[var(--data-error-500)]" aria-hidden />
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">IPs bloqueadas ({data.blockedIps.length})</h3>
          </header>
          <div className="divide-y divide-[var(--rule-soft)]">
            {data.blockedIps.map((b) => (
              <div key={b.ip} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{b.ip}</span>
                <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">{b.reason}</span>
                <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">expira en {fmtTtl(b.ttl)}</span>
                <button
                  onClick={() => act(b.ip, "unblock")}
                  disabled={busyIp === b.ip}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                >
                  {busyIp === b.ip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Desbloquear
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Eventos recientes */}
      <section className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <header className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Eventos recientes</h3>
        </header>
        {data.recent.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Sin eventos registrados en la ventana.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--rule-soft)]">
            {data.recent.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2.5 px-5 py-2.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", SEV_META[e.maxSeverity].chip)}>
                  {SEV_META[e.maxSeverity].label}
                </span>
                {e.blockedInline && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> 403
                  </span>
                )}
                <span className="font-mono text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">{e.ip}</span>
                <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">{e.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{e.path}</span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtWhen(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCell({ icon: Icon, tone, label, value, subtitle }: {
  icon: LucideIcon; tone: "info" | "success" | "warning" | "danger"; label: string; value: string; subtitle: string;
}) {
  const iconBg = {
    info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    danger: "bg-rose-100 text-[var(--data-error-700)] dark:bg-rose-500/15 dark:text-[var(--data-error-500)]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
    </div>
  );
}
