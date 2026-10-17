"use client";
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { inicialesTienda } from "./shared";

/**
 * Cabecera de «Mi tienda» en UNA fila (11-10): logo, nombre, estado y ⓘ (la
 * dirección pública y la comisión) · secciones. Antes era un banner de ~210 px
 * que repetía la descripción, la categoría y las zonas que se editan abajo, y
 * una tarjeta aparte de 200 px sólo para la comisión (de sólo lectura).
 * «Ver pública» está en el «⋯ Más» de la cabecera del hub.
 */
export function TiendaHero({ store, secciones }: { store: MarketplaceStoreData; secciones?: ReactNode }) {
  const estado = !store.isActive
    ? { label: "Borrador", className: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]" }
    : store.vacationMode
      ? { label: "Vacaciones", className: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]" }
      : { label: "Publicada", className: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]" };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{inicialesTienda(store)}</span>
          )}
        </div>
        <SectionTitle className="max-w-[16rem] truncate whitespace-nowrap text-[var(--text-primary)]">
          {store.name || "Tu tienda en el marketplace"}
        </SectionTitle>
        <span className={cn("inline-flex h-8 items-center rounded-full border px-3 text-sm font-semibold", estado.className)}>{estado.label}</span>
        <InfoTip
          title="Tu tienda en el marketplace"
          what={`Así te encuentran los compradores en Buleje${store.slug ? `: /marketplace/${store.slug}` : ""}. Los cambios se ven en tu tienda pública apenas guardas.`}
          affects={`Buleje cobra ${store.commissionRate} % por cada venta. La fija la plataforma: para revisarla, escríbenos por WhatsApp.`}
          example="Borrador = sólo tú la ves; Publicada = aparece en el marketplace; Vacaciones = se ve, pero no recibe pedidos."
        />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">{secciones}</div>}
    </div>
  );
}
