import "server-only";
import { Layers } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { CohortsConsole } from "./CohortsConsole";
import { SuperAdminModuleTabs, ANALYTICS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Cohortes & retención — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/cohorts — Cohortes & retención (Brandon 2026-06-19). Por mes de
 * alta, qué % de negocios sigue activo mes a mes. Dónde se caen.
 */
export default async function CohortsPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Layers}
        title="Cohortes & retención"
        kicker="Plataforma · Crecimiento"
        info={{
          title: "Cohortes & retención",
          what: "Agrupa los negocios por mes de alta (cohorte) y mide qué % sigue activo mes a mes. Verde = retiene, rojo = se cae.",
          affects: "Solo lectura. Insight de crecimiento: te muestra si los negocios nuevos se quedan o se van, y en qué mes.",
          example: "Si la cohorte de abril retiene 100% pero la de junio cae al mes 1, algo cambió en cómo entran los nuevos negocios.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={ANALYTICS_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <CohortsConsole />
      </div>
    </div>
  );
}
