"use client";

import { useState, useRef } from "react";
import { MessageCircle, CheckCircle, Gift, Zap, Shield, ShieldCheck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export default function NewsletterWhatsApp() {
  const ref = useRef<HTMLElement>(null);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 9) {
      setError("Ingresa un número válido de 9 dígitos");
      inputRef.current?.focus();
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem("buleje-newsletter-subs") || "[]") as string[];
      if (!stored.includes(cleaned)) {
        stored.push(cleaned);
        localStorage.setItem("buleje-newsletter-subs", JSON.stringify(stored));
      }
    } catch {
      // Ignore storage errors
    }

    setSent(true);
  };

  const BENEFITS = [
    { icon: Gift, text: "Ofertas exclusivas cada semana", accent: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-600)]" },
    { icon: Zap, text: "Aviso de productos nuevos al instante", accent: "bg-[var(--data-success-500)]/10 text-[var(--data-success-600)]" },
    { icon: Shield, text: "Cupones solo por WhatsApp", accent: "bg-[var(--data-success-500)]/10 text-[var(--data-success-600)]" },
  ];

  return (
    <section
      ref={ref}
      aria-label="Suscripción de ofertas por WhatsApp"
      className="relative py-16 sm:py-24 overflow-hidden"
    >
      {/* Rich gradient background — inline style avoids Tailwind purge of arbitrary hex values */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #075E54, #128C7E, #25D366)" }} />
      {/* Soft radial light overlay — replaces noisy plus pattern */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.07) 0%, transparent 70%), radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 60%)" }} />
      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div
          className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16"
        >
          {/* Left — Content */}
          <div className="flex-1 text-center lg:text-left">
            {/* WhatsApp icon pill */}
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 text-white text-xs font-bold uppercase tracking-widest mb-6">
              <MessageCircle className="w-4 h-4 fill-white" />
              Canal oficial
            </div>

            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              Ofertas directo a tu{" "}
              <span className="relative inline-block">
                WhatsApp
                <svg className="absolute -bottom-1 left-0 w-full h-2.5 text-white/30" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 7 Q25 0 50 5 Q75 10 100 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h3>

            <p className="text-white/80 mt-4 text-base sm:text-lg max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Únete y recibe las mejores promociones de Buleje cada semana.
              <strong className="text-white"> Sin spam, solo ahorro.</strong>
            </p>

            {/* Benefit cards */}
            <div className="mt-8 flex flex-col gap-3 max-w-md mx-auto lg:mx-0">
              {BENEFITS.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10"
                >
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/20">
                    <b.icon className="w-4.5 h-4.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white">{b.text}</span>
                </div>
              ))}
            </div>

            {/* Social proof */}
            <div className="mt-6 flex items-center gap-3 justify-center lg:justify-start">
              <div className="flex -space-x-2">
                {["🧑", "👩", "👨", "👩‍🦱"].map((emoji, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center text-sm">
                    {emoji}
                  </div>
                ))}
              </div>
              <p className="text-white/70 text-sm">
                <strong className="text-white">+800</strong> personas ya reciben ofertas
              </p>
            </div>
          </div>

          {/* Right — Card with form */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-[var(--surface-raised)] rounded-3xl p-7 sm:p-8 shadow-[var(--shadow-xl)] shadow-black/20 border border-white/20">
              {sent ? (
                <div className="flex flex-col items-center gap-4 text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center animate-[scaleIn_0.4s_ease-out]">
                    <CheckCircle className="w-8 h-8 text-[#25D366]" />
                  </div>
                  <h4 className="font-extrabold text-[var(--text-primary)] text-xl">
                    ¡Listo! Te avisaremos
                  </h4>
                  <p className="text-muted text-sm leading-relaxed">
                    Recibirás nuestras ofertas por WhatsApp al{" "}
                    <strong className="text-[var(--text-primary)]">{phone}</strong>
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#25D366] font-bold bg-[#25D366]/8 rounded-full px-3 py-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Revisa tu WhatsApp pronto
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} aria-label="Formulario de suscripción por WhatsApp" className="space-y-5">
                  {/* Header */}
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#25D366]/10 mb-3">
                      <MessageCircle className="w-6 h-6 text-[#25D366]" />
                    </div>
                    <h4 className="font-extrabold text-[var(--text-primary)] text-lg">
                      Suscríbete gratis
                    </h4>
                    <p className="text-muted text-sm mt-1">
                      Ingresa tu celular y recibe ofertas
                    </p>
                  </div>

                  {/* Phone input */}
                  <div>
                    <label
                      htmlFor="newsletter-phone"
                      className="block text-sm font-semibold text-[var(--text-primary)] mb-2"
                    >
                      Tu número de celular
                    </label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3.5 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-muted">
                        +51
                      </span>
                      <input
                        ref={inputRef}
                        id="newsletter-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={12}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                        placeholder="9XX XXX XXX"
                        className={cn(
                          "flex-1 px-4 py-3.5 rounded-xl border text-sm font-medium bg-white dark:bg-surface text-[var(--text-primary)] placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366] transition",
                          error
                            ? "border-red-400 focus:ring-red-300"
                            : "border-[var(--rule-base)]"
                        )}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-[var(--data-error-500)] mt-1.5">{error}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    aria-label="Suscribirme a ofertas por WhatsApp"
                    className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-extrabold text-white text-base bg-[#25D366] hover:bg-[#1ebe5a] active:scale-[0.98] transition-all shadow-[var(--shadow-lg)] shadow-[#25D366]/30 hover:shadow-[var(--shadow-xl)] hover:shadow-[#25D366]/40"
                  >
                    <MessageCircle className="w-5 h-5 fill-white" />
                    Suscribirme por WhatsApp
                  </button>

                  <p className="text-[length:var(--ts-2xs)] text-muted text-center leading-relaxed">
                    <ShieldCheck className="inline w-3.5 h-3.5 mr-1 shrink-0" aria-hidden="true" />Solo ofertas y novedades. Puedes cancelar cuando quieras.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
