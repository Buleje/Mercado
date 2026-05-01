import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Store,
  Check,
  ChevronDown,
  ArrowUpRight,
  Zap,
  Shield,
  BarChart3,
  Smartphone,
  Users,
  TrendingUp,
} from "@buleje/design-system/icons";

const LandingHeader = dynamic(
  () => import("@/components/landing/LandingHeader"),
  { ssr: true },
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });

export const metadata: Metadata = {
  title: "Abre tu tienda | Buleje — Planes y precios para bodegas",
  description:
    "Vende online con Buleje. Planes desde S/0 al mes, sin comisiones escondidas, sin permanencia. Empieza gratis hoy.",
  alternates: { canonical: "/abrir-tienda" },
  openGraph: {
    title: "Abre tu tienda — Buleje",
    description:
      "Planes transparentes para bodegas del Perú. Empieza gratis, crecé sin límites.",
    type: "website",
  },
};

const BENEFITS = [
  {
    icon: Zap,
    title: "Lista en 5 minutos",
    desc: "Subes tu catálogo y ya puedes vender. Sin código, sin técnicos, sin complicaciones.",
  },
  {
    icon: Shield,
    title: "Sin permanencia",
    desc: "Cancelás cuando quieras. Sin contratos, sin cargos ocultos, sin letra chica.",
  },
  {
    icon: BarChart3,
    title: "Reportes reales",
    desc: "Sabes qué vende, a qué hora, a quién. Decisiones basadas en datos, no en corazonada.",
  },
  {
    icon: Smartphone,
    title: "Tu celular es tu POS",
    desc: "Vendes desde el mostrador con el celular. Imprime boletas, cobra con Yape.",
  },
  {
    icon: Users,
    title: "Miles de clientes cerca",
    desc: "Aparecés en el marketplace de Buleje. Miles de vecinos ya buscan lo que vendes.",
  },
  {
    icon: TrendingUp,
    title: "Delivery integrado",
    desc: "Configurás tus zonas, precios y repartidores. Todo se coordina automático.",
  },
];

const PLANS = [
  {
    name: "Gratis",
    price: "S/ 0",
    period: "/mes",
    description: "Ideal para empezar sin riesgo",
    highlighted: false,
    cta: "Comenzar gratis",
    href: "/marketplace/registrar",
    features: [
      "Hasta 50 productos",
      "Tienda online básica",
      "POS digital (punto de venta)",
      "Reportes básicos de ventas",
      "Gestión de clientes",
      "Soporte por WhatsApp",
    ],
  },
  {
    name: "Pro",
    price: "S/ 49",
    period: "/mes",
    description: "Para bodegas que quieren crecer",
    highlighted: true,
    cta: "Empezar con Pro",
    href: "/marketplace/registrar?plan=pro",
    features: [
      "Productos ilimitados",
      "Tienda online personalizada",
      "POS digital avanzado",
      "Reportes avanzados con gráficos",
      "Facturación SUNAT (boletas + facturas)",
      "Delivery integrado con zonas",
      "Fiado digital con recordatorios",
      "Control de inventario FEFO",
      "Alertas de stock bajo",
      "Soporte prioritario",
    ],
  },
  {
    name: "Enterprise",
    price: "A medida",
    period: "",
    description: "Cadenas y operaciones grandes",
    highlighted: false,
    cta: "Contactar ventas",
    href: "/marketplace/registrar?plan=enterprise",
    features: [
      "Todo lo de Pro incluido",
      "Multi-sucursal ilimitado",
      "API personalizada y webhooks",
      "Integración con ERP existente",
      "SLA 99.9% uptime",
      "Onboarding premium con capacitación",
      "Dashboard ejecutivo con KPIs",
      "Predicción de demanda con IA",
      "Dominio personalizado / white-label",
      "Soporte 24/7 por teléfono",
    ],
  },
];

const FAQS = [
  {
    q: "¿Puedo cambiar de plan después?",
    a: "Sí. Subes o bajás de plan cuando quieras. Los cambios se aplican al siguiente ciclo de facturación.",
  },
  {
    q: "¿Hay contrato o permanencia mínima?",
    a: "No. Todos los planes son mensuales y puedes cancelar cuando quieras sin penalidades.",
  },
  {
    q: "¿El plan Gratis tiene límite de tiempo?",
    a: "No. Es para siempre. Solo tiene límite de 50 productos. Si creces, subes al Pro.",
  },
  {
    q: "¿Qué métodos de pago aceptan para la suscripción?",
    a: "Yape, Plin, transferencia bancaria y tarjeta de crédito/débito vía Stripe.",
  },
  {
    q: "¿La facturación SUNAT tiene costo adicional?",
    a: "No, está incluida en el plan Pro. Generas boletas y facturas electrónicas directo desde Buleje.",
  },
  {
    q: "¿Incluye soporte técnico?",
    a: "Sí. Gratis: WhatsApp. Pro: WhatsApp prioritario. Enterprise: 24/7 por teléfono.",
  },
];

