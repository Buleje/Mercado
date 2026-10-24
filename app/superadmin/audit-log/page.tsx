import "server-only";
import { History } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { AuditLogConsole } from "./AuditLogConsole";
import { SuperAdminModuleTabs, SEGURIDAD_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Auditoría del superadmin — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/audit-log — Registro de acciones del superadmin (Brandon
 * 2026-06-19, idea #F): impersonaciones y acciones sensibles, quién y cuándo.
 */
export default async function AuditLogPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={History}
        title="Auditoría del superadmin"
        kicker="Plataforma · Seguridad"
        info={{
          title: "Auditoría del superadmin",
          what: "Registro de las acciones sensibles del superadmin: cada vez que alguien impersona un negocio, aprueba un pago, manda un broadcast o cambia una automatización.",
          affects: "Solo lectura. Es la trazabilidad de quién entró a qué negocio y qué hizo — confianza y rendición de cuentas. Exportable a CSV.",
          example: "Si necesitas saber quién entró al panel de una tienda y cuándo, filtras por 'impersonate' y lo ves con fecha, operador y negocio.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={SEGURIDAD_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <AuditLogConsole />
      </div>
    </div>
  );
}
