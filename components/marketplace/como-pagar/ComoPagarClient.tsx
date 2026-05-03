"use client";

/**
 * ComoPagarClient — Página informativa de métodos de pago.
 *
 * Sin mocks: solo lista los métodos REALES que la app soporta hoy:
 *  - Yape (instantáneo, sin comisión)
 *  - Plin
 *  - Transferencia bancaria
 *  - Efectivo al recibir (delivery)
 *  - Tarjeta vía Stripe / Mercado Pago (suscripciones SaaS / online)
 *
 * Diseño tokenizado (paleta Buleje), sin emojis decorativos. Cada método
 * tiene: icono, título, eyebrow, descripción y "Cómo funciona" en pasos.
 */

import Link from "next/link";
import {
  Smartphone,
  Banknote,
  Building2,
  Truck,
  CreditCard,
  ShieldCheck,
  ArrowRight,
} from "@buleje/design-system/icons";

type Method = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  steps: string[];
  icon: typeof Smartphone;
  variant: "accent" | "ink" | "soft";
  badge?: string;
};

const METHODS: Method[] = [
  {
    id: "yape",
    eyebrow: "Más usado",
    title: "Yape",
    description:
      "Pagá al instante con tu número de celular. Sin comisión, sin tarjeta. La bodega recibe el dinero en segundos.",
    steps: [
      "Confirmá tu pedido y elegí Yape",
      "Escaneá el QR o copiá el número",
      "Mandá el monto exacto desde tu app",
      "Listo — la bodega te confirma y empaca",
    ],
    icon: Smartphone,
    variant: "accent",
    badge: "Sin comisión",
  },
  {
    id: "plin",
    eyebrow: "Alternativa rápida",
    title: "Plin",
    description:
      "Si usás Plin de BCP, Interbank, BBVA o Scotiabank, también está disponible en bodegas que lo aceptan.",
    steps: [
      "Elegí Plin en el checkout",
      "Buscá el número de la bodega",
      "Enviá el pago desde tu app bancaria",
      "Confirmá tu pedido al cajero",
    ],
    icon: Smartphone,
    variant: "soft",
  },
  {
    id: "efectivo",
    eyebrow: "Pagá al recibir",
    title: "Efectivo",
    description:
      "Pagá al motorizado cuando te entrega. Si necesitás vuelto, decilo al confirmar — la bodega prepara el cambio exacto.",
    steps: [
      "Pedí normalmente desde la app",
      "Elegí 'Efectivo' al confirmar",
      "Indicá si necesitás vuelto y de cuánto",
      "Pagá al motorizado al recibir",
    ],
    icon: Banknote,
    variant: "ink",
  },
  {
    id: "transferencia",
    eyebrow: "Pedidos grandes",
    title: "Transferencia bancaria",
    description:
      "Para pedidos grandes o mayoristas. La bodega te comparte sus datos bancarios y te confirma cuando recibe el depósito.",
    steps: [
      "Avisale a la bodega por WhatsApp",
      "Recibí los datos de cuenta (CCI/cuenta)",
      "Hacé la transferencia desde tu banco",
      "Mandá el voucher para confirmación",
    ],
    icon: Building2,
    variant: "soft",
  },
  {
    id: "tarjeta",
    eyebrow: "Online",
    title: "Tarjeta (Visa / Mastercard)",
    description:
      "Disponible en suscripciones a planes Buleje y en tiendas que activaron pagos online. Procesado por Stripe y Mercado Pago — datos cifrados.",
    steps: [
      "Elegí 'Tarjeta' al confirmar",
      "Cargá los datos en el formulario seguro",
      "Confirmá con OTP de tu banco",
      "Recibí el comprobante por email",
    ],
    icon: CreditCard,
    variant: "soft",
  },
];