export default function AbrirTiendaPage() {
  return (
    <>
      <LandingHeader />
      <main id="main-content">
        {/* ── Hero editorial ──────────────────────────────────────────────── */}
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
              {/* Columna izquierda — título dramático */}
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                  />
                  <Store className="h-4 w-4" strokeWidth={2} />
                  Para bodegueros
                </p>
                <h1 className="text-[clamp(2.75rem,7.5vw,5.5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
                  Abre tu tienda,
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    vende más.
                  </span>
                </h1>
                <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
                  Miles de vecinos buscan lo que tú vendes. Sube tu catálogo en{" "}
                  <span className="text-[var(--text-primary)] font-bold">
                    5 minutos
                  </span>{" "}
                  y empieza a recibir pedidos hoy mismo.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Link
                    href="/marketplace/registrar"
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg shadow-black/5 hover:bg-[var(--accent)] hover:gap-3 transition-all"
                  >
                    Comenzar gratis
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={2.25}
                    />
                  </Link>
                  <a
                    href="#planes"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                  >
                    Ver planes
                  </a>
                </div>
                <p className="mt-5 text-sm text-[var(--text-tertiary)]">
                  Sin tarjeta · Sin contrato · Cancela cuando quieras
                </p>
              </div>

              {/* Columna derecha — trust stats asimétrico */}
              <div className="relative">
                <div className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 sm:p-10">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-8">
                    En números — 2026
                  </p>
                  <div className="space-y-8">
                    {[
                      { value: "120+", label: "Bodegas ya vendiendo en Buleje" },
                      { value: "5 min", label: "Estás online desde el registro" },
                      { value: "4.8", label: "Satisfacción promedio ★★★★★" },
                      { value: "0%", label: "Comisión en el plan Gratis" },
                    ].map(({ value, label }, idx) => (
                      <div
                        key={label}
                        className={`flex items-baseline gap-5 ${idx > 0 ? "pt-6 border-t border-[var(--rule-soft)]" : ""}`}
                      >
                        <span className="text-[clamp(2.5rem,5vw,3.75rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none w-[5ch] shrink-0">
                          {value}
                        </span>
                        <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
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

        {/* ── Beneficios editorial ───────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 sm:mb-20">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                  />
                  Qué obtenés
                </p>
                <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  Todo para vender,
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    en un solo lugar.
                  </span>
                </h2>
              </div>
              <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
                Seis herramientas que reemplazan cuaderno, calculadora, Excel,
                WhatsApp y más — todas en tu celular.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden">
              {BENEFITS.map(({ icon: Icon, title, desc }, idx) => (
                <div
                  key={title}
                  className="group relative bg-[var(--surface-raised)] p-8 sm:p-10 transition-colors hover:bg-[var(--surface-canvas)]"
                >
                  <span
                    aria-hidden
                    className="absolute top-5 right-6 text-xs font-bold tabular-nums text-[var(--text-tertiary)] tracking-wider"
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] mb-6">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <h3 className="text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent)] transition-colors">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Planes editorial ────────────────────────────────────────────── */}
        <section
          id="planes"
          className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)] scroll-mt-20"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 sm:mb-18">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                  />
                  Planes mensuales
                </p>
                <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  Empieza gratis.
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    Crecé sin límites.
                  </span>
                </h2>
              </div>
              <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
                Sin costos ocultos, sin letra chica. Cambiás de plan cuando quieras
                o cancelás sin penalidad.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl p-6 sm:p-7 flex flex-col transition-all duration-300 ${
                    plan.highlighted
                      ? "bg-[var(--surface-raised)] border-2 border-[var(--accent)] shadow-xl shadow-[var(--accent)]/10 md:-mt-4 md:mb-4"
                      : "bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:border-[var(--rule-base)]"
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-white text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-md">
                      Más popular
                    </span>
                  )}

                  {/* Header */}
                  <div className="mb-5">
                    <h3 className="text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                      {plan.description}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mb-5 pb-5 border-b border-[var(--rule-soft)]">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-[clamp(2.25rem,4.5vw,3rem)] font-black tabular-nums tracking-[-0.025em] leading-none ${
                          plan.highlighted
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-sm font-semibold text-[var(--text-tertiary)]">
                          {plan.period}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="flex-1 space-y-3 mb-6">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]"
                      >
                        <Check
                          className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-[var(--accent)]" : "text-[var(--data-success)]"}`}
                          strokeWidth={2.5}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    href={plan.href}
                    className={`block text-center font-bold py-3 rounded-xl transition-all ${
                      plan.highlighted
                        ? "bg-[var(--accent)] text-white hover:opacity-90 shadow-md"
                        : "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center text-sm text-[var(--text-tertiary)]">
              Plan Gratis sin límite de tiempo · Sube a Pro cuando tu negocio crezca
            </p>
          </div>
        </section>

        {/* ── FAQ editorial ───────────────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
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
                Todo lo que
                <br />
                <span className="italic font-serif text-[var(--accent)]">
                  quieres saber.
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

        {/* ── Final CTA editorial ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)]">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
          />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Última llamada
            </p>
            <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
              Tu bodega también
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                puede vender online.
              </span>
            </h2>
            <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
              Empieza gratis, sin tarjeta. En 5 minutos estás recibiendo pedidos.
            </p>
            <div className="mt-12 flex flex-wrap justify-center gap-3">
              <Link
                href="/marketplace/registrar"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
              >
                <Store className="h-4 w-4" strokeWidth={1.75} />
                Abrir mi tienda gratis
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.25}
                />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
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
