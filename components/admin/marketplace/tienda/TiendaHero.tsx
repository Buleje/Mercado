"use client";
import { SectionTitle } from "@buleje/design-system";
import { DollarSign, ExternalLink, Eye, Globe, MapPin, Store } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { inicialesTienda } from "./shared";

/** Cabecera de «Mi tienda»: logo, estado, URL, chips y «Ver pública». Único título de la vista. */
export function TiendaHero({ store }: { store: MarketplaceStoreData }) {
  const initials = inicialesTienda(store);
  const statusBadge = !store.isActive
    ? { label: "Borrador", className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]" }
    : store.vacationMode
    ? { label: "Vacaciones", className: "bg-[var(--data-warning-50)] text-[var(--data-warning)] border-2 border-[var(--data-warning)]/40" }
    : { label: "Publicada", className: "bg-[var(--data-success-50)] text-[var(--data-success)] border-2 border-[var(--data-success)]/40" };

  return (
    <header className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-linear-to-br from-primary/8 via-[var(--surface-canvas)] to-[var(--accent-soft)]/30 px-6 py-7 sm:px-8 sm:py-8">
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Logo grande */}
        <div className="relative shrink-0">
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl overflow-hidden border-4 border-[var(--surface-canvas)] shadow-xl bg-[var(--surface-raised)] flex items-center justify-center">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt={store.name || store.slug} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-extrabold text-primary">{initials}</span>
            )}
          </div>
        </div>

        {/* Identidad */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className={cn("inline-flex items-center h-7 px-3 rounded-full text-xs font-extrabold uppercase tracking-wider", statusBadge.className)}>
              {statusBadge.label}
            </span>
            {store.slug && (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-tertiary)]">
                <Globe className="h-3.5 w-3.5" />
                <span className="font-mono">/marketplace/{store.slug}</span>
              </span>
            )}
          </div>
          <SectionTitle className="text-[var(--text-primary)] tracking-tight truncate">
            {store.name || "Tu tienda en el marketplace"}
          </SectionTitle>
          <p className="mt-2 text-base text-[var(--text-secondary)] line-clamp-2 max-w-2xl leading-relaxed">
            {store.description || "Sin descripción todavía. Cuéntale a los clientes qué te hace especial."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
              <Store className="h-4 w-4 text-primary" />
              {store.category || "Sin categoría"}
            </span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
              <MapPin className="h-4 w-4 text-[var(--accent)]" />
              {(store.coverageZones?.length ?? 0) > 0
                ? `${store.coverageZones!.length} zona${store.coverageZones!.length === 1 ? "" : "s"}`
                : store.zone || "Sin zonas"}
            </span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
              <DollarSign className="h-4 w-4 text-[var(--data-success)]" />
              {store.commissionRate}% comisión
            </span>
          </div>
        </div>

        {/* CTAs */}
        {store.slug && (
          <a
            href={`/marketplace/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 h-12 px-5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] hover:border-primary hover:text-primary hover:shadow-md transition-all"
          >
            <Eye className="h-5 w-5" />
            Ver pública
            <ExternalLink className="h-4 w-4 opacity-60" />
          </a>
        )}
      </div>
    </header>
  );
}
