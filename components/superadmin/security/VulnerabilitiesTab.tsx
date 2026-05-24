"use client";

/**
 * VulnerabilitiesTab — Estado de escaneo de vulnerabilidades.
 *
 * Hoy: NO hay escáner conectado. Mostramos empty state honesto + stats
 * REALES del repo (deps, lockfile age, Node) leídos del server, + CTAs
 * para conectar Dependabot/Snyk/Trivy + checklist de mitigación manual.
 *
 * Mejoras 2026-05-24:
 *  - Stats reales desde /api/superadmin/security/audit-snapshot
 *  - Copy clipboard en code blocks de mitigación
 *  - Toast inline (feedback de copy + errores)
 *  - Tap targets ≥44px en CTAs
 *  - Mobile 1 col en mitigation cards
 *  - Loading skeleton
 *  - Tonos amber/emerald correctos (sin var(--accent) como rojo)
 */

import {
  ShieldAlert,
  ExternalLink,
  Cable,
  Command,
  RefreshCw,
  Package,
  FileCheck,
  CheckCircle2,
  Copy,
  Clock,
  Cpu,
  AlertTriangle,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AuditSnapshot {
  generatedAt: string;
  depsCount: number;
  devDepsCount: number;
  totalDepsCount: number;
  nodeVersion: string;
  lockfileAgeDays: number | null;
  lockfileSizeBytes: number | null;
  packageJsonAgeDays: number | null;
  reactVersion: string | null;
  nextVersion: string | null;
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

function fmtBytes(b: number | null): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function lockfileTone(days: number | null): "good" | "warn" | "bad" {
  if (days == null) return "warn";
  if (days <= 14) return "good";
  if (days <= 60) return "warn";
  return "bad";
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[var(--surface-sunken)] h-24" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-48" />
    </div>
  );
}

export function VulnerabilitiesTab() {
  const [snapshot, setSnapshot] = useState<AuditSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/security/audit-snapshot", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AuditSnapshot;
        if (!cancelled) setSnapshot(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${label} copiado`, "success");
    } catch {
      pushToast("No se pudo copiar", "error");
    }
  };

  if (loading) return <Skeleton />;

  const lockTone = snapshot ? lockfileTone(snapshot.lockfileAgeDays) : "warn";

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} />

      {/* ─── Header status (empty/honest) ─────────────────────── */}
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8 text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 mb-4">
          <ShieldAlert className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Estado · Sin escáner
        </p>
        <h2 className="mt-1 font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          No hay escáner de CVEs conectado
        </h2>
        <p className="mt-2 max-w-xl mx-auto text-sm text-[var(--text-secondary)]">
          Para detectar vulnerabilidades en las dependencias del repositorio,
          conectá un escáner externo. Mientras tanto, este panel muestra el{" "}
          <strong className="text-[var(--text-primary)]">estado real</strong> del
          repo (no datos falsos).
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <a
            href="https://docs.github.com/en/code-security/dependabot/dependabot-security-updates"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-md transition hover:brightness-110"
          >
            <Cable className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Conectar Dependabot
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href="https://snyk.io/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Conectar Snyk
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href="https://aquasecurity.github.io/trivy/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Conectar Trivy
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
        </div>
      </div>

      {/* ─── Stats reales del repo ───────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-3 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>No se pudo leer el snapshot ({error})</span>
        </div>
      )}

      {snapshot && (
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Package className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Estado real del repo
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Métricas leídas del package.json + lockfile (sin escáner)
              </p>
            </div>
          </header>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[var(--rule-soft)]">
            <StatCell
              icon={Package}
              label="Dependencias"
              value={String(snapshot.depsCount)}
              subtitle={`${snapshot.devDepsCount} dev · ${snapshot.totalDepsCount} total`}
              tone="info"
            />
            <StatCell
              icon={Clock}
              label="Lockfile"
              value={
                snapshot.lockfileAgeDays != null
                  ? `${snapshot.lockfileAgeDays}d`
                  : "—"
              }
              subtitle={fmtBytes(snapshot.lockfileSizeBytes)}
              tone={lockTone === "good" ? "success" : lockTone === "warn" ? "warning" : "danger"}
            />
            <StatCell
              icon={Cpu}
              label="Node runtime"
              value={snapshot.nodeVersion}
              subtitle={
                snapshot.reactVersion ? `React ${snapshot.reactVersion}` : "—"
              }
              tone="info"
            />
            <StatCell
              icon={Cable}
              label="Next.js"
              value={snapshot.nextVersion ?? "—"}
              subtitle="App Router · Turbopack"
              tone="info"
            />
          </div>
        </section>
      )}

      {/* ─── Mitigación manual ───────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Mientras tanto — mitigación manual
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Acciones que reducen el riesgo sin escáner automático
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--rule-soft)]">
          <MitigationCard
            icon={Command}
            number="01"
            title="npm audit antes de deploy"
            detail="Corré npm audit --omit=dev en CI. Falla el build si encuentra vulnerabilidades High/Critical."
            code="npm audit --omit=dev"
            onCopy={copy}
          />
          <MitigationCard
            icon={RefreshCw}
            number="02"
            title="Renovate / Dependabot PRs"
            detail="Aceptá las PRs de seguridad que aparecen en GitHub. Las críticas no esperan al sprint planning."
          />
          <MitigationCard
            icon={FileCheck}
            number="03"
            title="Lockfile auditado"
            detail="package-lock.json siempre commiteado y sin discrepancias. Sin npm install --no-package-lock."
            code="git diff package-lock.json"
            onCopy={copy}
          />
        </div>
      </section>

      {/* ─── Próximos pasos ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Package className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Cuando conectes un escáner, este panel mostrará
            </h3>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                <span>
                  CVEs activos agrupados por severidad (Critical / High / Medium /
                  Low)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                <span>Paquetes afectados con versión instalada vs versión fix</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                <span>Tiempo desde el último escaneo y próximo scheduled</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                <span>
                  CTA &ldquo;Aplicar fix&rdquo; → abre PR automática con la
                  dependencia actualizada
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCell({
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
  tone: "info" | "success" | "warning" | "danger";
}) {
  const iconBg = {
    info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  }[tone];
  const valueTone =
    tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "danger"
        ? "text-rose-700 dark:text-rose-300"
        : "text-[var(--text-primary)]";
  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-2 font-display text-xl font-extrabold tabular-nums tracking-tight",
          valueTone,
        )}
      >
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
    </div>
  );
}

function MitigationCard({
  icon: Icon,
  number,
  title,
  detail,
  code,
  onCopy,
}: {
  icon: LucideIcon;
  number: string;
  title: string;
  detail: string;
  code?: string;
  onCopy?: (text: string, label: string) => void;
}) {
  return (
    <div className="p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="font-display text-2xl font-extrabold text-[var(--text-tertiary)]/40 tabular-nums">
          {number}
        </span>
      </div>
      <h4 className="font-display text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
        {title}
      </h4>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{detail}</p>
      {code && (
        <div className="flex items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-2.5 pr-1 py-1">
          <code className="flex-1 font-mono text-xs text-[var(--text-primary)] truncate">
            {code}
          </code>
          {onCopy && (
            <button
              onClick={() => onCopy(code, "Comando")}
              aria-label={`Copiar ${title}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
