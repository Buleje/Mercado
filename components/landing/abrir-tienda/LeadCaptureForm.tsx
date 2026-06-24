"use client";

import { useState } from "react";
import { MessageCircle, CheckCircle2, Send } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";

/**
 * LeadCaptureForm — captación inline en /abrir-tienda. Además de los botones que
 * van a /marketplace/registrar, este mini-form toma nombre + WhatsApp y, al
 * enviar, abre WhatsApp a Buleje con los datos prellenados → captura el lead en
 * la bandeja de Buleje aunque no complete el registro. Sin backend (patrón
 * WhatsApp-first de la página). Persistir el lead en DB = follow-up opcional.
 */
export default function LeadCaptureForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const normalizedPhone = phone.replace(/\D/g, "");

  const submit = () => {
    if (!name.trim()) {
      setError("Decinos tu nombre, por favor.");
      return;
    }
    if (normalizedPhone.length < 9) {
      setError("Ingresá un WhatsApp válido (9 dígitos).");
      return;
    }
    setError(null);
    const digits = BRAND_GEO.phone.replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Hola Buleje 👋 Soy ${name.trim()}, mi WhatsApp es ${normalizedPhone}. ` +
        `Quiero abrir mi tienda en ${BRAND_GEO.city}. ¿Me ayudan?`,
    );
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank", "noopener,noreferrer");
    setSent(true);
  };

  return (
    <section className="bg-[var(--surface-sunken)] py-16 sm:py-24 border-y border-[var(--rule-soft)]">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 shadow-[0_16px_50px_rgba(2,6,23,0.08)] sm:p-10">
          <div className="text-center">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Te ayudamos a abrirla
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-[1] tracking-[-0.03em] text-[var(--text-primary)]">
              Dejanos tu WhatsApp y lo hacemos juntos.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              Te escribimos hoy mismo y te acompañamos en el setup, paso a paso.
              Sin compromiso.
            </p>
          </div>

          {sent ? (
            <div
              role="status"
              className="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-5 py-4 text-left"
            >
              <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                ¡Listo, {name.trim().split(" ")[0]}! Te abrimos WhatsApp para
                terminar. Si no se abrió,{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="font-extrabold text-[var(--accent)] underline"
                >
                  probá de nuevo
                </button>
                .
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="mx-auto mt-8 flex max-w-md flex-col gap-3"
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
                aria-label="Tu nombre"
                className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <div className="flex gap-2">
                <span className="inline-flex h-12 shrink-0 items-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-base font-bold text-[var(--text-secondary)]">
                  +51
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="987 654 321"
                  autoComplete="tel-national"
                  aria-label="Tu WhatsApp"
                  className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm font-semibold text-[var(--data-error-500)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-6 text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 transition-all hover:gap-3"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                Quiero que me contacten
                <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
              </button>
              <p className="text-center text-xs font-medium text-[var(--text-tertiary)]">
                Te contactamos por WhatsApp · sin spam
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
