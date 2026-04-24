"use client";

import Link from "next/link";
import {
  Bot,
  MessageCircle,
  ArrowRight,
} from "@buleje/design-system/icons";
import { UnifiedHero } from "@/components/ui-system/UnifiedHero";
import { AsistenteBuleje } from "@/components/ui-system/illustrations/feature-identity";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

const EXAMPLE_QUESTIONS = [
  {
    q: "¿Este arroz es del bueno?",
    a: "Es arroz Paisana extra, el más pedido en Pucallpa. Grano largo, no se pasa.",
  },
  {
    q: "¿El paiche está fresco?",
    a: "Sí, la bodega lo recibió esta mañana del puerto. Ideal para ceviche o al horno.",
  },
  {
    q: "¿Cuánto tarda el delivery?",
    a: "45 a 90 minutos en zona Centro, Yarinacocha, Manantay y Calleria.",
  },
  {
    q: "¿Hay descuento por docena?",
    a: "Si el vendedor maneja mayorista, sí. Te confirmamos con la bodega.",
  },
];

export default function AsistentePage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3">
          <Breadcrumbs items={[{ label: "Asistente IA" }]} />
        </div>
      </div>

      {/* Hero migrado a UnifiedHero (variant 2col-right + CorazonLatiendo) */}
      <UnifiedHero
        kicker="Chat IA en lenguaje del barrio"
        title="Asistente Buleje"
        subtitle="Tu bot de confianza"
        description="Preguntale lo que quieras sobre los productos del marketplace: frescura, descuentos, usos, tiempos de llegada. Te respondo en segundos, como si hablaras con el vendedor de la bodega."
        trustChips={[
          "Responde en segundos",
          "Lenguaje del barrio",
          "Sin registro",
        ]}
        ctaPrimary={{
          label: "Probalo en cualquier producto",
          href: "/marketplace",
        }}
        illustration={AsistenteBuleje}
        illustrationSize={280}
        variant="2col-right"
        theme="accent-soft"
      />

      {/* Examples */}
      <section className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <header className="flex items-center gap-3 mb-8">
          <MessageCircle className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
          <h2 className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold text-[var(--text-primary)]">
            Ejemplos de conversación
          </h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXAMPLE_QUESTIONS.map((ex) => (
            <article
              key={ex.q}
              className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-5 space-y-3"
            >
              <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                Tú: {ex.q}
              </p>
              <div className="flex items-start gap-2 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/15 p-3">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-[length:var(--ts-sm)] text-[var(--text-primary)] leading-relaxed">
                  {ex.a}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[var(--rule-muted)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16 space-y-6">
          <h2 className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold text-[var(--text-primary)] text-center">
            ¿Cómo te ayuda?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Responde rápido", body: "Te contesta en segundos, no tienes que esperar al vendedor." },
              { title: "Conoce el producto", body: "Sabe frescura, usos, combinaciones y alternativas." },
              { title: "Te acompaña al carrito", body: "Si quieres, te sugiere agregar al tiro sin salir del chat." },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-canvas)] p-5 space-y-2"
              >
                <h3 className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)]">
                  {f.title}
                </h3>
                <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center pt-4">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 py-2.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Ir al marketplace
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <RelatedFeatures features={relatedFor("asistente")} />
    </div>
  );
}
