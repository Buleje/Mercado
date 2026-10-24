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
import { ArrowRight, Check, Sparkles, Star, Crown } from "@buleje/design-system/icons";
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
            {/* Carnet de Socio — tarjeta premium con chip, greca amazónica y brillo */}
            <div
              className="relative aspect-[1.62/1] overflow-hidden rounded-2xl p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
              style={{
                backgroundImage:
                  "linear-gradient(125deg, var(--accent) 0%, var(--accent-dark) 42%, #0b3838 100%)",
              }}
            >
              {/* Patrón greca (identidad shipibo, sutil) */}
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10]"
                preserveAspectRatio="none"
                viewBox="0 0 220 130"
              >
                <defs>
                  <pattern id="socio-greca" width="26" height="26" patternUnits="userSpaceOnUse">
                    <path d="M0 13h6.5V6.5H13V13h6.5v6.5H13V26H6.5v-6.5H0z" fill="none" stroke="#fff" strokeWidth="1.3" />
                  </pattern>
                </defs>
                <rect width="220" height="130" fill="url(#socio-greca)" />
              </svg>
              {/* Brillo diagonal */}
              <div aria-hidden className="pointer-events-none absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

              <div className="relative flex h-full flex-col justify-between">
                {/* Top: marca + tier */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25">
                      <Crown className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/65">Tarjeta Socio</p>
                      <p className="text-lg font-black leading-none tracking-tight">Buleje</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ring-1 ring-inset ring-white/25">
                    Socio
                  </span>
                </div>

                {/* Chip + número */}
                <div className="flex items-center gap-3">
                  <span className="relative h-7 w-10 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-amber-200 to-amber-400 shadow-sm ring-1 ring-inset ring-amber-500/40">
                    <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-amber-700/40" />
                    <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-amber-700/40" />
                  </span>
                  <p className="font-mono text-sm font-semibold tracking-[0.28em] text-white/90 sm:text-base">
                    ••••&nbsp;2026
                  </p>
                </div>

                {/* Bottom: titular + validez */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/55">Titular</p>
                    <p className="text-sm font-bold tracking-wide">Vecino Socio</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/55">Ciudad Constitución</p>
                    <p className="text-xs font-semibold text-white/80">Válida 2026</p>
                  </div>
                </div>
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
