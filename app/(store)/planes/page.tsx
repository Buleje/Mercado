import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, Store, Check, ChevronDown, ArrowUpRight } from "@buleje/design-system/icons";

export const metadata: Metadata = {
  title: "Planes y Precios — Buleje | Software ERP para Bodegas",
  description:
    "Compara los planes de Buleje: Gratis, Pro y Enterprise. Encuentra el ideal para tu bodega, minimarket o tienda de barrio.",
  openGraph: {
    title: "Planes y Precios — Buleje",
    description: "Empieza gratis y crece a tu ritmo. Planes desde S/0.",
  },
};

const plans = [
  {
    name: "Gratis",
    price: "S/0",
    period: "/mes",
    description: "Ideal para empezar a vender online sin costo",
    highlighted: false,
    cta: "Comenzar gratis",
    features: [
      { text: "Hasta 50 productos", included: true },
      { text: "Tienda online basica", included: true },
      { text: "POS digital (punto de venta)", included: true },
      { text: "Reportes de ventas basicos", included: true },
      { text: "Gestion de clientes", included: true },
      { text: "Soporte por WhatsApp", included: true },
      { text: "Productos ilimitados", included: false },
      { text: "Facturacion SUNAT", included: false },
      { text: "Delivery integrado", included: false },
      { text: "Reportes avanzados y IA", included: false },
      { text: "Multi-sucursal", included: false },
      { text: "API personalizada", included: false },
    ],
  },
  {
    name: "Pro",
    price: "S/49",
    period: "/mes",
    description: "Para bodegas que quieren crecer y vender mas",
    highlighted: true,
    cta: "Empezar con Pro",
    features: [
      { text: "Productos ilimitados", included: true },
      { text: "Tienda online personalizada", included: true },
      { text: "POS digital avanzado", included: true },
      { text: "Reportes avanzados con graficos", included: true },
      { text: "Facturacion SUNAT (boletas y facturas)", included: true },
      { text: "Delivery integrado con zonas", included: true },
      { text: "Fiado digital con recordatorios", included: true },
      { text: "Control de inventario FEFO", included: true },
      { text: "Alertas de stock bajo", included: true },
      { text: "Soporte prioritario", included: true },
      { text: "Multi-sucursal", included: false },
      { text: "API personalizada", included: false },
    ],
  },
  {
    name: "Enterprise",
    price: "A medida",
    period: "",
    description: "Para cadenas, distribuidoras y operaciones grandes",
    highlighted: false,
    cta: "Contactar ventas",
    features: [
      { text: "Todo lo de Pro incluido", included: true },
      { text: "Multi-sucursal ilimitado", included: true },
      { text: "API personalizada y webhooks", included: true },
      { text: "Integracion ERP existente", included: true },
      { text: "SLA dedicado (99.9% uptime)", included: true },
      { text: "Onboarding premium con capacitacion", included: true },
      { text: "Dashboard ejecutivo con KPIs", included: true },
      { text: "Prediccion de demanda con IA", included: true },
      { text: "Dominio personalizado", included: true },
      { text: "White-label (tu marca)", included: true },
      { text: "Soporte 24/7 por telefono", included: true },
      { text: "Gerente de cuenta dedicado", included: true },
    ],
  },
];

const faqs = [
  { q: "¿Puedo cambiar de plan despues?", a: "Si, puedes subir o bajar de plan en cualquier momento. Los cambios se aplican al siguiente ciclo de facturacion." },
  { q: "¿Hay contrato o permanencia minima?", a: "No. Todos los planes son mensuales y puedes cancelar cuando quieras, sin penalidades." },
  { q: "¿El plan Gratis tiene limite de tiempo?", a: "No. El plan Gratis es para siempre. Solo tiene limite de 50 productos." },
  { q: "¿Que metodos de pago aceptan?", a: "Aceptamos Yape, Plin, transferencia bancaria y tarjeta de credito/debito via Stripe." },
  { q: "¿La facturacion SUNAT tiene costo adicional?", a: "No, esta incluida en el plan Pro. Genera boletas y facturas electronicas directamente desde Buleje." },
  { q: "¿Incluye soporte tecnico?", a: "Si. Plan Gratis tiene soporte por WhatsApp, Pro tiene soporte prioritario, y Enterprise tiene soporte 24/7 por telefono." },
];

export default function PlanesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-linear-to-b from-[#060e08] to-[#0a1f0d] text-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
            <Wallet className="h-3 w-3" strokeWidth={2} />
            Planes y Precios
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold">
            Empieza{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#00B4A6] to-[#4ade80]">
              gratis
            </span>
            , crece sin limites
          </h1>
          <p className="mt-4 text-lg text-white/60 max-w-xl mx-auto">
            Elige el plan que mejor se adapte a tu negocio. Sin costos ocultos, sin contratos.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="py-16 sm:py-24 bg-white dark:bg-gray-950 -mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 sm:p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-white dark:bg-gray-800 border-2 border-[#00B4A6] shadow-xl shadow-[#00B4A6]/10"
                    : "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#00B4A6] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                    Mas popular
                  </span>
                )}
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h2>
                <div className="mt-3">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? "text-[#00B4A6]" : "text-gray-900 dark:text-white"}`}>
                    {plan.price}
                  </span>
                  {plan.period && <span className="text-sm text-gray-400">{plan.period}</span>}
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 shrink-0 ${f.included ? "text-[#00B4A6]" : "text-gray-300 dark:text-gray-600"}`}>
                        {f.included ? (
                          <Check className="h-4 w-4" strokeWidth={2} />
                        ) : (
                          <span aria-hidden="true">—</span>
                        )}
                      </span>
                      <span className={f.included ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/marketplace/registrar"
                  className={`mt-8 block text-center font-bold py-3 rounded-xl transition-colors ${
                    plan.highlighted
                      ? "bg-[#00B4A6] text-white hover:bg-[#009b8f]"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison note */}
      <section className="py-12 bg-[#00B4A6]/5 dark:bg-[#00B4A6]/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            ¿No estas seguro? Empieza gratis
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            El plan Gratis no tiene limite de tiempo. Puedes usarlo todo el tiempo que necesites y subir cuando tu negocio crezca.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-24 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
              Preguntas sobre los planes
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <summary className="flex items-center justify-between cursor-pointer p-5 text-left font-semibold text-gray-900 dark:text-white hover:text-[#00B4A6] transition-colors list-none">
                  <span>{f.q}</span>
                  <ChevronDown
                    className="ml-3 h-4 w-4 shrink-0 text-gray-400 group-open:rotate-180 transition-transform"
                    strokeWidth={1.75}
                  />
                </summary>
                <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-linear-to-br from-[#060e08] to-[#0a1f0d] text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold">
            ¿Listo para{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#00B4A6] to-[#4ade80]">
              potenciar
            </span>{" "}
            tu bodega?
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/marketplace/registrar"
              className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-6 py-3 rounded-full hover:bg-gray-100 transition-colors text-sm"
            >
              <Store className="h-4 w-4" strokeWidth={1.75} />
              Registrar mi tienda
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl border border-white/20 hover:bg-white/20 transition-all text-lg"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
