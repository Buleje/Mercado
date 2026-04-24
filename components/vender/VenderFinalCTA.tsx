"use client";

/**
 * VenderFinalCTA — hero horizontal final con botón grande hacia /vender/registro.
 */

import Link from "next/link";
import { ArrowRight, Check } from "@buleje/design-system/icons";
import { CorazonLatiendo } from "@/components/ui-system/illustrations/contextual";

const GUARANTEES = [
  "Gratis el primer mes",
  "Sin contrato, cancelás cuando quieras",
  "Te acompañamos con un asesor",
] as const;

export default function VenderFinalCTA() {
  return (
    <section className="bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--text-primary)] px-6 py-12 text-[var(--surface-canvas)] sm:px-12 sm:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] opacity-70">
                Última parada
              </p>
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Empieza hoy mismo, cobrá esta semana
              </h2>
              <p className="max-w-lg text-sm opacity-85 sm:text-base">
                Mañana ya tienes tu primer pedido. No hay excusa: abrir la
                tienda cuesta menos que una cajita de cerveza al mayorista.
              </p>

              <ul className="flex flex-col gap-2">
                {GUARANTEES.map((g) => (
                  <li
                    key={g}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    {g}
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <Link
                  href="/vender/registro"
                  className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[var(--surface-canvas)] px-6 py-3 text-sm font-bold text-[var(--text-primary)] transition-opacity hover:opacity-90 sm:text-base"
                >
                  Empezar ahora
                  <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="relative flex items-center justify-center lg:col-span-2">
              <div className="flex h-[260px] w-[260px] items-center justify-center rounded-3xl border border-[var(--surface-canvas)]/15 bg-[var(--surface-canvas)]/5">
                <CorazonLatiendo
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
