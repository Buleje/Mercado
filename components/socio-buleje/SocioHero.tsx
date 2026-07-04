"use client";

/**
 * SocioHero — Hero premium de la membresía (rediseño 2026-07-04, coherente con
 * la home: gradiente teal de marca + título `font-display` editorial + card de
 * conversión blanca flotando sobre el gradiente).
 *
 * Mantiene la lógica stateful: PlanSelector + subscribe() + SuccessAlert cuando
 * el usuario ya es Socio.
 */

import { useState } from "react";
import Link from "next/link";
import { PrimaryButton, SuccessAlert } from "@buleje/design-system";
import { ArrowRight, Check, Sparkles, Star } from "@buleje/design-system/icons";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import { PlanSelector } from "./PlanSelector";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import type { SocioPlan } from "@/lib/validators/socio-buleje";
import { TRIAL_DAYS } from "@/lib/validators/socio-buleje";

const QUICK_BENEFITS = [
  "Delivery gratis ilimitado",
  "5% cashback en cada compra",
  "Precios exclusivos de Socio",
] as const;

export function SocioHero() {
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
      aria-labelledby="socio-hero-heading"
      className="relative overflow-hidden bg-[var(--accent)]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)",
      }}
    >
      {/* Glows decorativos */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:py-24">
        {/* ── Columna copy ── */}
        <div className="text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-white ring-1 ring-inset ring-white/25 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Membresía Socio
          </span>

          <h1 id="socio-hero-heading" className="mt-5">
            <span className="block text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Socio Buleje
            </span>
            <span className="mt-1.5 block text-2xl font-bold leading-tight tracking-tight text-white/90 sm:text-3xl">
              Ahorrá todo el año en tu bodega
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
            La bodega del vecindario, ahora con beneficios. Delivery gratis,
            cashback en cada compra y precios que solo ven los Socios.
          </p>

          <ul className="mt-6 space-y-2.5">
            {QUICK_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm font-semibold text-white sm:text-base">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-inset ring-white/30">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-2">
            {["Desde S/ 19/mes", `${TRIAL_DAYS} días gratis`, "Sin permanencia"].map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-inset ring-white/20 backdrop-blur"
              >
                {chip}
              </span>
            ))}
          </div>

          {/* Prueba social */}
          <div className="mt-7 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["ER", "CP", "MT"].map((i) => (
                <span
                  key={i}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-[length:var(--ts-2xs)] font-black text-white ring-2 ring-[var(--accent-dark)]"
                >
                  {i}
                </span>
              ))}
            </div>
            <p className="text-sm font-semibold text-white/90">
              +800 vecinos ya son Socios
            </p>
          </div>
        </div>

        {/* ── Columna conversión ── */}
        <div className="relative w-full">
          {/* Bodeguero celebrando — asoma junto al carnet (solo desktop). */}
          <BodegueroCelebrando
            size={190}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-24 z-0 hidden text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.25)] xl:block"
          />
          <div className="relative z-10 rounded-3xl border border-white/40 bg-[var(--surface-raised)] p-5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:-translate-y-0.5 sm:p-6">
            {!isSocio && (
              <span className="absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--accent)] px-3.5 py-1 text-xs font-black text-white shadow-lg ring-2 ring-[var(--surface-raised)]">
                <Star className="h-3.5 w-3.5 fill-white" aria-hidden />
                El plan que más eligen
              </span>
            )}
            {/* Mini-carnet de Socio */}
            <div
              className="relative overflow-hidden rounded-2xl p-4 text-white"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--accent-dark) 0%, #0d3b3b 100%)",
              }}
            >
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/70">
                    Tarjeta de socio
                  </p>
                  <p className="mt-0.5 text-xl font-black leading-none tracking-tight">Buleje</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25">
                  <Star className="h-5 w-5 fill-white text-white" aria-hidden />
                </span>
              </div>
              <p className="relative mt-5 font-mono text-base font-semibold tracking-[0.25em] text-white/80">
                •••• •••• 2026
              </p>
              <div className="relative mt-2 flex items-center justify-between text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-white/60">
                <span>Vecino Socio</span>
                <span>Ciudad Constitución</span>
              </div>
            </div>

            {isSocio ? (
              <div className="mt-5">
                <SuccessAlert
                  title="Ya sos Socio Buleje"
                  description="Tus beneficios están activos. Revisa tu panel para ver el saldo de cashback."
                  action={
                    <PrimaryButton size="sm" asChild>
                      <Link href="/cuenta/socio-buleje">Ir al panel</Link>
                    </PrimaryButton>
                  }
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="text-sm font-bold text-[var(--text-primary)]">Elegí tu plan</p>
                <PlanSelector value={plan} onChange={setPlan} className="w-full" />
                <PrimaryButton
                  size="lg"
                  onClick={handleSubscribe}
                  loading={isSubmitting}
                  className="w-full justify-center"
                  rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
                >
                  Volverme Socio
                </PrimaryButton>
                <Link
                  href="#beneficios"
                  className="block text-center text-sm font-semibold text-[var(--accent)] hover:underline"
                >
                  Ver todos los beneficios
                </Link>
                <p className="text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  Sin tarjeta para el trial. Cancelás cuando quieras.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
