"use client";

/**
 * DealsAlert — Card editorial para suscripcion a alertas semanales de ofertas.
 *
 * Estilo Buleje: surface gradient + accent blob decorativo (igual lenguaje
 * que BodegueroSpotlight), kicker editorial + h2 black + form inline.
 *
 * MVP: solo UI (sin backend). Fire-and-forget.
 */

import { useState, useCallback } from "react";
import { Bell, Check, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export default function DealsAlert() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitted(true);
    },
    [email],
  );

  return (
    <section
      aria-labelledby="deals-alert-heading"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-gradient-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)] p-8 sm:p-12">
        {/* Decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-[var(--accent)]/[0.10] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-[2fr_3fr] items-center gap-8">
          {/* Left — texto editorial */}
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--accent)] mb-3">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              No te lo pierdas
            </p>
            <h2
              id="deals-alert-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-[1.05]"
            >
              Las mejores ofertas{" "}
              <span className="text-[var(--accent)]">en tu correo</span>
            </h2>
            <p className="mt-3 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Una vez por semana, sin spam. Solo los descuentos que valen la pena.
            </p>

            {/* Mini trust list */}
            <ul className="mt-5 flex flex-col gap-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              <li className="inline-flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" strokeWidth={2.5} aria-hidden />
                Sin spam, una sola vez por semana
              </li>
              <li className="inline-flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" strokeWidth={2.5} aria-hidden />
                Cancela cuando quieras
              </li>
              <li className="inline-flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" strokeWidth={2.5} aria-hidden />
                Solo bodegas verificadas de Pucallpa
              </li>
            </ul>
          </div>

          {/* Right — formulario */}
          <div className="min-w-0">
            {submitted ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-5 py-6"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] shrink-0">
                    <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-black text-[var(--accent)]">
                      Listo, te avisamos
                    </p>
                    <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      Revisa tu bandeja (y la carpeta de spam por las dudas). El primer envio sale el próximo lunes.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                aria-label="Suscribirse a alertas de ofertas"
                className={cn(
                  "rounded-2xl border-2 transition-colors duration-200 bg-[var(--surface-raised)]",
                  "border-[var(--rule-base)] focus-within:border-[var(--accent)]",
                  "p-2",
                )}
              >
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <span className="hidden sm:inline-flex items-center pl-3 text-[var(--text-tertiary)]">
                    <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <label htmlFor="deals-alert-email" className="sr-only">
                    Tu email
                  </label>
                  <input
                    id="deals-alert-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    className="flex-1 bg-transparent border-0 outline-none px-3 py-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] min-w-0"
                  />
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-6 py-3 text-sm font-bold text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors"
                  >
                    Suscribirme
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
