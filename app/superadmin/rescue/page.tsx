import "server-only";
import { HeartHandshake } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
import { RescueQueue } from "./RescueQueue";
import { SuperAdminModuleTabs, RETENCION_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Cola de rescate — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/rescue — Cola de rescate (Brandon 2026-06-19, idea #3). Negocios a
 * punto de irse, priorizados por urgencia × valor, con acciones de retención.
 */
export default async function RescuePage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={RETENCION_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <HeartHandshake className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Retención
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Cola de rescate
                <InfoTip
                  side="bottom"
                  title="Cola de rescate"
                  what="Junta los negocios a punto de irse y los ordena por urgencia × valor (riesgo, días sin vender/entrar, trial por vencer, plan). Actuás primero sobre el de arriba."
                  affects="Solo el superadmin. Acciones de retención: contactar, impersonar, ver ficha 360 y extender trial (esto último SÍ escribe en la DB)."
                  example="Una pollería enterprise lleva 49 días sin vender y está crítica → la ves arriba de la cola y la contactás o le extendés el trial antes de perderla."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Atajá al que se va a ir antes de que pase. Priorizado por urgencia y valor.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <RescueQueue />
      </div>
    </div>
  );
}
