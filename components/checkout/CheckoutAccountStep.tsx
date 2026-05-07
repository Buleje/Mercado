"use client";

/**
 * CheckoutAccountStep — Paso 1 del checkout: identificar al cliente.
 *
 * UI ONLY (zona de peligro: components/checkout/**). NO toca:
 *   - Totales (siguen calculados en backend)
 *   - Idempotency (key sigue generada en CheckoutModal padre)
 *   - Reservas de stock (acción posterior al step de delivery)
 *   - Payment providers (no toca lógica de pago)
 *
 * Cambio (2026-05-05): Brandon pidió añadir Google sign-in + crear cuenta
 * inline. Las cuentas creadas son **por tenant** — el backend ya filtra por
 * `tenantId` en customer.db.ts (regla #3 de CLAUDE.md). Esto es solo UI; los
 * callbacks onCreateAccount / onGoogleSignIn son opcionales y los maneja el
 * padre (CheckoutModal). Si no se pasan, el step funciona como antes.
 */

import { useState } from "react";
import { m } from "framer-motion";
import { User, Phone, Loader2, ShieldCheck, Lock, UserPlus, ArrowRight, Mail, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PhoneValidation {
  valid: boolean;
  hint: string;
  color: string;
}

type Mode = "menu" | "search" | "signup";

export interface CheckoutAccountStepProps {
  phoneQuery: string;
  onPhoneQueryChange: (v: string) => void;
  phoneQueryValidation: PhoneValidation;
  phoneSearching: boolean;
  phoneNotFound: boolean;
  onPhoneSearch: () => void;
  onSkipAccount: () => void;
  /** Crear cuenta nueva. Opcional — solo UI; lógica server en el padre. */
  onCreateAccount?: (data: { phone: string; name: string; email?: string }) => Promise<void> | void;
  /** Iniciar sesión con Google (OAuth). Opcional — solo UI. */
  onGoogleSignIn?: () => Promise<void> | void;
  /** Nombre de la tienda para copy ("Tu cuenta en X"). */
  storeName?: string;
}

export function CheckoutAccountStep({
  phoneQuery,
  onPhoneQueryChange,
  phoneQueryValidation,
  phoneSearching,
  phoneNotFound,
  onPhoneSearch,
  onSkipAccount,
  onCreateAccount,
  onGoogleSignIn,
  storeName,
}: CheckoutAccountStepProps) {
  const [mode, setMode] = useState<Mode>("menu");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signupValid = signupName.trim().length >= 2 && signupPhone.length === 9 && signupPhone.startsWith("9");

  const handleGoogleSignIn = async () => {
    if (!onGoogleSignIn) return;
    setGoogleLoading(true);
    try {
      await onGoogleSignIn();
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!signupValid || !onCreateAccount) return;
    setSignupLoading(true);
    try {
      await onCreateAccount({
        phone: signupPhone,
        name: signupName.trim(),
        email: signupEmail.trim() || undefined,
      });
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <m.div
      key="cuenta"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-extrabold text-foreground tracking-tight leading-tight">
              {mode === "menu" && "¿Cómo querés continuar?"}
              {mode === "search" && "Buscar mi cuenta"}
              {mode === "signup" && "Crear cuenta nueva"}
            </h3>
            <p className="text-sm text-muted leading-snug mt-0.5">
              {mode === "menu" && (storeName ? `Tu cuenta queda en ${storeName} — independiente de otras tiendas.` : "Tu información solo se guarda en esta tienda.")}
              {mode === "search" && "Ingresá tu celular para cargar tus datos."}
              {mode === "signup" && "Solo necesitamos tu nombre y celular."}
            </p>
          </div>
          {mode !== "menu" && (
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="text-xs font-bold text-muted hover:text-foreground"
            >
              ← Volver
            </button>
          )}
        </div>

        {/* ── MENU principal ───────────────────────────────────────── */}
        {mode === "menu" && (
          <div className="space-y-3">
            {/* Google sign-in */}
            {onGoogleSignIn && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-white dark:bg-card border-2 border-[var(--rule-base)] dark:border-card-border text-foreground font-bold text-sm hover:border-primary/50 hover:shadow-md transition-all disabled:opacity-60"
              >
                {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleLogo />}
                {googleLoading ? "Conectando…" : "Continuar con Google"}
              </button>
            )}

            {onGoogleSignIn && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-[var(--rule-soft)]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">o</span>
                <div className="flex-1 h-px bg-[var(--rule-soft)]" />
              </div>
            )}

            {/* Buscar cuenta */}
            <button
              type="button"
              onClick={() => setMode("search")}
              className="w-full p-4 flex items-center gap-4 rounded-2xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card hover:border-primary/40 hover:shadow-md text-left transition-all group"
            >
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <Phone className="h-5 w-5 text-primary group-hover:text-white" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">Ya tengo cuenta</p>
                <p className="text-xs text-muted mt-0.5 leading-snug">Buscar mis datos por número de celular</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Crear cuenta */}
            {onCreateAccount && (
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="w-full p-4 flex items-center gap-4 rounded-2xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card hover:border-primary/40 hover:shadow-md text-left transition-all group"
              >
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                  <UserPlus className="h-5 w-5 text-primary group-hover:text-white" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight">Crear cuenta</p>
                  <p className="text-xs text-muted mt-0.5 leading-snug">Solo nombre + celular · 30 segundos</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </button>
            )}

            {/* Guest */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onSkipAccount}
                data-testid="checkout-skip-account"
                className="text-sm font-semibold text-muted hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Continuar sin cuenta →
              </button>
            </div>
          </div>
        )}

        {/* ── BUSCAR ────────────────────────────────────────────── */}
        {mode === "search" && (
          <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-card-border p-5 flex flex-col gap-3 bg-white dark:bg-card">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              Número de celular
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="tel"
                  value={phoneQuery}
                  onChange={(e) => onPhoneQueryChange(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="987 654 321"
                  maxLength={9}
                  onKeyDown={(e) => e.key === "Enter" && onPhoneSearch()}
                  autoFocus
                  className={cn(
                    "w-full pl-10 pr-3 h-12 rounded-xl border-2 text-base text-foreground placeholder:text-muted focus:ring-2 outline-none transition-all",
                    phoneQuery.length === 0
                      ? "border-[var(--rule-base)] dark:border-card-border focus:border-primary focus:ring-primary/20"
                      : phoneQueryValidation.valid
                        ? "border-[var(--data-success-500)] focus:ring-[var(--data-success-500)]/20"
                        : "border-[var(--rule-base)] dark:border-card-border focus:border-primary focus:ring-primary/20"
                  )}
                />
              </div>
              <m.button
                type="button"
                onClick={onPhoneSearch}
                disabled={!phoneQueryValidation.valid || phoneSearching}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="h-12 px-6 flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-all shadow-md shadow-primary/20 disabled:opacity-50 sm:min-w-[140px]"
              >
                {phoneSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                {phoneSearching ? "Buscando..." : "Buscar"}
              </m.button>
            </div>
            {phoneQuery.length > 0 && phoneQueryValidation.hint && (
              <p className={`text-xs font-semibold ${phoneQueryValidation.color}`}>
                {phoneQueryValidation.hint}
              </p>
            )}
            {phoneNotFound && (
              <div className="rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 p-3">
                <p className="text-xs text-[var(--data-warning-700)] font-semibold mb-2">
                  No encontramos una cuenta con ese número.
                </p>
                {onCreateAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      setSignupPhone(phoneQuery);
                      setMode("signup");
                    }}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Crear cuenta con este número →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SIGNUP ────────────────────────────────────────────── */}
        {mode === "signup" && onCreateAccount && (
          <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-card-border p-5 space-y-4 bg-white dark:bg-card">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Tu nombre</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="María González"
                  maxLength={60}
                  autoFocus
                  className="w-full pl-10 pr-3 h-12 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-base text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Celular (WhatsApp)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="tel"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="987 654 321"
                  maxLength={9}
                  className="w-full pl-10 pr-3 h-12 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-base text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              {signupPhone.length > 0 && signupPhone.length < 9 && (
                <p className="text-xs text-muted">Ingresá los 9 dígitos completos</p>
              )}
              {signupPhone.length === 9 && !signupPhone.startsWith("9") && (
                <p className="text-xs text-[var(--data-error-500)] font-semibold">El celular debe empezar con 9</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                Email
                <span className="text-[10px] font-normal text-muted normal-case tracking-normal">(opcional)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full pl-10 pr-3 h-12 rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-base text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>

            <m.button
              type="button"
              onClick={handleCreateAccount}
              disabled={!signupValid || signupLoading}
              whileHover={{ scale: signupValid ? 1.01 : 1 }}
              whileTap={{ scale: signupValid ? 0.99 : 1 }}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-all shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {signupLoading ? "Creando cuenta…" : "Crear cuenta y continuar"}
            </m.button>

            <p className="text-[11px] text-muted text-center leading-relaxed">
              Tu cuenta queda solo en {storeName ?? "esta tienda"} — no se comparte con otras tiendas ni con marketplace.
            </p>
          </div>
        )}

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-[var(--rule-soft)] dark:border-card-border flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
            <span>Compra protegida</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <Lock className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
            <span>SSL encriptado</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <User className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
            <span>Solo en {storeName ?? "esta tienda"}</span>
          </div>
        </div>
      </div>
    </m.div>
  );
}

// ── Logo de Google ────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
