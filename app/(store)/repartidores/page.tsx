import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, MapPin, Wallet, Clock } from "@buleje/design-system/icons";
export const metadata: Metadata = {
  title: "Manejá tu propia ruta — Repartidores",
  description:
    "Cumplí con bodegas de tu zona. Horarios flexibles, pagos diarios, app simple.",
  alternates: {
    canonical: "https://www.buleje.pe/repartidores",
  },
  openGraph: {
    title: "Repartidores — Manejá tu propia ruta",
    description: "Horarios flexibles, pagos diarios, ruta corta en tu zona.",
    url: "https://www.buleje.pe/repartidores",
    type: "website",
    locale: "es_PE",
  },
};

export default function RepartidoresPage() {
  return (
    <main id="main-content">
      {/* Hero */}
      <section
        aria-label="Maneja tu propia ruta"
        className="relative overflow-hidden bg-[var(--surface-canvas)]"
      >
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Para repartidores
            </p>

            <h1 className="text-[clamp(2.5rem,6.5vw,4.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.95] text-balance">
              Manejá tu propia ruta.{" "}
              <br />
              <span className="text-[var(--accent)]">
                Cobrá lo que te toca.
              </span>
            </h1>

            <p className="mt-6 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
              Bodegas de tu zona te asignan pedidos cortos. Tú eliges cuándo
              sales, qué tan cerca trabajas y cómo cobras. Sin patrón, sin
              horario fijo.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/marketplace/repartidor"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Quiero repartir
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
            </div>

            <p className="mt-6 text-sm text-[var(--text-tertiary)]">
              Sin requisitos imposibles · Cobrás semanal · App liviana en español
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        aria-label="Por qué repartir con Buleje"
        className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
      >
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                Icon: MapPin,
                title: "Ruta corta en tu zona",
                desc: "Solo vas a bodegas cercanas. Nada de cruzar la ciudad por un pedido de S/15.",
              },
              {
                Icon: Wallet,
                title: "Pago semanal a tu Yape",
                desc: "Sin esperas, sin descuentos sorpresa. Lo que sumaste, lo cobras.",
              },
              {
                Icon: Clock,
                title: "Horario que tú eliges",
                desc: "Conectás cuando puedes. Sin turnos obligatorios, sin penalizaciones.",
              },
            ].map(({ Icon, title, desc }, i) => (
              <div
                key={i}
                className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-3xl p-8"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] mb-5">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <h3 className="text-xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)]">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
        />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white mb-6">
            <Bike className="h-7 w-7" strokeWidth={2} />
          </span>
          <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[1.0]">
            Empieza a repartir hoy.
          </h2>
          <p className="mt-6 text-xl text-[var(--text-secondary)] max-w-xl mx-auto leading-[1.4]">
            Te validamos en menos de 24 horas. Si tú cumplís con bodegas de
            tu zona, te asignamos pedidos esa misma semana.
          </p>
          <div className="mt-10">
            <Link
              href="/marketplace/repartidor"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
            >
              Quiero repartir con Buleje
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
