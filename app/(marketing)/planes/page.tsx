import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Sparkles, ShieldCheck, MessageCircle } from "@buleje/design-system/icons";

// touch: force Turbopack to recompile after removing duplicate redirect.
export const metadata: Metadata = {
  title: "Planes y precios | Buleje",
  description:
    "Plan Free para empezar gratis. Starter desde S/89/mes. Pro desde S/179/mes. Business desde S/349/mes. Cancela cuando quieras. Sin tarjeta.",
  alternates: { canonical: "/planes" },
  openGraph: {
    title: "Planes y precios | Buleje",
    description:
      "Empezá gratis, pagá solo si lo amás. 15 días de prueba sin tarjeta de crédito.",
    type: "website",
    locale: "es_PE",
  },
};

interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: string;
  period: string;
  cta: string;
  ctaHref: string;
  features: string[];
  highlight?: boolean;
}

// Alineado 1:1 con lib/billing/plan-tiers.ts (mayo 2026 v2).
// IDs internos (PlanId DB): free / pro / business / enterprise
// que mapean a labels: Free / Starter / Pro / Business
const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Prueba Buleje sin tarjeta · siempre gratis",
    price: "S/ 0",
    period: "/mes",
    cta: "Empezar gratis",
    ctaHref: "/marketplace/registrar?plan=free",
    features: [
      "Tienda online básica · sin tarjeta",
      "Hasta 20 productos cargados",
      "Hasta 30 pedidos al mes",
      "Pedidos por WhatsApp + POS básico",
      "Sin compromiso · upgrade cuando quieras",
    ],
  },
  {
    id: "pro",
    name: "Starter",
    tagline: "Para bodegas con flujo diario que quieren crecer",
    price: "S/ 89",
    period: "/mes",
    cta: "Probar gratis 1 mes",
    ctaHref: "/marketplace/registrar?plan=pro",
    features: [
      "Productos ilimitados · 1 admin",
      "Inventario, clientes y fiados completos",
      "Yape automatico + pedidos WhatsApp",
      "Tu marca en tu storefront · sin Buleje",
      "Primer mes gratis · sin tarjeta",
    ],
  },
  {
    id: "business",
    name: "Pro",
    tagline: "Sweet spot: bodega establecida que ya vende online",
    price: "S/ 179",
    period: "/mes",
    cta: "Elegir Pro",
    ctaHref: "/marketplace/registrar?plan=business",
    features: [
      "Productos ilimitados · 2 sucursales · 5 admins",
      "Facturacion SUNAT + cotizaciones + guias",
      "Promociones, fidelizacion y chat con clientes",
      "Aparece destacado en el marketplace cross-store",
      "Prestamos, scoring, recetas y compras a proveedor",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Business",
    tagline: "Cadenas, productores y mayoristas · sin limites",
    price: "S/ 349",
    period: "/mes",
    cta: "Hablar con un experto",
    ctaHref: "/marketplace/registrar?plan=enterprise",
    features: [
      "Sucursales, repartidores y admins ilimitados",
      "Forecasting IA + sugerencias automaticas",
      "Lives streaming + ventas en vivo",
      "Membresias, gift cards y suscripciones",
      "Soporte 24/7 por WhatsApp con account manager",
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "¿Necesito tarjeta de crédito para empezar?",
    a: "No. Te registrás con tu nombre y WhatsApp. La prueba de 15 días arranca sola y no se renueva sin tu confirmación.",
  },
  {
    q: "¿Qué pasa cuando termina la prueba?",
    a: "El panel queda en modo lectura — tus datos siguen seguros. Cuando elegís un plan, recuperás todo el acceso al instante.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Sin permanencia ni letra chica. Si cancelás, mantenés acceso hasta fin del periodo facturado.",
  },
  {
    q: "¿Aceptan Yape o efectivo?",
    a: "Sí. Pagás con Yape, transferencia bancaria, tarjeta de crédito o Mercado Pago — el medio que prefieras.",
  },
  {
    q: "¿Puedo migrar mis datos si ya uso otro sistema?",
    a: "Sí. Tenemos importador CSV de productos, clientes y proveedores. El equipo te ayuda en el onboarding del plan Business.",
  },
];

export default function PlanesPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <Sparkles className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.25} />
            Planes y precios
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Empezá gratis. Pagá cuando estés listo.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--text-secondary)]">
            15 días de prueba completa sin tarjeta. Cancelás cuando quieras.
            Sin permanencia ni letra chica.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <TrustBadge
            icon={<ShieldCheck className="h-5 w-5" strokeWidth={2.25} />}
            text="Sin tarjeta para probar"
          />
          <TrustBadge
            icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />}
            text="Cancelás cuando quieras"
          />
          <TrustBadge
            icon={<MessageCircle className="h-5 w-5" strokeWidth={2.25} />}
            text="Soporte WhatsApp 7 días"
          />
        </div>
      </section>

      <section className="border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 transition-colors open:border-[var(--accent)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-[var(--text-primary)]">
                  {item.q}
                  <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-open:rotate-90" strokeWidth={2.25} />
                </summary>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          ¿Listo para empezar?
        </h2>
        <p className="mt-3 text-base text-[var(--text-secondary)]">
          Abre tu tienda en 5 minutos. Sin tarjeta, sin permanencia.
        </p>
        <Link
          href="/marketplace/registrar"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
        >
          Crear mi tienda
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      </section>
    </main>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative rounded-2xl border-2 p-6 ${
        plan.highlight
          ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-lg"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
          Más elegido
        </span>
      )}
      <h3 className="text-xl font-extrabold text-[var(--text-primary)]">{plan.name}</h3>
      <p className="mt-1 text-sm font-semibold text-[var(--text-tertiary)]">{plan.tagline}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold text-[var(--text-primary)]">{plan.price}</span>
        <span className="text-base font-semibold text-[var(--text-tertiary)]">{plan.period}</span>
      </div>
      <ul className="mt-6 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-500)]" strokeWidth={2.25} />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={plan.ctaHref}
        className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-all hover:scale-[1.01] ${
          plan.highlight
            ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md hover:shadow-lg"
            : "border-2 border-[var(--rule-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        }`}
      >
        {plan.cta}
        <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
      </Link>
    </div>
  );
}

function TrustBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
      <span className="text-[var(--accent)]">{icon}</span>
      {text}
    </div>
  );
}
