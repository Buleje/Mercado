import "server-only";
import { ShieldCheck } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
import { ComplianceAuditConsole } from "./ComplianceAuditConsole";
import { SuperAdminModuleTabs, SEGURIDAD_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Auditoría Ley 29733 — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/compliance — Auditoría Ley 29733 (Brandon 2026-06-19). Registro de
 * accesos a datos personales (ActivityLog [L29733]) que exige la ley peruana.
 */
export default async function CompliancePage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={SEGURIDAD_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Compliance
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Auditoría Ley 29733
                <InfoTip
                  side="bottom"
                  title="Ley 29733 — Protección de Datos Personales"
                  what="El registro de auditoría que exige la ley peruana: quién accedió o modificó datos personales (clientes, ventas, fiados), cuándo y desde qué IP. Lo marca el sistema con la etiqueta [L29733]."
                  affects="Solo lectura. Es tu evidencia de cumplimiento ante la APDP; exportable a CSV."
                  example="Si un cliente pide saber qué se hizo con sus datos (derecho de acceso), filtrás por su negocio y exportás el registro."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Quién tocó qué dato personal, cuándo y desde dónde. Evidencia de cumplimiento,
                exportable.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <ComplianceAuditConsole />
      </div>
    </div>
  );
}
