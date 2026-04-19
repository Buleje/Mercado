"use client";

/**
 * DealsAlert — Card editorial para suscripción a alertas de ofertas.
 * Form email + botón teal. Sin backend (MVP: solo UI, fire-and-forget).
 */

import { useState, useCallback } from "react";
import { Bell } from "@buleje/design-system/icons";

export default function DealsAlert() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      // MVP: solo UI, no hay endpoint aun
      setSubmitted(true);
    },
    [email],
  );

  return (
    <section
      aria-labelledby="deals-alert-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 sm:p-10">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden="true" />
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400">
              No te lo pierdas
            </span>
          </div>
          <h2
            id="deals-alert-heading"
            className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white"
          >
            Avisame de futuras ofertas
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Te enviamos las mejores ofertas de la semana. Una vez por semana, sin spam.
          </p>

          {submitted ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
            >
              <p className="text-sm font-semibold text-primary">
                Listo, te avisamos cuando hay ofertas nuevas.
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Revisa tu bandeja (y el spam por las dudas).
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              aria-label="Suscribirse a alertas de ofertas"
              className="mt-6 flex flex-col sm:flex-row gap-3"
            >
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
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary dark:focus:border-primary transition-colors"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              >
                Suscribirme
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
