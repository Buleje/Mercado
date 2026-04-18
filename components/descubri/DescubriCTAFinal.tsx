"use client";

/**
 * DescubriCTAFinal — Hero horizontal con 3 CTAs principales + link al asistente.
 *
 * Mismo patron visual que VenderFinalCTA (fondo text-primary + CTA light)
 * pero con 3 caminos simultaneos.
 */

import Link from "next/link";
import { ArrowRight, Bot } from "@buleje/design-system/icons";
import { MapaUcayaliAutentico } from "@/components/ui-system/illustrations/pucallpa-locals";

type CTA = {
  slug: string;
  label: string;
  href: string;
  sublabel: string;
};

const CTAS: CTA[] = [
  {
    slug: "explorar",
    label: "Explorar tiendas",
    sublabel: "200+ bodegas del barrio",
    href: "/marketplace",
  },
  {
    slug: "socio",
    label: "Volverme Socio",
    sublabel: "30 días gratis",
    href: "/socio-buleje",
  },
  {
    slug: "vender",
    label: "Abrir mi tienda",
    sublabel: "Gratis el primer mes",
    href: "/vender",
  },
];

export function DescubriCTAFinal() {
  return (
    <section className="bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--text-primary)] px-6 py-12 text-[var(--surface-canvas)] sm:px-12 sm:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-5">
            <div className="space-y-7 lg:col-span-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">
                Empezá a explorar
              </p>
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Pucallpa y el Ucayali, a un toque de distancia
              </h2>
              <p className="max-w-lg text-sm opacity-85 sm:text-base">
                Elegí el camino que te queda. Explorá, suscribite o abrí tu
                tienda — las tres puertas están abiertas hoy.
              </p>

              <ul className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
                {CTAS.map((cta) => (
                  <li key={cta.slug}>
                    <Link
                      href={cta.href}
                      className="group inline-flex min-h-[56px] min-w-[200px] items-center justify-between gap-3 rounded-xl bg-[var(--surface-canvas)] px-5 py-3 text-[var(--text-primary)] transition-opacity hover:opacity-90"
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold sm:text-base">
                          {cta.label}
                        </span>
                        <span className="text-[11px] opacity-65">
                          {cta.sublabel}
                        </span>
                      </div>
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/asistente"
                className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 opacity-85 hover:opacity-100"
              >
                <Bot className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                ¿Tenés dudas? Preguntale al asistente
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>

            <div className="relative hidden items-center justify-center lg:flex lg:col-span-2">
              <div className="flex h-[260px] w-[260px] items-center justify-center rounded-3xl border border-[var(--surface-canvas)]/15 bg-[var(--surface-canvas)]/5">
                <MapaUcayaliAutentico
                  size={200}
                  strokeWidth={1.25}
                  className="text-[var(--surface-canvas)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DescubriCTAFinal;
