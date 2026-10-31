import "server-only";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { CreditCard } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import BillingDashboard from "./BillingDashboard";
import { PendingPaymentsCard } from "./PendingPaymentsCard";
import { SuperAdminModuleTabs, FINANZAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";

export const metadata = {
  title: "Billing Platform — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default async function SuperadminBillingPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={CreditCard}
        title="Billing — plataforma"
        kicker="Plataforma · Finanzas"
        info={{
          title: "Billing de la plataforma",
          body: "Atajos: / buscar · R recargar",
          what: "El cobro de Buleje vía Stripe: suscripciones de las tiendas, MRR y estado de pagos.",
          affects: "Refleja cuánto factura Buleje a las tiendas; no cambia los precios que las tiendas cobran a sus clientes.",
          example: "Si una tienda paga su plan Pro, su suscripción aparece activa y suma al MRR del mes.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={FINANZAS_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <PendingPaymentsCard />
        <BillingDashboard />
      </div>
    </div>
  );
}
