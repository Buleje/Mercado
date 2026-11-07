import "server-only";
import { Megaphone } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { ComunicadosComposer } from "./ComunicadosComposer";
import {
  SuperAdminModuleTabs,
  COMUNICACION_TABS,
} from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Comunicados — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/comunicados — Comunicados segmentados (Brandon 2026-06-19, idea
 * #B). Mensaje a un segmento inteligente de negocios; envío vía broadcast.
 */
export default async function ComunicadosPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Megaphone}
        title="Comunicados"
        kicker="Plataforma · Comunicación"
        info={{
          title: "Comunicados segmentados",
          what: "Manda un mensaje a un grupo inteligente de negocios de una sola vez: en riesgo, no usan Marketplace/Fiado, trial por vencer, pagados o todos.",
          affects: "Envía un mensaje al chat de cada negocio del segmento (vía el broadcast existente). Reusa la inteligencia de Rescate y Adopción.",
          example: "Eliges 'No usan Marketplace' (3 negocios) y les mandas de una un mensaje ofreciéndoles activarlo.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={COMUNICACION_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <ComunicadosComposer />
      </div>
    </div>
  );
}
