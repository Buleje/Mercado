"use client";

/**
 * TiendaPreviewHero — hero del mini-dashboard vendedor.
 * Muestra nombre del negocio + saludo + status + shortcut al admin real.
 */

import Link from "next/link";
import { ArrowRight, Store, CheckCircle2 } from "@buleje/design-system/icons";
import { SellerCentralBodega } from "@/components/ui-system/illustrations";

interface TiendaPreviewHeroProps {
  nombreNegocio?: string;
}

export default function TiendaPreviewHero({ nombreNegocio }: TiendaPreviewHeroProps) {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              <Store className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
              Panel vendedor
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Buen día{nombreNegocio ? `, ${nombreNegocio}` : ""}
            </h1>
            <p className="max-w-xl text-sm text-[var(--text-secondary)]">
              Esto es un preview de cómo se ve el panel completo una vez
              verificamos tu solicitud. Pronto vas a gestionar pedidos, stock
              y promociones desde acá.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 sm:items-end">
            {/* Ilustración editorial — vendedor con laptop dashboard */}
            <div
              className="hidden sm:flex text-[var(--text-secondary)] opacity-90"
              aria-hidden="true"
            >
              <SellerCentralBodega size={140} />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--data-success)]/30 bg-[var(--data-success)]/10 px-3 py-1 text-xs font-semibold text-[var(--data-success)]">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Cuenta activa (demo)
            </span>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-bold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
            >
              Ir al panel completo
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
