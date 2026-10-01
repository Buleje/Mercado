import "server-only";
import { Building2 } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
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
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Tiendas
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Ficha 360 del negocio
                <InfoTip
                  side="bottom"
                  title="Ficha 360 del negocio"
                  what="Todo de un negocio en una pantalla: plan, salud y engagement, conteos, integraciones, pedidos, errores de su panel y actividad reciente."
                  affects="Solo lectura + acciones de soporte (impersonar, contactar, ver tienda). No cambia datos del negocio."
                  example="Ves que una pollería bajó su health a 32 y no vende hace 10 días → la contactás o entrás a su panel a ayudarla antes de que se vaya."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Entendé y ayudá a cualquier negocio desde un solo lugar.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <TenantDetailConsole slug={slug} />
      </div>
    </div>
  );
}
