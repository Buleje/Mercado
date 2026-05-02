import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Store, ChevronDown, ArrowUpRight } from "@buleje/design-system/icons";

const LandingHeader = dynamic(
  () => import("@/components/landing/LandingHeader"),
  { ssr: true },
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
// RoiCalculator REMOVIDO (Brandon mayo 2026): prometía cifras que no
// se pueden garantizar. Reemplazado por HowItChanges — comparación
// concreta del día a día sin uplifts mágicos.
const HowItChanges = dynamic(
  () => import("@/components/landing/abrir-tienda/HowItChanges"),
  { loading: () => <SectionSkeleton h="600px" /> },
);
const BenefitsTabs = dynamic(
  () => import("@/components/landing/abrir-tienda/BenefitsTabs"),
  { loading: () => <SectionSkeleton h="600px" /> },
);
const PlansToggle = dynamic(
  () => import("@/components/landing/abrir-tienda/PlansToggle"),
  { loading: () => <SectionSkeleton h="700px" /> },
);
const LiveSignupTicker = dynamic(
  () => import("@/components/landing/abrir-tienda/LiveSignupTicker"),
);

export const metadata: Metadata = {
  title: "Activá tu tienda online | Buleje — Plataforma todo-en-uno",
  description:
    "Más clientes, más pedidos, cero tecnología. Plan Estándar con primer mes gratis · Sin tarjeta · Sin contrato. Cancelás cuando quieras.",
  alternates: { canonical: "/abrir-tienda" },
  openGraph: {
    title: "Activá tu tienda online | Buleje",
    description:
      "Plataforma todo-en-uno para que tu negocio venda online en 5 minutos.",
    type: "website",
  },
};

const FAQS = [
  {
    q: "¿Cuánto tarda el setup?",
    a: "5 minutos. Subís logo, catálogo y horarios. Te ayudamos por WhatsApp si querés.",
  },
  {
    q: "¿Puedo cambiar de plan después?",
    a: "Sí. Subís o bajás de plan cuando quieras. Los cambios se aplican al siguiente ciclo de facturación.",
  },
  {
    q: "¿Hay contrato o permanencia mínima?",
    a: "No. Todos los planes son sin permanencia. Cancelás con un click cuando quieras.",
  },
  {
    q: "¿Necesito tarjeta de crédito para registrarme?",
    a: "No. Empezás con Yape o efectivo y migrás a tarjeta cuando quieras.",
  },
  {
    q: "¿Qué pasa con mis datos si dejo de usarlo?",
    a: "Te llevás todo exportado en CSV: clientes, pedidos, productos, reportes. Tus datos son tuyos.",
  },
  {
    q: "¿Tienen soporte humano?",
    a: "Sí. Respondemos en menos de 2 horas por WhatsApp. Sin bots, sin formularios. Personas reales.",
  },
];

function SectionSkeleton({ h = "400px" }: { h?: string }) {
  return (
    <div
      aria-hidden
      style={{ height: h }}
      className="bg-[var(--surface-sunken)] animate-pulse"
    />
  );
}

export default function AbrirTiendaPage() {
  return (
    <>
      <LandingHeader minimal />
      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
          />

          <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-end">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                  />
                  <Store className="h-4 w-4" strokeWidth={2} />
                  Plataforma todo-en-uno
                </p>
                {/* H1 reducido: antes clamp(2.75,7.5vw,5.5rem) aplastaba la
                    jerarquía y dejaba el subtítulo sin aire. Bajo a 4rem max. */}
                <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  Activá tu tienda
                  <br />
                  <span className="text-[var(--accent)]">
                    online en 5 minutos.
                  </span>
                </h1>
                <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.45] max-w-2xl">
                  Catálogo, pagos Yape, delivery y reportes — todo listo para
                  que vendás hoy. Sin código, sin técnicos, sin contratos.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Link
                    href="/marketplace/registrar"
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-8 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
                  >
                    Activar gratis por 1 mes
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={2.5}
                    />
                  </Link>
                  <a
                    href="#planes"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-8 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    Ver planes
                  </a>
                </div>

                <div className="mt-6">
                  <LiveSignupTicker />
                </div>
              </div>

              {/* Trust card */}
              <div className="relative">
                <div className="rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 sm:p-10 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-8">
                    Garantías Buleje
                  </p>
                  <div className="space-y-7">
                    {[
                      { value: "S/ 0", label: "Comisión los primeros 90 días" },
                      { value: "5 min", label: "Estás vendiendo desde el registro" },
                      // Mayo 2026: "+42% ventas promedio" eliminado tras
                      // designer audit. No tenemos datos reales para sustentarlo;
                      // reemplazado por feature concreta y verificable.
                      { value: "Yape · Plin", label: "Cobrás como ya cobrás" },
                      { value: "24/7", label: "Soporte humano por WhatsApp" },
                    ].map(({ value, label }, idx) => (
                      <div
                        key={label}
                        className={`flex items-baseline gap-5 ${idx > 0 ? "pt-5 border-t border-[var(--rule-soft)]" : ""}`}
                      >
                        <span className="text-[clamp(2rem,4.5vw,3rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--accent)] leading-none w-[5ch] shrink-0">
                          {value}
                        </span>
                        <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug font-medium">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Cómo cambia tu día con Buleje (sin promesas mágicas) ──── */}
        <HowItChanges />

        {/* ── Beneficios con tabs interactivas ───────────────────────── */}
        <BenefitsTabs />

        {/* ── Plans con toggle mensual/anual ─────────────────────────── */}
        <PlansToggle />

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                <span
                  aria-hidden
                  className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                />
                Preguntas
              </p>
              <h2 className="text-[clamp(2.25rem,5.5vw,3.75rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                Resuelve tus dudas
                <br />
                <span className="text-[var(--accent)]">
                  antes de empezar.
                </span>
              </h2>
              <p className="mt-6 text-base text-[var(--text-secondary)] leading-relaxed">
                Respuestas directas, sin jerga técnica ni letra chica.
              </p>
            </div>
            <div>
              <ul className="divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]">
                {FAQS.map((f, idx) => (
                  <li key={f.q}>
                    <details className="group">
                      <summary className="flex cursor-pointer items-start justify-between gap-6 py-6 list-none [&::-webkit-details-marker]:hidden">
                        <span className="flex items-start gap-5">
                          <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)] uppercase tracking-wider mt-1.5">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="text-lg sm:text-xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] group-open:text-[var(--accent)] transition-colors">
                            {f.q}
                          </span>
                        </span>
                        <ChevronDown
                          className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] group-open:rotate-180 group-open:text-[var(--accent)] transition-all duration-200"
                          strokeWidth={2}
                        />
                      </summary>
                      <div className="pb-6 pl-12 pr-4">
                        <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                          {f.a}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-canvas)]">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
          />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Última llamada
            </p>
            {/* Heading reducido: antes 5rem en 3 líneas competía con el CTA.
                Ahora clamp 4rem max + 2 líneas exactas. */}
            <h2 className="text-[clamp(2.25rem,5.5vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95] max-w-3xl mx-auto">
              Tu negocio merece <span className="text-[var(--accent)]">vender más</span>.
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
              5 minutos para activarlo. Sin tarjeta, sin compromiso. En la primera
              semana ya estás vendiendo.
            </p>
            <div className="mt-8 flex justify-center">
              <LiveSignupTicker />
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/marketplace/registrar"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-8 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                <Store className="h-4 w-4" strokeWidth={2.25} />
                Activar gratis por 1 mes
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.5}
                />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-8 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
