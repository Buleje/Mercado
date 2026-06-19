import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { VendorHealthDashboard } from "@/components/superadmin/vendor-health/VendorHealthDashboard";
import { VendorPipelinePanel } from "@/components/superadmin/vendor-health/VendorPipelinePanel";
import { HeartPulse } from "@buleje/design-system/icons";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";

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
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <HeartPulse
                className="h-5 w-5 sm:h-6 sm:w-6"
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Marketplace · Compliance
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Salud de vendors
              
            <InfoTip side="bottom" title="Salud de vendors" what="Re-verifica el RUC/DNI de los vendors del marketplace contra RENIEC y SUNAT." affects="Si un vendor pasa a NO HABIDO, sus facturas dejan de ser deducibles para sus clientes." example="Si la SUNAT marca un RUC como NO HABIDO, aparece una alerta para revisar a ese vendor." />
          </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Re-verificación diaria de RUC/DNI contra <strong>RENIEC</strong>{" "}
                y <strong>SUNAT</strong>. Si un vendor pasa a NO HABIDO, sus
                facturas dejan de ser deducibles para sus clientes — revisalo
                desde aquí o desde el drawer de cada solicitud.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <VendorPipelinePanel />
        <VendorHealthDashboard />
      </div>
    </div>
  );
}