function MethodCard({ method }: { method: Method }) {
  const Icon = method.icon;
  const isAccent = method.variant === "accent";
  const isInk = method.variant === "ink";
  return (
    <article
      className={[
        "rounded-2xl border p-6 sm:p-7 flex flex-col gap-4 transition-shadow hover:shadow-md",
        isAccent
          ? "bg-[var(--accent)] text-white border-transparent"
          : isInk
            ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-transparent"
            : "bg-[var(--surface-raised)] border-[var(--rule-soft)] text-[var(--text-primary)]",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={[
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            isAccent || isInk ? "bg-white/15" : "bg-[var(--accent-soft)] text-[var(--accent)]",
          ].join(" ")}
        >
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] mb-1",
              isAccent || isInk ? "opacity-80" : "text-[var(--text-tertiary)]",
            ].join(" ")}
          >
            {method.eyebrow}
          </p>
          <h3 className="text-xl sm:text-2xl font-black tracking-[var(--ls-tight)]">
            {method.title}
          </h3>
        </div>
        {method.badge && (
          <span
            className={[
              "shrink-0 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
              isAccent || isInk ? "bg-white/15 text-white" : "bg-[var(--accent)] text-white",
            ].join(" ")}
          >
            {method.badge}
          </span>
        )}
      </header>

      <p
        className={[
          "text-sm leading-relaxed",
          isAccent || isInk ? "text-white" : "text-[var(--text-secondary)]",
        ].join(" ")}
      >
        {method.description}
      </p>

      <ol className="space-y-2 text-sm">
        {method.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={[
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-bold tabular-nums",
                isAccent || isInk
                  ? "bg-white/20 text-white"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]",
              ].join(" ")}
            >
              {i + 1}
            </span>
            <span className={isAccent || isInk ? "text-white" : "text-[var(--text-secondary)]"}>
              {s}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function ComoPagarClient() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Hero — pt reducido (audit P1): antes pt-10/pt-16 dejaba al usuario
          frente al banner cuando hacía click "Cómo pagar" del nav. */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-6 sm:pb-8">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-4">
          <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
          Pagás como prefieras
        </p>
        <h1 className="text-[clamp(2.25rem,5.5vw,3.75rem)] font-black tracking-[-0.03em] leading-[0.95] text-[var(--text-primary)] max-w-3xl">
          Cinco formas reales de pagar tu pedido.
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
          Sin tarjetas obligatorias, sin trámites. Yape, Plin, transferencia o efectivo al recibir — vos elegís.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Datos cifrados
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]">
            <Truck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Pagás al recibir si querés
          </span>
        </div>
      </section>

      {/* Métodos — id "metodos" para deep-link desde el nav */}
      <section id="metodos" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 scroll-mt-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {METHODS.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </div>
      </section>

      {/* FAQ corto */}
      <section className="bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)] py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] mb-8">
            Preguntas frecuentes
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "¿La bodega cobra comisión por usar Yape?",
                a: "No. Yape es gratis para vos y para la bodega. El monto que ves en el carrito es lo que pagás.",
              },
              {
                q: "¿Puedo cambiar de método de pago si ya hice el pedido?",
                a: "Sí, mientras la bodega no haya despachado. Avisale por WhatsApp o desde el chat del pedido y te ayudan a cambiar.",
              },
              {
                q: "¿Qué pasa si pago en efectivo y no tengo el monto exacto?",
                a: "Indicá en el checkout cuánto vas a entregar y la bodega te prepara el vuelto exacto en monedas y billetes.",
              },
              {
                q: "¿Mi tarjeta queda guardada?",
                a: "Solo si vos lo pedís. Por defecto, los datos no se guardan — Stripe y Mercado Pago tokenizan cada cobro.",
              },
            ].map((f) => (
              // Visual QA P2 fix 2026-04-30: details ahora con shadow on open
              // y arrow rotando suave (transition-transform duration-300).
              <details
                key={f.q}
                className="group rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5 [&[open]_svg]:rotate-90 transition-shadow open:shadow-md"
              >
                <summary className="flex items-start justify-between gap-4 cursor-pointer list-none font-bold text-[var(--text-primary)]">
                  <span>{f.q}</span>
                  <ArrowRight
                    className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-300"
                    strokeWidth={2}
                  />
                </summary>
                <div className="grid grid-rows-[1fr] mt-3 transition-[grid-template-rows] duration-300">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed overflow-hidden">
                    {f.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA bottom */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] mb-4">
            Listo para hacer tu primer pedido
          </h2>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] mb-8">
            Bodegas activas en Pucallpa, Ucayali. Cobertura en expansión por toda la región.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/tiendas"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
            >
              Ver bodegas
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
            <Link
              href="/marketplace/ofertas"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-6 py-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Ver ofertas
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
