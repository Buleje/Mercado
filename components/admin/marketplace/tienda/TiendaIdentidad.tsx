"use client";
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { Globe, Store } from "@buleje/design-system/icons";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import type { SetStore } from "./shared";

/** Bloque «Identidad»: URL pública, nombre y descripción. */
export function TiendaIdentidad({ store, setStore }: { store: MarketplaceStoreData; setStore: SetStore }) {
  return (
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Identidad</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
            Cómo te encuentran los clientes en el marketplace.
          </p>
        </div>
      </header>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2 sm:col-span-1">
          <Field
            label={<span className="flex items-center gap-1.5"><Globe className="h-4 w-4" /> URL pública</span>}
            labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            {(id) => (
              <div className="flex items-stretch h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                <span className="inline-flex items-center px-4 text-sm font-extrabold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-r-2 border-[var(--rule-base)] whitespace-nowrap">/marketplace/</span>
                <input
                  id={id}
                  type="text"
                  value={store.slug}
                  onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                  placeholder="mi-bodega"
                  className="flex-1 min-w-0 px-4 bg-transparent text-base font-semibold text-[var(--text-primary)] outline-none"
                />
              </div>
            )}
          </Field>
          <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
            Solo minúsculas y guiones. Evita cambiarla — los links viejos dejan de funcionar.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Field
            label={<>Nombre visible <span className="text-[var(--data-error)]">*</span></>}
            labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            <input
              type="text"
              value={store.name}
              onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
              placeholder="Bodega San Martín"
              maxLength={60}
              className="w-full h-12 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </Field>
          <p className="text-sm text-[var(--text-tertiary)]">
            <span className="font-bold tabular-nums">{store.name.length}</span>/60 caracteres
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Field
            label={
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">Descripción</span>
                <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
                  <span className="font-bold">{(store.description ?? "").length}</span>/240
                </span>
              </div>
            }
            labelClassName=""
          >
            <textarea
              rows={3}
              maxLength={240}
              value={store.description}
              onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe tu tienda: horarios, especialidades, qué te hace única…"
              className="w-full px-4 py-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all leading-relaxed"
            />
          </Field>
        </div>
      </div>
    </section>
  );
}
