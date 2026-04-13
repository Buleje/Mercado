"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos de respuesta de la API
// ---------------------------------------------------------------------------
interface VerifyResponse {
  ok: boolean;
  customer?: { id: string; name: string; phone: string };
  isNew?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Hook público — permite abrir/cerrar el modal desde cualquier componente
// ---------------------------------------------------------------------------
export function useAuthModal() {
  const [open, setOpen] = useState(false);
  const openAuthModal = useCallback(() => setOpen(true), []);
  const closeAuthModal = useCallback(() => setOpen(false), []);
  return { authModalOpen: open, openAuthModal, closeAuthModal };
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type Tab = "login" | "register";
type Step = "phone" | "otp";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Iconos SVG inline (sin framer-motion ni librerías externas de íconos extra)
// ---------------------------------------------------------------------------
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="#1877F2"
    >
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function AuthModal({ open, onClose }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const lastFocusableRef = useRef<HTMLButtonElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Controla la animación CSS de entrada / salida
  useEffect(() => {
    if (open) {
      setRendered(true);
      // Forzar reflow para que la transición de entrada funcione
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRendered(false), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Cierre con Escape + bloqueo del scroll del body
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Focus al primer elemento interactivo cuando abre o cambia step
  useEffect(() => {
    if (!open) return;
    if (step === "otp") {
      otpInputRef.current?.focus();
    } else if (firstFocusableRef.current) {
      firstFocusableRef.current.focus();
    }
  }, [open, tab, step]);

  // Focus trap dentro del modal
  const handleFocusTrap = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      if (!firstFocusableRef.current || !lastFocusableRef.current) return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusableRef.current) {
          e.preventDefault();
          lastFocusableRef.current.focus();
        }
      } else {
        if (document.activeElement === lastFocusableRef.current) {
          e.preventDefault();
          firstFocusableRef.current.focus();
        }
      }
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Normaliza el numero: elimina espacios y guiones
  const normalizedPhone = phone.replace(/\D/g, "");

  const handleSendOtp = useCallback(async () => {
    if (!normalizedPhone || normalizedPhone.length < 9) {
      showToast("Ingresa un numero de celular valido (9 digitos).");
      return;
    }
    if (tab === "register" && !name.trim()) {
      showToast("Ingresa tu nombre completo para registrarte.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "No se pudo enviar el codigo. Intenta de nuevo.");
        return;
      }
      showToast("Codigo enviado. Revisa tu WhatsApp.");
      setStep("otp");
    } catch {
      showToast("Error de conexion. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [normalizedPhone, name, tab, showToast]);

  const handleVerifyOtp = useCallback(async () => {
    if (otpCode.length !== 6) {
      showToast("El codigo tiene 6 digitos.");
      return;
    }
    setLoading(true);
    try {
      const body: { phone: string; code: string; name?: string } = {
        phone: normalizedPhone,
        code: otpCode,
      };
      if (tab === "register" && name.trim()) {
        body.name = name.trim();
      }
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as VerifyResponse;
      if (!res.ok) {
        showToast(data.error ?? "Codigo incorrecto. Intenta de nuevo.");
        return;
      }
      showToast(data.isNew ? `Bienvenido, ${data.customer?.name ?? ""}!` : `Hola de nuevo, ${data.customer?.name ?? ""}!`);
      setTimeout(() => onClose(), 1500);
    } catch {
      showToast("Error de conexion. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [otpCode, normalizedPhone, name, tab, showToast, onClose]);

  const handleResendOtp = useCallback(async () => {
    setOtpCode("");
    setStep("phone");
    showToast("Puedes solicitar un nuevo codigo.");
  }, [showToast]);

  const handleGoogle = useCallback(() => {
    // Redirect to Google OAuth flow — the server handles CSRF + consent
    window.location.href = "/api/auth/google";
  }, []);

  const handleFacebook = useCallback(() => {
    // Redirect to Facebook OAuth flow — the server handles CSRF + consent
    window.location.href = "/api/auth/facebook";
  }, []);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    setStep("phone");
    setOtpCode("");
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  if (!rendered) return null;

  return (
    // Backdrop con blur
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={[
        "fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-0 sm:px-4",
        "bg-black/50 backdrop-blur-sm",
        "transition-opacity duration-250",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      ].join(" ")}
      aria-hidden={!open}
    >
      {/* Panel del modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Autenticacion — Buleje"
        onKeyDown={handleFocusTrap}
        className={[
          // Layout
          "relative w-full sm:max-w-md",
          // Mobile: ocupa toda la pantalla por abajo; desktop: centrado con bordes
          "fixed inset-x-0 bottom-0 rounded-t-2xl",
          "sm:static sm:rounded-2xl",
          // Fondo siempre blanco (incluso en dark mode, por diseño)
          "bg-white shadow-2xl",
          // Animación CSS: escala + opacidad
          "transition-all duration-250 ease-out",
          visible
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95",
        ].join(" ")}
      >
        {/* Toast */}
        {toast && (
          <div
            role="alert"
            className="absolute inset-x-4 top-4 z-10 rounded-xl bg-[#2563EB] px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg"
          >
            {toast}
          </div>
        )}

        {/* Boton cerrar */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-[#2563EB]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-8 pt-6 sm:px-8">
          {/* Logo + título */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-2xl font-black shadow-lg shadow-blue-500/25">
              B
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {tab === "register" ? "Crea tu cuenta" : "Bienvenido"}
            </h2>
            <p className="text-sm text-gray-400">
              {tab === "register" ? "Regístrate para comprar y recibir ofertas" : "Inicia sesión con tu celular"}
            </p>
          </div>

          {/* Tabs — solo visibles en paso "phone" */}
          {step === "phone" && (
            <div className="mb-6 flex rounded-xl border border-gray-200 p-1 bg-gray-50">
              <button
                ref={firstFocusableRef}
                onClick={() => handleTabChange("login")}
                className={[
                  "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                  "min-h-[44px]",
                  tab === "login"
                    ? "bg-white text-[#2563EB] shadow-sm border-b-2 border-[#2563EB]"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                Iniciar sesion
              </button>
              <button
                onClick={() => handleTabChange("register")}
                className={[
                  "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                  "min-h-[44px]",
                  tab === "register"
                    ? "bg-white text-[#2563EB] shadow-sm border-b-2 border-[#2563EB]"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                Registrarse
              </button>
            </div>
          )}

          {/* ── Paso 1: Ingresar telefono ── */}
          {step === "phone" && (
            <div className="space-y-4">
              {/* Campo nombre — solo en registro */}
              {tab === "register" && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide"
                  >
                    Nombre completo
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    autoComplete="name"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              )}

              {/* Celular */}
              <div>
                <label
                  htmlFor="auth-phone"
                  className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide"
                >
                  Numero de celular
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700 shrink-0">
                    <span className="text-base leading-none">🇵🇪</span>
                    <span>+51</span>
                  </div>
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="987 654 321"
                    autoComplete="tel-national"
                    inputMode="numeric"
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              {/* Boton enviar OTP */}
              <button
                onClick={() => { void handleSendOtp(); }}
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#2563EB] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? "Enviando..."
                  : tab === "login"
                  ? "Enviar codigo"
                  : "Crear cuenta y enviar codigo"}
              </button>
            </div>
          )}

          {/* ── Paso 2: Ingresar codigo OTP ── */}
          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Ingresa el codigo de 6 digitos enviado a{" "}
                <span className="font-semibold text-gray-900">+51 {phone}</span>
              </p>

              <div>
                <label
                  htmlFor="auth-otp"
                  className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide"
                >
                  Codigo de verificacion
                </label>
                <input
                  id="auth-otp"
                  ref={otpInputRef}
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 placeholder-gray-300 outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              {/* Boton verificar */}
              <button
                onClick={() => { void handleVerifyOtp(); }}
                disabled={loading || otpCode.length !== 6}
                className="w-full min-h-[44px] rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#2563EB] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Verificando..." : "Verificar y entrar"}
              </button>

              {/* Reenviar */}
              <button
                onClick={() => { void handleResendOtp(); }}
                disabled={loading}
                className="w-full text-sm text-[#2563EB] underline hover:text-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                Volver y solicitar nuevo codigo
              </button>
            </div>
          )}

          {/* Divisor + botones sociales — solo en paso phone */}
          {step === "phone" && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">
                  o continua con
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleGoogle}
                  className="flex w-full min-h-[44px] items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <GoogleIcon />
                  Continuar con Google
                </button>

                <button
                  ref={lastFocusableRef}
                  onClick={handleFacebook}
                  className="flex w-full min-h-[44px] items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <FacebookIcon />
                  Continuar con Facebook
                </button>
              </div>
            </>
          )}

          {/* Aviso legal */}
          <p className="mt-5 text-center text-xs text-gray-400 leading-relaxed">
            Al continuar aceptas los{" "}
            <a
              href="/terminos"
              className="underline hover:text-[#2563EB] transition-colors"
            >
              Terminos
            </a>{" "}
            y la{" "}
            <a
              href="/privacidad"
              className="underline hover:text-[#2563EB] transition-colors"
            >
              Politica de Privacidad
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
