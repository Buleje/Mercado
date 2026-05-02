import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";
import AsistenteChat from "@/components/asistente/AsistenteChat";

export const metadata: Metadata = {
  title: "Asistente IA — Chat con el marketplace | Buleje",
  description:
    "Chat IA conectado a las bodegas de Pucallpa. Pregúntale por productos, precios, delivery y recetas. Respuestas naturales en segundos.",
};

export default function AsistentePage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Breadcrumbs */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3">
          <Breadcrumbs items={[{ label: "Asistente IA" }]} />
        </div>
      </div>

      {/* Hero compacto + Chat real */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
        <header className="text-center mb-6 sm:mb-8">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            IA conectada al marketplace
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Asistente Buleje
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--text-secondary)] max-w-xl mx-auto">
            Pregúntale lo que quieras sobre los productos del marketplace.
            Conecta con tiendas reales de Pucallpa y te recomienda al toque.
          </p>
        </header>

        {/* CHAT REAL — reemplaza la landing fake anterior */}
        <AsistenteChat />
      </section>

      {/* Features explicativas debajo del chat */}
      <section className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 space-y-6">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] text-center tracking-tight">
            ¿Qué puede hacer?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: "Buscar productos",
                body: "Te muestra qué tienda los vende, precio y rating en segundos.",
              },
              {
                title: "Recomendar",
                body: "¿Qué hago para parrilla? ¿Algo barato para la cena? Te tira ideas concretas.",
              },
              {
                title: "Resolver dudas",
                body: "Delivery, pagos Yape, horarios, devoluciones. Sin esperar a un vendedor.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-5"
              >
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <RelatedFeatures features={relatedFor("asistente")} />
    </div>
  );
}
