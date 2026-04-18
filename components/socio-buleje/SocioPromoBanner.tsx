"use client";

/**
 * SocioPromoBanner — Banner promocional en homepage.
 *
 * Se oculta si el user ya es Socio activo.
 */

import Link from "next/link";
import {
  SectionTitle,
  BodyText,
  Kicker,
  PrimaryButton,
  Caption,
} from "@buleje/design-system";
import { Sparkles, ArrowRight } from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

export function SocioPromoBanner() {
  const { isSocio } = useSocioBuleje();

  // Variante para socios activos — invita a ver panel.
  if (isSocio) {
    return (
      <section
        aria-labelledby="socio-banner-heading"
        className="border-y border-[var(--rule-muted)] bg-[var(--surface-raised)]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "var(--data-success)" }}
              >
                <Sparkles className="h-4 w-4 text-white" aria-hidden />
              </div>
              <div className="min-w-0">
                <Kicker>Ya sos Socio</Kicker>
                <SectionTitle
                  id="socio-banner-heading"
                  as="h3"
                  className="text-[length:var(--ts-base)]"
                >
                  Tus beneficios están activos en todo el marketplace
                </SectionTitle>
              </div>
            </div>
            <PrimaryButton variant="secondary" size="sm" asChild>
              <Link href="/cuenta/socio-buleje">
                Ver mi panel
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden />
              </Link>
            </PrimaryButton>
          </div>
        </div>
      </section>
    );
  }

  // Variante promocional para no-socios.
  return (
    <section
      aria-labelledby="socio-banner-heading"
      className="border-y border-[var(--rule-muted)]"
    >
      <div
        className="relative overflow-hidden bg-[var(--surface-raised)]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, color-mix(in oklch, var(--accent) 4%, transparent) 0%, transparent 60%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <Kicker className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Nueva membresía
              </Kicker>
              <SectionTitle
                id="socio-banner-heading"
                as="h2"
                className="mt-2 text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)]"
              >
                ¿Ya sos Socio? Ahorrá desde el primer pedido
              </SectionTitle>
              <BodyText className="mt-2 text-[var(--text-secondary)] max-w-xl">
                Delivery gratis, 5% cashback y precios exclusivos. Desde S/ 19 al
                mes. 30 días gratis sin tarjeta.
              </BodyText>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <PrimaryButton asChild>
                <Link href="/socio-buleje">
                  Conocer el plan
                  <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden />
                </Link>
              </PrimaryButton>
              <Caption className="hidden sm:block text-[var(--text-tertiary)]">
                30 días gratis
              </Caption>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
