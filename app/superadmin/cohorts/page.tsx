import "server-only";
import { Layers } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
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
      <SuperAdminModuleTabs tabs={ANALYTICS_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Layers className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Crecimiento
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Cohortes & retención
                <InfoTip
                  side="bottom"
                  title="Cohortes & retención"
                  what="Agrupa los negocios por mes de alta (cohorte) y mide qué % sigue activo mes a mes. Verde = retiene, rojo = se cae."
                  affects="Solo lectura. Insight de crecimiento: te muestra si los negocios nuevos se quedan o se van, y en qué mes."
                  example="Si la cohorte de abril retiene 100% pero la de junio cae al mes 1, algo cambió en cómo entran los nuevos negocios."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                ¿Los negocios nuevos se quedan? Retención mes a mes desde el alta.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <CohortsConsole />
      </div>
    </div>
  );
}
