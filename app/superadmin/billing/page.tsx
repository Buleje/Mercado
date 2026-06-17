import "server-only";
import { CreditCard } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import BillingDashboard from "./BillingDashboard";
import { SuperAdminModuleTabs, FINANZAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";

export const metadata = {
  title: "Billing Platform — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default async function SuperadminBillingPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={FINANZAS_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <CreditCard
                className="h-5 w-5 sm:h-6 sm:w-6"
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Finanzas
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Billing — plataforma
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                MRR consolidado, distribución por plan, trials activos y
                próximos cobros. Atajos:{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                  /
                </kbd>{" "}
                buscar ·{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                  R
                </kbd>{" "}
                recargar
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <BillingDashboard />
      </div>
    </div>
  );
}
