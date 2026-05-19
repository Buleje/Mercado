import "server-only";
import Link from "next/link";
import { ExternalLink, CreditCard, Construction } from "lucide-react";

export const metadata = {
  title: "Billing Platform — Buleje SaaS",
  robots: "noindex, nofollow",
};

/**
 * F2: /superadmin/billing — página placeholder con link a tenants
 * para ver suscripciones individuales mientras se implementa billing platform-level.
 */
export default function SuperadminBillingPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <CreditCard className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma · Finanzas
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Billing — plataforma
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Vista consolidada de revenue, MRR y estado de suscripciones por tenant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 text-center max-w-2xl mx-auto">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-4">
            <Construction
              className="h-6 w-6 text-[var(--text-tertiary)]"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Próxima implementación
          </p>
          <h2 className="mt-1 font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            Dashboard de billing platform-level
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Esta pantalla mostrará MRR consolidado, plan por tenant y estado trial/paid. Mientras
            tanto, usá la sección Tenants para ver suscripciones individuales.
          </p>
          <Link
            href="/superadmin/tenants"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Ir a Tenants
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
