import "server-only";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CreditCard } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import BillingDashboard from "./BillingDashboard";
import { PendingPaymentsCard } from "./PendingPaymentsCard";
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
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Billing — plataforma
              
            <InfoTip side="bottom" title="Billing de la plataforma" body="Atajos: / buscar · R recargar" what="El cobro de Buleje vía Stripe: suscripciones de las tiendas, MRR y estado de pagos." affects="Refleja cuánto factura Buleje a las tiendas; no cambia los precios que las tiendas cobran a sus clientes." example="Si una tienda paga su plan Pro, su suscripción aparece activa y suma al MRR del mes." />
          </h1>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <PendingPaymentsCard />
        <BillingDashboard />
      </div>
    </div>
  );
}
