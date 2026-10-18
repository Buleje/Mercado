import { requirePlatformPage } from "@/lib/superadmin-auth";
import { VendorHealthDashboard } from "@/components/superadmin/vendor-health/VendorHealthDashboard";
import { VendorPipelinePanel } from "@/components/superadmin/vendor-health/VendorPipelinePanel";
import { HeartPulse } from "@buleje/design-system/icons";
import { VendorsTabs } from "@/components/superadmin/_shared/VendorsTabs";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";

export const metadata = {
  title: "Salud de vendors — Buleje Superadmin",
  description:
    "Re-verification automática de RUC/DNI contra RENIEC y SUNAT. Vendors degradados quedan listados aquí.",
  robots: { index: false, follow: false },
};

export default async function VendorHealthPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={HeartPulse}
        title="Salud de vendors"
        kicker="Marketplace · Compliance"
        info={{
          title: "Salud de vendors",
          what: "Re-verifica el RUC/DNI de los vendors del marketplace contra RENIEC y SUNAT.",
          affects: "Si un vendor pasa a NO HABIDO, sus facturas dejan de ser deducibles para sus clientes.",
          example: "Si la SUNAT marca un RUC como NO HABIDO, aparece una alerta para revisar a ese vendor.",
        }}
        pestanas={<VendorsTabs enLinea />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <VendorPipelinePanel />
        <VendorHealthDashboard />
      </div>
    </div>
  );
}
