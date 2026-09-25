import "server-only";
import { Megaphone } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
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
      <SuperAdminModuleTabs tabs={COMUNICACION_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Megaphone className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Comunicación
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Comunicados
                <InfoTip
                  side="bottom"
                  title="Comunicados segmentados"
                  what="Mandá un mensaje a un grupo inteligente de negocios de una sola vez: en riesgo, no usan Marketplace/Fiado, trial por vencer, pagados o todos."
                  affects="Envía un mensaje al chat de cada negocio del segmento (vía el broadcast existente). Reusa la inteligencia de Rescate y Adopción."
                  example="Elegís 'No usan Marketplace' (3 negocios) y les mandás de una un mensaje ofreciéndoles activarlo."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Un mensaje al segmento correcto, de una sola vez. Sin escribir uno por uno.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <ComunicadosComposer />
      </div>
    </div>
  );
}
