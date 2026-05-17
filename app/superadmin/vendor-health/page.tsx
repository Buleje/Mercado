import { requirePlatformPage } from "@/lib/superadmin-auth";
import { VendorHealthDashboard } from "@/components/superadmin/vendor-health/VendorHealthDashboard";

export const metadata = {
  title: "Salud de vendors — Buleje Superadmin",
  description:
    "Re-verification automática de RUC/DNI contra RENIEC y SUNAT. Vendors degradados quedan listados aquí.",
  robots: { index: false, follow: false },
};

export default async function VendorHealthPage() {
  await requirePlatformPage();

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">
          Salud de vendors
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Stats agregados del cron diario que re-verifica RUC/DNI de los vendors
          aprobados contra RENIEC y SUNAT. Si un vendor pasa a NO HABIDO, sus
          facturas dejan de ser deducibles para sus clientes — revisalo desde
          esta vista o desde el drawer de cada application.
        </p>
      </header>

      <VendorHealthDashboard />
    </div>
  );
}
