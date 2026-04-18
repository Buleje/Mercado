"use client";

/**
 * DescubriHero — Hero editorial del hub `/descubri`.
 *
 * Layout 2-col asimetrico:
 *   - Izquierda: kicker + h1 grande + subtitulo + chips + CTAs
 *   - Derecha: collage de 4 ilustraciones en grid asimetrico
 *     (BodegueroCelebrando + DoniaElena + MapaUcayaliAutentico + PedidoLlegando)
 *
 * Copy: "Descubrí todo lo que Buleje puede hacer por tu hogar"
 */

import Link from "next/link";
import {
  PageTitle,
  BodyText,
  Kicker,
  Chip,
  PrimaryButton,
} from "@buleje/design-system";
import { ArrowRight, Sparkles } from "@buleje/design-system/icons";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import {
  DoniaElena,
  MapaUcayaliAutentico,
} from "@/components/ui-system/illustrations/pucallpa-locals";
import { PedidoLlegando } from "@/components/ui-system/illustrations/empty-states";

export function DescubriHero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24">
      {/* Soft accent radial de fondo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          background:
            "radial-gradient(55% 40% at 80% 25%, color-mix(in oklch, var(--accent) 14%, transparent) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          {/* ── Izq: texto + CTAs ── */}
          <div className="space-y-7">
            <Kicker className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Descubrí Buleje
            </Kicker>

            <PageTitle className="text-[length:var(--ts-3xl)] sm:text-[length:var(--ts-4xl)] lg:text-[length:var(--ts-5xl)]">
              Descubrí todo lo que{" "}
              <span className="text-[var(--accent)]">Buleje</span> puede hacer
              por tu hogar
            </PageTitle>

            <BodyText className="max-w-xl text-[length:var(--ts-base)] sm:text-[length:var(--ts-lg)] text-[var(--text-secondary)] leading-relaxed">
              Pucallpa y el Ucayali, ahora en una sola app. De la bodega del
              barrio al mundo digital — todo lo que necesitás para tu casa,
              tu bodega y tu familia.
            </BodyText>

            <ul className="flex flex-wrap gap-2">
              <li>
                <Chip active>10 features nuevas</Chip>
              </li>
              <li>
                <Chip>Gratis</Chip>
              </li>
              <li>
                <Chip>Pucallpa</Chip>
              </li>
            </ul>

            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton
                size="lg"
                asChild
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
              >
                <Link href="#features-principales">Ver features</Link>
              </PrimaryButton>
              <PrimaryButton size="lg" variant="secondary" asChild>
                <Link href="/marketplace">Ir al marketplace</Link>
              </PrimaryButton>
            </div>
          </div>

          {/* ── Der: collage 4 ilustraciones asimetrico ── */}
          <div className="relative hidden lg:block h-[520px]">
            {/* BodegueroCelebrando — top-left (featured, grande) */}
            <div
              className="absolute left-0 top-0 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6"
              style={{
                boxShadow:
                  "0 1px 2px color-mix(in oklch, var(--text-primary) 8%, transparent)",
              }}
            >
              <BodegueroCelebrando
                size={200}
                strokeWidth={1.4}
                className="text-[var(--text-primary)]"
              />
            </div>

            {/* DoniaElena — top-right (mediano) */}
            <div
              className="absolute right-0 top-8 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5"
              style={{
                boxShadow:
                  "0 1px 2px color-mix(in oklch, var(--text-primary) 6%, transparent)",
              }}
            >
              <DoniaElena
                size={160}
                strokeWidth={1.4}
                className="text-[var(--text-primary)]"
              />
            </div>

            {/* MapaUcayaliAutentico — bottom-left (mediano) */}
            <div
              className="absolute left-12 bottom-12 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5"
              style={{
                boxShadow:
                  "0 1px 2px color-mix(in oklch, var(--text-primary) 6%, transparent)",
              }}
            >
              <MapaUcayaliAutentico
                size={150}
                strokeWidth={1.4}
                className="text-[var(--text-primary)]"
              />
            </div>

            {/* PedidoLlegando — bottom-right (pequeno) */}
            <div
              className="absolute right-8 bottom-0 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
              style={{
                boxShadow:
                  "0 1px 2px color-mix(in oklch, var(--text-primary) 8%, transparent)",
              }}
            >
              <PedidoLlegando
                size={140}
                strokeWidth={1.4}
                className="text-[var(--text-primary)]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DescubriHero;
