import "server-only";
import { TrendingUp } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
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
      <SuperAdminModuleTabs tabs={ANALYTICS_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Crecimiento
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Adopción de funciones
                <InfoTip
                  side="bottom"
                  title="Adopción de funciones"
                  what="Muestra qué módulos usa cada negocio (derivado de su actividad) y cuáles no. Marca las funciones de crecimiento (Fiado, Marketplace, Cupones…) sub-usadas."
                  affects="Solo lectura + acciones de coaching (ofrecer ayuda por chat, ver ficha 360). Es para retención/upsell, no cambia datos."
                  example="Si solo 1 de 9 tiendas usa Adelantos, o una bodega no usa ninguna función de crecimiento, le ofrecés ayuda para que la use y venda más."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Qué usan tus negocios y a quién ofrecerle qué función para que crezca.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <FeatureAdoptionConsole />
      </div>
    </div>
  );
}
