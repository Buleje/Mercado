"use client";
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { AlertCircle, CheckCircle, DollarSign, Star } from "@buleje/design-system/icons";
import ImageUpload from "@/components/admin/ImageUpload";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import type { SetStore } from "./shared";

/** Bloques «Comisión Buleje» (solo lectura) e «Imagen de la tienda» (logo). */
export function TiendaComisionImagen({ store, setStore }: { store: MarketplaceStoreData; setStore: SetStore }) {
  return (
    <>
    {/* Comisión */}
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-success)]/10 text-[var(--data-success)] shrink-0">
          <DollarSign className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Comisión Buleje</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
            Lo que Buleje cobra por cada venta. La fija la plataforma — para revisarla, contáctanos por WhatsApp.
          </p>
        </div>
      </header>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-5">
          <span className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">
            {store.commissionRate}%
          </span>
          <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Solo lectura
          </span>
        </div>
      </div>
    </section>

    {/* Marca visual: logo + URL backup */}
    <section id="tienda-imagen" className="scroll-mt-24 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
          <Star className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Imagen de la tienda</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
            Logo cuadrado 200×200 — aparece en la tarjeta de tu tienda en /tiendas y en cada pedido.
          </p>
        </div>
      </header>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 items-start">
        <ImageUpload
          value={store.logoUrl}
          onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
          onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))}
          folder="marketplace-logos"
          label=""
          hint=""
          aspectRatio="square"
        />
        <div className="space-y-3">
          <Field label="…o pega una URL de imagen" labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <input
              type="url"
              value={store.logoUrl}
              onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
              placeholder="https://…"
              className="w-full h-12 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </Field>
          {store.logoUrl ? (
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--data-success)]">
              <CheckCircle className="h-4 w-4" /> Logo configurado
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
              Sin logo, usaremos las iniciales de tu tienda como avatar.
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  );
}
