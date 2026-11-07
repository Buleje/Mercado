import "server-only";
import { ShieldCheck } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
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
      <CabeceraConPestanas
        icon={ShieldCheck}
        title="Auditoría Ley 29733"
        kicker="Plataforma · Compliance"
        info={{
          title: "Ley 29733 — Protección de Datos Personales",
          what: "El registro de auditoría que exige la ley peruana: quién accedió o modificó datos personales (clientes, ventas, fiados), cuándo y desde qué IP. Lo marca el sistema con la etiqueta [L29733].",
          affects: "Solo lectura. Es tu evidencia de cumplimiento ante la APDP; exportable a CSV.",
          example: "Si un cliente pide saber qué se hizo con sus datos (derecho de acceso), filtras por su negocio y exportas el registro.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={SEGURIDAD_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <ComplianceAuditConsole />
      </div>
    </div>
  );
}
