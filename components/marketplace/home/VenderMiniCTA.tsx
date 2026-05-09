/**
 * VenderMiniCTA — Banner minimalista 2-col para B2B (bodegueros).
 *
 * Posicionado al final del storefront, antes del CTA grande de "registra tu
 * tienda". Sirve como atajo cuando el user llego hasta aca y no hizo click
 * en nada — tal vez no era un comprador, era un bodeguero explorando.
 */

import Link from "next/link";
import { ArrowRight, Store } from "@buleje/design-system/icons";
import { CardTitle, Caption, Kicker } from "@buleje/design-system";
import { BodegaAbriendo } from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";

export default function VenderMiniCTA() {
  return (
    <section
      aria-labelledby="vender-mini-cta-title"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-5",
          "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
          "p-5 sm:p-6",
        )}
      >
        <div className="hidden sm:block shrink-0 text-[var(--text-secondary)]">
          <BodegaAbriendo size={80} strokeWidth={1.5} aria-hidden />
        </div>

        <div className="min-w-0">
          <Kicker className="text-[var(--text-tertiary)]">
            Para bodegueros y emprendedores
          </Kicker>
          <CardTitle
            id="vender-mini-cta-title"
            className="text-[length:var(--ts-lg)]"
          >
            Vende en Buleje sin complicaciones
          </CardTitle>
          <Caption className="mt-1 text-[var(--text-secondary)]">
            Publica tu catalogo, recibe pedidos por WhatsApp y Buleje se encarga
            del cobro y la logística. Sin costo de inscripcion.
          </Caption>
        </div>

        <div>
          <Link
            href="/vender"
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-3",
              "text-[length:var(--ts-sm)] font-bold",
              "border border-[var(--rule-strong)] bg-[var(--surface-canvas)] text-[var(--text-primary)]",
              "hover:border-[var(--text-primary)] transition-colors",
            )}
          >
            <Store className="h-4 w-4" aria-hidden />
            Quiero vender
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
