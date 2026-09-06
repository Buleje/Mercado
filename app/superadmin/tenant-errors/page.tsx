import "server-only";
import { ShieldAlert } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
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
      <SuperAdminModuleTabs tabs={SALUD_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Soporte
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Errores en vivo de los negocios
                <InfoTip
                  side="bottom"
                  title="Soporte proactivo"
                  what="Muestra en vivo los errores que sufre el panel admin de cada negocio (los reporta el error boundary de su panel)."
                  affects="Solo el superadmin. Te deja entrar a reproducir (impersonar), contactar al dueño y marcar resuelto."
                  example="Una bodega tropieza con un bug al cargar un producto → lo ves acá antes de que te llame, entrás a su panel y la ayudás."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Errores del panel admin de los negocios, agrupados por negocio. Entrá a reproducir,
                contactá al dueño o marcá resuelto.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <TenantErrorsConsole />
      </div>
    </div>
  );
}
