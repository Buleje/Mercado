import "server-only";
import { TrendingUp } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { FeatureAdoptionConsole } from "./FeatureAdoptionConsole";
import { SuperAdminModuleTabs, ANALYTICS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Adopción de funciones — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/feature-adoption — Adopción de funciones (Brandon 2026-06-19, idea
 * #4). Qué módulos usan los negocios + a quién ofrecerle qué (coaching/upsell).
 */
export default async function FeatureAdoptionPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={TrendingUp}
        title="Adopción de funciones"
        kicker="Plataforma · Crecimiento"
        info={{
          title: "Adopción de funciones",
          what: "Muestra qué módulos usa cada negocio (derivado de su actividad) y cuáles no. Marca las funciones de crecimiento (Fiado, Marketplace, Cupones…) sub-usadas.",
          affects: "Solo lectura + acciones de coaching (ofrecer ayuda por chat, ver ficha 360). Es para retención/upsell, no cambia datos.",
          example: "Si solo 1 de 9 tiendas usa Adelantos, o una bodega no usa ninguna función de crecimiento, le ofreces ayuda para que la use y venda más.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={ANALYTICS_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <FeatureAdoptionConsole />
      </div>
    </div>
  );
}
