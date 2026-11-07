import "server-only";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { RetencionTabsConReglas } from "@/components/superadmin/retencion/RetencionTabsConReglas";
import { ReglasRetencion } from "@/components/superadmin/retencion/ReglasRetencion";
import { PestanasDelModulo } from "@/components/admin/shared/cabecera-compacta";

export const metadata = {
  title: "Reglas de retención — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/rescue/reglas — qué hace Buleje cuando un negocio da señales de
 * irse (ChurnPlaybook). Ver, pausar/activar y cambiar umbral y canal de cada
 * regla; cuántas alertas abiertas le tocan hoy y si el cron envía de verdad
 * (CHURN_AUTORUN) o sólo guarda la alerta.
 */
export default async function ReglasRetencionPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <PestanasDelModulo pestanas={<RetencionTabsConReglas enLinea />}>
        <ReglasRetencion />
      </PestanasDelModulo>
    </div>
  );
}
