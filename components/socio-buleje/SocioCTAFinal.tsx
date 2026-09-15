"use client";

/**
 * SocioCTAFinal — Banda final premium "Probalo 30 días gratis" (rediseño
 * 2026-07-04). Gradiente teal de marca (bookend del hero) + card de conversión
 * blanca con PlanSelector.
 */

import { useState } from "react";
import Link from "next/link";
import { PrimaryButton } from "@buleje/design-system";
import { ArrowRight, ShieldCheck, Sparkles } from "@buleje/design-system/icons";
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
    <section aria-labelledby="cta-final-heading" className="px-4 py-16 sm:py-20">
      <div
        className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 sm:px-10 sm:py-16"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)",
        }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          {/* Copy */}
          <div className="text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[var(--ls-wider)] ring-1 ring-inset ring-white/25 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Una última cosa
            </span>
            <h2
              id="cta-final-heading"
              className="mt-4 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl"
            >
              Probalo {TRIAL_DAYS} días gratis, sin compromiso
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
              Sin tarjeta, sin letra chica. Si no te sirve, cancelás con un clic
              desde tu panel y no pagás nada.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {TRIAL_DAYS} días gratis · cancelás cuando quieras
            </p>
          </div>

          {/* Card conversión */}
          <div className="rounded-2xl border border-white/40 bg-[var(--surface-raised)] p-5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)] sm:p-6">
            {isSocio ? (
              <div className="text-center">
                <p className="text-base font-bold text-[var(--text-primary)]">Ya sos Socio Buleje 🎉</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Tus beneficios están activos.
                </p>
                <PrimaryButton size="lg" asChild className="mt-4 w-full justify-center">
                  <Link href="/cuenta/socio-buleje">Ir al panel de Socio</Link>
                </PrimaryButton>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-bold text-[var(--text-primary)]">Elegí tu plan</p>
                <PlanSelector value={plan} onChange={setPlan} className="w-full" />
                <PrimaryButton
                  size="lg"
                  onClick={handleSubscribe}
                  loading={isSubmitting}
                  className="w-full justify-center"
                  rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
                >
                  Empezar mi prueba gratis
                </PrimaryButton>
                <p className="text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  Plan anual: S/ 189 (ahorrás 2 meses). Mensual: S/ 19.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
