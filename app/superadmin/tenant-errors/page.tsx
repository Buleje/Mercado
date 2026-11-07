import "server-only";
import { ShieldAlert } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { TenantErrorsConsole } from "./TenantErrorsConsole";
import { SuperAdminModuleTabs, SALUD_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Errores en vivo de los negocios — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/tenant-errors — Consola de soporte proactivo (Brandon 2026-06-19,
 * idea #1). Muestra en vivo los errores del panel admin de cada negocio
 * (reportados por el error boundary) y permite entrar a reproducir, contactar al
 * dueño y resolver. Datos reales de ClientErrorLog.
 */
export default async function TenantErrorsPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={ShieldAlert}
        title="Errores en vivo de los negocios"
        kicker="Plataforma · Soporte"
        info={{
          title: "Soporte proactivo",
          what: "Muestra en vivo los errores que sufre el panel admin de cada negocio (los reporta el error boundary de su panel).",
          affects: "Solo el superadmin. Te deja entrar a reproducir (impersonar), contactar al dueño y marcar resuelto.",
          example: "Una bodega tropieza con un bug al cargar un producto → lo ves acá antes de que te llame, entras a su panel y la ayudas.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={SALUD_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <TenantErrorsConsole />
      </div>
    </div>
  );
}
