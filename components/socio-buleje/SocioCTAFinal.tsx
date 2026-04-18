"use client";

/**
 * SocioCTAFinal — Banda final "Probalo 30 días gratis".
 *
 * Selector Mensual/Anual + CTA primary.
 */

import { useState } from "react";
import Link from "next/link";
import {
  SectionTitle,
  BodyText,
  PrimaryButton,
  Kicker,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { PlanSelector } from "./PlanSelector";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import type { SocioPlan } from "@/lib/validators/socio-buleje";
import { TRIAL_DAYS } from "@/lib/validators/socio-buleje";

export function SocioCTAFinal() {
  const { isSocio, subscribe } = useSocioBuleje();
  const [plan, setPlan] = useState<SocioPlan>("yearly");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async () => {
    setIsSubmitting(true);
    try {
      await subscribe(plan);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className="border-t border-[var(--rule-muted)]"
      aria-labelledby="cta-final-heading"
    >
      <div
        className="relative overflow-hidden bg-[var(--surface-raised)]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, color-mix(in oklch, var(--accent) 5%, transparent) 0%, transparent 70%)",
        }}
      >
        <div className="mx-auto max-w-4xl px-4 py-20 sm:py-24 text-center">
          <Kicker>Una última cosa</Kicker>
          <SectionTitle
            id="cta-final-heading"
            as="h2"
            className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
          >
            Probalo {TRIAL_DAYS} días gratis, sin compromiso
          </SectionTitle>
          <BodyText className="mt-4 text-[var(--text-secondary)] max-w-xl mx-auto">
            Sin tarjeta, sin letra chica. Si no te sirve, cancelás con un clic
            desde tu panel y no pagás nada.
          </BodyText>

          {!isSocio ? (
            <div className="mt-8 space-y-4 flex flex-col items-center">
              <PlanSelector value={plan} onChange={setPlan} />
              <PrimaryButton
                size="lg"
                onClick={handleSubscribe}
                loading={isSubmitting}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
              >
                Empezar mi prueba gratis
              </PrimaryButton>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                Plan anual: S/ 189 (ahorrás 2 meses). Mensual: S/ 19.
              </p>
            </div>
          ) : (
            <div className="mt-8">
              <PrimaryButton size="lg" asChild>
                <Link href="/cuenta/socio-buleje">Ir al panel de Socio</Link>
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
