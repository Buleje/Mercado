"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MapaUcayaliAutentico, MotorizadoUcayali } from "@/components/ui-system/illustrations/pucallpa-locals";
import { CanastaVacia, PedidoLlegando } from "@/components/ui-system/illustrations/empty-states";

/**
 * "Como funciona" en 3 pasos con ilustracion grande (200-240px) alternando lados.
 * Kicker numerico teal (01/02/03), cada paso como card del DS.
 * Mantiene GSAP scroll reveal para movimiento editorial.
 */

type StepSide = "left" | "right";

interface Step {
  kicker: string; // "01", "02", "03"
  title: string;
  desc: string;
  illustration: "mapa" | "canasta" | "moto" | "pedido";
  side: StepSide;
}

const STEPS: Step[] = [
  {
    kicker: "01",
    title: "Elegí tu bodega",
    desc: "Explora bodegas cerca tuyo en Pucallpa. Filtra por categoría, rating o cercanía — todas verificadas, con delivery en tu zona.",
    illustration: "mapa",
    side: "left",
  },
  {
    kicker: "02",
    title: "Armá tu canasta",
    desc: "Agregá lo que necesitás al carrito: abarrotes, frescos, bebidas, limpieza. Combiná productos de una o varias tiendas.",
    illustration: "canasta",
    side: "right",
  },
  {
    kicker: "03",
    title: "Recibilo en 25 min",
    desc: "El repartidor te lo lleva a la puerta. Pagás al recibir con Yape, Plin o efectivo. Seguí el pedido en vivo desde tu celular.",
    illustration: "moto",
    side: "left",
  },
];

function StepIllustration({ kind, className }: { kind: Step["illustration"]; className?: string }) {
  const common = { size: 220, strokeWidth: 1.5, className } as const;
  if (kind === "mapa") return <MapaUcayaliAutentico {...common} />;
  if (kind === "canasta") return <CanastaVacia {...common} />;
  if (kind === "moto") return <MotorizadoUcayali {...common} />;
  return <PedidoLlegando {...common} />;
}

export default function ScrollyHowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let cleanup: (() => void) | undefined;

    import("gsap").then(({ gsap }) => {
      import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
        gsap.registerPlugin(ScrollTrigger);
        const steps = stepsRef.current.filter(Boolean);

        const triggers = steps.map((el) =>
          gsap.fromTo(
            el,
            { opacity: 0.3, y: 32 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: "power2.out",
              scrollTrigger: {
                trigger: el,
                start: "top 80%",
                end: "top 50%",
                scrub: 0.6,
              },
            },
          ),
        );

        cleanup = () => {
          triggers.forEach((t) => t.scrollTrigger?.kill());
        };
      });
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="como-funciona-title"
      className="relative py-20 sm:py-24 bg-[var(--surface-canvas)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="text-center mb-14">
          <span className="inline-block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            Así de simple
          </span>
          <h2
            id="como-funciona-title"
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[var(--text-primary)] tracking-tight"
          >
            ¿Cómo funciona?
          </h2>
          <p className="mt-3 text-[var(--text-secondary)] max-w-xl mx-auto">
            3 pasos y tu pedido está en la puerta de tu casa.
          </p>
        </div>

        {/* Pasos con layout split alternando */}
        <div className="space-y-16 sm:space-y-20">
          {STEPS.map((step, i) => (
            <div
              key={step.kicker}
              ref={(el) => {
                if (el) stepsRef.current[i] = el;
              }}
              className={cn(
                "grid md:grid-cols-[1fr_auto_1fr] items-center gap-8 md:gap-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 sm:p-10",
                step.side === "right" && "md:grid-flow-col-dense",
              )}
            >
              {/* Ilustracion */}
              <div
                className={cn(
                  "flex items-center justify-center",
                  step.side === "left" ? "md:order-1" : "md:order-3",
                )}
              >
                <StepIllustration
                  kind={step.illustration}
                  className="text-[var(--text-secondary)] opacity-80"
                />
              </div>

              {/* Separador visual (solo desktop) */}
              <div className="hidden md:block md:order-2 self-stretch w-px bg-[var(--rule-soft)]" aria-hidden="true" />

              {/* Copy */}
              <div
                className={cn(
                  "max-w-md",
                  step.side === "left" ? "md:order-3" : "md:order-1 md:text-right",
                )}
              >
                <span className="block font-extrabold text-[var(--accent)] leading-none tabular-nums tracking-tighter text-5xl sm:text-6xl">
                  {step.kicker}
                </span>
                <h3 className="mt-3 text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
