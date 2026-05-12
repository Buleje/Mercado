"use client";

/**
 * VulnerabilitiesTab — Estado de escaneo de vulnerabilidades.
 *
 * Hoy: NO hay escáner conectado. Mostramos empty state honesto + CTAs reales
 * + checklist de mitigación manual + stats de dependencias del repo.
 *
 * Cuando se conecte (Snyk/Dependabot/Trivy), este tab consumirá
 * GET /api/superadmin/security/cves.
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
  type LucideIcon,
} from "@buleje/design-system/icons";

export function VulnerabilitiesTab() {
  return (
    <div className="space-y-6">
      {/* ─── Header status ───────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 mb-4">
          <ShieldAlert className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Estado · Sin escáner
        </p>
        <h2 className="mt-1 font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          No hay escáner de CVEs conectado
        </h2>
        <p className="mt-2 max-w-xl mx-auto text-sm text-[var(--text-secondary)]">
          Para detectar vulnerabilidades en las dependencias del repositorio, conectá un escáner
          externo. Mientras tanto, este panel no muestra datos falsos — preferimos la honestidad
          a un falso sentido de cobertura.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <a
            href="https://docs.github.com/en/code-security/dependabot/dependabot-security-updates"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/20 transition hover:brightness-110"
          >
            <Cable className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Conectar Dependabot
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href="https://snyk.io/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Conectar Snyk
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href="https://aquasecurity.github.io/trivy/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Conectar Trivy
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </a>
        </div>
      </div>

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
                  CVEs activos agrupados por severidad (Critical / High / Medium / Low)
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
                <span>CTA "Aplicar fix" → abre PR automática con la dependencia actualizada</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function MitigationCard({
  icon: Icon,
  number,
  title,
  detail,
  code,
}: {
  icon: LucideIcon;
  number: string;
  title: string;
  detail: string;
  code?: string;
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
        <code className="block rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]">
          {code}
        </code>
      )}
    </div>
  );
}
