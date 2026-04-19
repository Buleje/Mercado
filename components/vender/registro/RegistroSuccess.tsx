"use client";

/**
 * RegistroSuccess — success page post-submit. Muestra ticket ID + next steps.
 */

import Link from "next/link";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";
import { Check, MessageCircle, ArrowRight } from "@buleje/design-system/icons";

interface RegistroSuccessProps {
  registrationId: string;
  nombreNegocio?: string;
}

const NEXT_STEPS = [
  {
    n: "01",
    title: "Revisamos tu RUC con SUNAT",
    detail: "Toma entre 2 y 24 horas hábiles. Te avisamos por WhatsApp apenas esté listo.",
  },
  {
    n: "02",
    title: "Un asesor te llama",
    detail: "Para ayudarte a cargar los primeros 20 productos y sacar fotos decentes.",
  },
  {
    n: "03",
    title: "Entrás al panel vendedor",
    detail: "Desde ahí vas a manejar pedidos, stock, promociones y ver tus ingresos.",
  },
] as const;

export default function RegistroSuccess({
  registrationId,
  nombreNegocio,
}: RegistroSuccessProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      {/* Hero visual */}
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-40 w-40 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]">
          <BodegueroCelebrando size={150} strokeWidth={1.4} />
        </div>

        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--data-success)]/30 bg-[var(--data-success)]/10 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--data-success)]">
            <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            Solicitud recibida
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            {nombreNegocio ? `¡Bienvenido, ${nombreNegocio}!` : "¡Estás dentro!"}
          </h1>
          <p className="text-base text-[var(--text-secondary)]">
            Te contactamos en 24 horas con los próximos pasos. Mientras tanto,
            prepará las fotos de tus productos más vendidos.
          </p>
        </div>

        {/* Ticket ID */}
        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2.5">
          <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Nº de solicitud
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {registrationId}
          </span>
        </div>
      </div>

      {/* Next steps */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
        <p className="mb-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
          Qué sigue ahora
        </p>
        <ol className="space-y-4">
          {NEXT_STEPS.map((step) => (
            <li key={step.n} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                {step.n}
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {step.title}
                </h3>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* CTAs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
        <Link
          href="/vender/mi-tienda"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-sm font-bold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
        >
          Ver cómo será mi panel
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
        <a
          href="https://wa.me/51916409675?text=Hola%20Buleje%2C%20acabo%20de%20registrar%20mi%20negocio"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Hablar por WhatsApp
        </a>
      </div>
    </div>
  );
}
