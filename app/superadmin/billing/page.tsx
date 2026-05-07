import "server-only";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const metadata = {
  title: "Billing Platform — Buleje SaaS",
  robots: "noindex, nofollow",
};

/**
 * F2: /superadmin/billing — pagina placeholder con link a tenants
 * para ver suscripciones individuales mientras se implementa billing platform-level.
 */
export default function SuperadminBillingPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        Billing — plataforma
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Vista consolidada de revenue, MRR y estado de suscripciones por tenant.
      </p>

      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
          Proxima implementacion
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Esta pantalla mostrara MRR consolidado, plan por tenant y estado
          trial/paid. Mientras tanto, usa la seccion Tenants para ver
          suscripciones individuales.
        </p>
        <Link
          href="/superadmin/tenants"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          Ir a Tenants
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
