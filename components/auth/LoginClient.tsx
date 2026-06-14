"use client";

/**
 * LoginClient — PÁGINA de login dedicada (Brandon 2026-06-14). Reemplaza al
 * modal: todo "Ingresar" ahora navega a /login (ver useAuthModal). Diseño
 * full-page estilo Rappi: panel promo a la izquierda + autenticación a la
 * derecha. Profesional, minimalista, sin chrome del marketplace.
 *
 * Flujo (mismos endpoints que el modal): métodos (Google/celular/Facebook) →
 * celular → OTP. Al validar, registra en CustomerContext y vuelve a `next`.
 * OAuth: si vuelve con ?oauth=complete&name=…, salta directo al ingreso de
 * celular ("casi listo").
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Phone, Shield, Loader2 } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { getSupabaseBrowser, isSupabaseAuthConfigured } from "@/lib/supabase/client";
import { useCustomer } from "@/contexts/customer-context";

interface VerifyResponse {
  ok: boolean;
  customer?: { id: string; name: string; phone: string };
  isNew?: boolean;
  error?: string;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const oauthName = sp.get("oauth") === "complete" ? sp.get("name") : null;
  const { customer, hydrated, register: registerCustomer } = useCustomer();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneView, setPhoneView] = useState<"methods" | "form">(oauthName ? "form" : "methods");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(oauthName ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const normalizedPhone = phone.replace(/\D/g, "");
  const oauthReady = isSupabaseAuthConfigured();

  // Ya logueado → no tiene sentido ver /login: volver a `next`.
  useEffect(() => {
    if (hydrated && customer) router.replace(next);
  }, [hydrated, customer, next, router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Autollenado de nombre si el celular ya tiene cuenta (mismo lookup del modal).
  useEffect(() => {
    if (normalizedPhone.length < 9) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/customer-lookup?phone=${encodeURIComponent(normalizedPhone)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; customer?: { name?: string } };
        if (cancelled || !data.ok || !data.customer?.name) return;
        if (!name.trim()) setName(data.customer.name);
      } catch {/* silent */}
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedPhone]);

  const signInWithSupabase = useCallback(async (provider: "google" | "facebook") => {
    try {
      const supabase = getSupabaseBrowser();
      const origin = window.location.origin;
      const nextParam = encodeURIComponent(next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${origin}/api/auth/oauth/callback?next=${nextParam}` },
      });
      if (error) showToast("No se pudo iniciar sesión. Intenta de nuevo.");
    } catch {
      showToast("No se pudo iniciar sesión. Intenta de nuevo.");
    }
  }, [next, showToast]);

  const handleSendOtp = useCallback(async () => {
    if (normalizedPhone.length < 9) {
      showToast("Ingresa un número de celular válido (9 dígitos).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { showToast(data.error ?? "No se pudo enviar el código."); return; }
      showToast("Código enviado. Revisa tu WhatsApp.");
      setStep("otp");
    } catch {
      showToast("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [normalizedPhone, showToast]);

  const handleVerifyOtp = useCallback(async () => {
    if (otpCode.length !== 6) { showToast("El código tiene 6 dígitos."); return; }
    setLoading(true);
    try {
      const body: { phone: string; code: string; name?: string } = { phone: normalizedPhone, code: otpCode };
      if (name.trim()) body.name = name.trim();
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) { showToast(data.error ?? "Código incorrecto."); return; }
      if (data.customer) {
        registerCustomer({ name: data.customer.name, phone: data.customer.phone, location: "", reference: "" });
      }
      showToast(data.isNew ? `¡Bienvenido, ${data.customer?.name ?? ""}!` : `¡Hola de nuevo, ${data.customer?.name ?? ""}!`);
      setTimeout(() => router.push(next), 900);
    } catch {
      showToast("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [otpCode, normalizedPhone, name, registerCustomer, router, next, showToast]);

  const btnBase =
    "group flex w-full min-h-12 items-center justify-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60 disabled:cursor-not-allowed";
  const inputBase =
    "w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-white dark:bg-gray-900 sm:flex-row">
      {/* ── Panel promo (desktop) ── */}
      <aside
        aria-hidden
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-10 text-white sm:flex sm:w-[44%] lg:w-[40%]"
        style={{ background: "linear-gradient(150deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 60%, #061a1e) 70%, #061a1e 100%)" }}
      >
        <span className="text-xl font-black tracking-tight">Buleje</span>
        <div>
          <p className="text-3xl font-black leading-[1.1] tracking-tight lg:text-4xl">
            Tu barrio,
            <br />
            a un toque.
          </p>
          <p className="mt-4 max-w-sm text-base font-medium text-white/85">
            Pedí a las bodegas y restaurantes de Ciudad Constitución con delivery rápido.
            Pagás al recibir — Yape, Plin o efectivo.
          </p>
        </div>
        <ul className="space-y-2 text-sm font-medium text-white/90">
          <li>Envío gratis desde S/50</li>
          <li>10% OFF en tu primera compra</li>
          <li>Seguí tu pedido en vivo</li>
        </ul>
      </aside>

      {/* ── Autenticación ── */}
      <main className="relative flex flex-1 flex-col">
        {/* Volver */}
        <div className="px-5 pt-5 sm:px-8">
          <Link
            href={next}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-sm">
            {/* Logo + título */}
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 dark:bg-white text-2xl font-black text-white dark:text-gray-900 shadow-md">
                B
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                  {step === "otp" ? "Verificación" : "Ingresá o creá tu cuenta"}
                </h1>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                  {step === "otp"
                    ? "Ingresá el código que te enviamos por WhatsApp"
                    : "Comprá en las tiendas de tu barrio, seguro y al toque"}
                </p>
              </div>
            </div>

            {/* Paso phone — métodos */}
            {step === "phone" && phoneView === "methods" && (
              <div className="space-y-3">
                <button onClick={() => oauthReady && void signInWithSupabase("google")} disabled={!oauthReady} className={btnBase}>
                  <GoogleIcon />
                  {oauthReady ? "Continuar con Google" : "Google — Próximamente"}
                </button>
                <button
                  onClick={() => setPhoneView("form")}
                  className="flex w-full min-h-12 items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:opacity-95 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <Phone className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Continuar con tu celular
                </button>
                <button onClick={() => oauthReady && void signInWithSupabase("facebook")} disabled={!oauthReady} className={btnBase}>
                  <FacebookIcon />
                  {oauthReady ? "Continuar con Facebook" : "Facebook — Próximamente"}
                </button>
              </div>
            )}

            {/* Paso phone — formulario */}
            {step === "phone" && phoneView === "form" && (
              <div className="space-y-4">
                {!oauthName && (
                  <button
                    type="button"
                    onClick={() => setPhoneView("methods")}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                  >
                    ← Otras opciones
                  </button>
                )}
                <div>
                  <label htmlFor="login-phone" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    Número de celular
                  </label>
                  <div className="flex gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      🇵🇪 +51
                    </span>
                    <input
                      id="login-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleSendOtp(); }}
                      placeholder="987 654 321"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      className={`flex-1 ${inputBase}`}
                    />
                  </div>
                </div>
                {normalizedPhone.length >= 9 && (
                  <div>
                    <label htmlFor="login-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Nombre <span className="font-normal normal-case text-gray-400">(opcional)</span>
                    </label>
                    <input
                      id="login-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      autoComplete="name"
                      className={inputBase}
                    />
                  </div>
                )}
                <button
                  onClick={() => void handleSendOtp()}
                  disabled={loading}
                  className="w-full min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
                >
                  {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Enviando…</span> : "Continuar"}
                </button>
              </div>
            )}

            {/* Paso OTP */}
            {step === "otp" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Shield className="h-7 w-7" aria-hidden />
                  </div>
                  <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                    Código de 6 dígitos enviado a{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">+51 {phone}</span>
                  </p>
                </div>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyOtp(); }}
                  placeholder="• • • • • •"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 dark:text-white placeholder-gray-300 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <button
                  onClick={() => void handleVerifyOtp()}
                  disabled={loading || otpCode.length !== 6}
                  className="w-full min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
                >
                  {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Verificando…</span> : "Verificar y entrar"}
                </button>
                <button
                  onClick={() => { setOtpCode(""); setStep("phone"); showToast("Puedes solicitar un nuevo código."); }}
                  disabled={loading}
                  className="min-h-11 w-full text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  ← Volver y solicitar nuevo código
                </button>
              </div>
            )}

            {/* Legal */}
            <p className="mt-8 text-center text-[length:var(--ts-2xs)] leading-relaxed text-gray-400 dark:text-gray-500">
              Al continuar aceptas los{" "}
              <Link href="/terminos" className="underline hover:text-[var(--accent)]">Términos</Link>{" "}
              y la{" "}
              <Link href="/privacidad" className="underline hover:text-[var(--accent)]">Política de Privacidad</Link>
            </p>
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-center text-sm font-medium text-white shadow-lg motion-safe:animate-[fadeIn_0.2s]">
          {toast}
        </div>
      )}
    </div>
  );
}
