import "server-only";
import { Building2 } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { TenantDetailConsole } from "./TenantDetailConsole";

export const metadata = {
  title: "Ficha del negocio — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/tenants/[slug] — Ficha 360 del negocio (Brandon 2026-06-19, idea
 * #2). Todo de un tenant en una pantalla + acciones (impersonar/contactar/ver).
 */
export default async function TenantDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePlatformPage();
  const { slug } = await params;

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Building2}
        title="Ficha 360 del negocio"
        kicker="Plataforma · Tiendas"
        info={{
          title: "Ficha 360 del negocio",
          what: "Todo de un negocio en una pantalla: plan, salud, conteos, integraciones, pedidos, errores y actividad. Entiende y ayuda a cualquier negocio desde un solo lugar.",
          affects: "Solo lectura + acciones de soporte (impersonar, contactar, ver tienda). No cambia datos del negocio.",
          example: "Ves que una pollería bajó su health a 32 y no vende hace 10 días → la contactas o entras a su panel a ayudarla antes de que se vaya.",
        }}
      />

      <div className={SUPERADMIN_CONTENT}>
        <TenantDetailConsole slug={slug} />
      </div>
    </div>
  );
}
