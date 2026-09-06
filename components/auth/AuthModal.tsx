"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import { X, User, Phone, Shield, Loader2 } from "lucide-react";
import {
  getSupabaseBrowser,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/client";
import { useCustomer } from "@/contexts/customer-context";

// ---------------------------------------------------------------------------
// Tipos de respuesta de la API
// ---------------------------------------------------------------------------
interface VerifyResponse {
  ok: boolean;
  customer?: { id: string; name: string; phone: string };
  isNew?: boolean;
  error?: string;
}

interface DniResponse {
  ok: boolean;
  nombre?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Hook público — permite abrir/cerrar el modal desde cualquier componente
// ---------------------------------------------------------------------------
export function useAuthModal() {
  // Brandon 2026-06-14: el login dejó de ser modal — ahora es una PÁGINA
  // dedicada (/login). `openAuthModal` navega a /login?next=<ruta actual> en
  // vez de abrir el modal. `authModalOpen` queda siempre false (el <AuthModal/>
  // ya no se monta), así no hace falta tocar los 8 call sites.
  const router = useRouter();
  const pathname = usePathname();
  const openAuthModal = useCallback(() => {
    const next =
      pathname && pathname !== "/login"
        ? `?next=${encodeURIComponent(pathname)}`
        : "";
    router.push(`/login${next}`);
  }, [router, pathname]);
  const closeAuthModal = useCallback(() => {}, []);
  return { authModalOpen: false, openAuthModal, closeAuthModal };
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
//
// 2026-04-21 — Modal unificado: ya NO hay tabs login/registro. Siempre se
// muestra el flujo completo (Google · Facebook · DNI + Nombre + Phone).
// Si el cliente ya existe (lookup por teléfono), los campos se pre-llenan.
type Tab = "login" | "register";
type Step = "phone" | "otp";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Nombre pre-llenado (típicamente del flow OAuth — Google/Facebook ya
   * sabe el nombre del usuario; solo falta el celular para crear el
   * Customer). Si está presente, el modal abre con un copy distinto:
   * "Casi listo — solo falta tu celular".
   */
  initialName?: string;
}

// ---------------------------------------------------------------------------
// Iconos SVG inline
// ---------------------------------------------------------------------------
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
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
      fill="white"
    >
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function AuthModal({ open, onClose, initialName }: AuthModalProps) {
  // Tab unificada — siempre "register" semánticamente para que el OTP verify
  // procese name + DNI cuando el customer aún no existe. Si ya existe, el
  // backend ignora los campos y devuelve { isNew: false } igualmente.
  const tab: Tab = "register";

  // Sincroniza el customer con el context + localStorage tras login OK
  // (sin esto el navbar no muestra iniciales y /checkout/auth no detecta sesión)
  const { register: registerCustomer } = useCustomer();
  const [step, setStep] = useState<Step>("phone");
  // Vista del paso "phone" (Brandon 2026-06-14, estilo Rappi): "methods" =
  // botones (Google / celular / Facebook); "form" = ingreso de celular. Si el
  // usuario vuelve de OAuth (initialName), saltamos directo al form.
  const [phoneView, setPhoneView] = useState<"methods" | "form">("methods");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(initialName ?? "");

  // Si initialName cambia (por OAuth completion), refrescamos el state.
  useEffect(() => {
    if (initialName && initialName.trim() && !name) {
      setName(initialName);
    }
    // intencional: solo cuando initialName cambia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialName]);
  const [dni, setDni] = useState("");
  const [, setDniLoading] = useState(false);
  const [, setDniError] = useState<string | null>(null);
  const [dniVerified, setDniVerified] = useState(false);
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      setPhoneView("methods"); // reset al cerrar → siempre abre en los botones
      const timer = setTimeout(() => setRendered(false), 300);
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
    [],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Normaliza el número: elimina espacios y guiones
  const normalizedPhone = phone.replace(/\D/g, "");

  // ── DNI Lookup ──
  const handleDniLookup = useCallback(async () => {
    const cleanDni = dni.replace(/\D/g, "");
    if (cleanDni.length !== 8) {
      setDniError("El DNI debe tener 8 dígitos");
      return;
    }

    setDniLoading(true);
    setDniError(null);
    setDniVerified(false);

    try {
      const res = await fetch("/api/auth/dni", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ dni: cleanDni }),
      });
      const data = (await res.json()) as DniResponse;

      if (data.ok && data.nombre) {
        setName(data.nombre);
        setDniVerified(true);
      } else {
        setDniError(data.error ?? "No se encontró el DNI. Escribe tu nombre.");
      }
    } catch {
      setDniError("Error de conexión. Escribe tu nombre manualmente.");
    } finally {
      setDniLoading(false);
    }
  }, [dni]);

  // Auto-lookup cuando DNI tiene 8 dígitos
  useEffect(() => {
    const cleanDni = dni.replace(/\D/g, "");
    if (cleanDni.length === 8 && tab === "register") {
      void handleDniLookup();
    }
    if (cleanDni.length < 8) {
      setDniVerified(false);
      setDniError(null);
    }
  }, [dni, tab, handleDniLookup]);

  const handleSendOtp = useCallback(async () => {
    if (!normalizedPhone || normalizedPhone.length < 9) {
      showToast("Ingresa un número de celular válido (9 dígitos).");
      return;
    }
    // Nombre ahora es OPCIONAL: si el customer ya existe el backend lo
    // ignora y devuelve el name actual; si es nuevo y queda vacío, queda
    // como "Cliente" hasta que lo edite en su perfil. UX rápida pedida.
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "No se pudo enviar el código. Intenta de nuevo.");
        return;
      }
      showToast("Código enviado. Revisa tu WhatsApp.");
      setStep("otp");
    } catch {
      showToast("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [normalizedPhone, name, tab, showToast]);

  const handleVerifyOtp = useCallback(async () => {
    if (otpCode.length !== 6) {
      showToast("El código tiene 6 dígitos.");
      return;
    }
    setLoading(true);
    try {
      const body: { phone: string; code: string; name?: string; dni?: string } = {
        phone: normalizedPhone,
        code: otpCode,
      };
      if (tab === "register") {
        if (name.trim()) body.name = name.trim();
        const cleanDni = dni.replace(/\D/g, "");
        if (cleanDni.length === 8) body.dni = cleanDni;
      }
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        showToast(data.error ?? "Código incorrecto. Intenta de nuevo.");
        return;
      }

      // Persistir en CustomerContext → actualiza nav (iniciales + nombre)
      // y deja listo el localStorage para futuras visitas.
      if (data.customer) {
        const cleanDni = dni.replace(/\D/g, "");
        registerCustomer({
          name: data.customer.name,
          phone: data.customer.phone,
          ...(cleanDni.length === 8 ? { dni: cleanDni } : {}),
          location: "",
          reference: "",
        });
      }

      showToast(
        data.isNew
          ? `¡Bienvenido, ${data.customer?.name ?? ""}!`
          : `¡Hola de nuevo, ${data.customer?.name ?? ""}!`,
      );
      setTimeout(() => onClose(), 1500);
    } catch {
      showToast("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  }, [otpCode, normalizedPhone, name, dni, tab, showToast, onClose, registerCustomer]);

  const handleResendOtp = useCallback(() => {
    setOtpCode("");
    setStep("phone");
    showToast("Puedes solicitar un nuevo código.");
  }, [showToast]);

  // Ola 7 — OAuth via Supabase Auth si está configurado.
  // Si no, fallback al flujo custom legacy `/api/auth/google` (queda vivo).
  const oauthReady = isSupabaseAuthConfigured();

  const signInWithSupabase = useCallback(
    async (provider: "google" | "facebook") => {
      try {
        const supabase = getSupabaseBrowser();
        const origin = window.location.origin;
        const nextParam = encodeURIComponent("/marketplace/explorar");
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${origin}/api/auth/oauth/callback?next=${nextParam}`,
          },
        });
        if (error) {
          console.error(`[AuthModal] ${provider} OAuth error:`, error.message);
          showToast("No se pudo iniciar sesión. Intenta de nuevo.");
        }
        // Si no hay error, Supabase redirige al consent del provider.
      } catch (err) {
        console.error(`[AuthModal] ${provider} exception:`, err);
        showToast("No se pudo iniciar sesión. Intenta de nuevo.");
      }
    },
    [showToast],
  );

  const handleGoogle = useCallback(() => {
    if (!oauthReady) return;
    void signInWithSupabase("google");
  }, [oauthReady, signInWithSupabase]);

  const handleFacebook = useCallback(() => {
    if (!oauthReady) return;
    void signInWithSupabase("facebook");
  }, [oauthReady, signInWithSupabase]);

  // handleTabChange eliminado — modal unificado, sin tabs.

  // ── Phone lookup: si el customer ya existe (por phone), pre-llena name+dni.
  // Llamamos al verify endpoint en modo "lookup-only" para no enviar OTP.
  // 2026-04-21 — UX rápida pedida por el negocio.
  useEffect(() => {
    if (normalizedPhone.length < 9) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/customer-lookup?phone=${encodeURIComponent(normalizedPhone)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          customer?: { name?: string; dni?: string };
        };
        if (cancelled || !data.ok || !data.customer) return;
        if (data.customer.name && !name.trim()) setName(data.customer.name);
        if (data.customer.dni && !dni.trim()) setDni(data.customer.dni);
        if (data.customer.name) setDniVerified(true);
      } catch {
        // silent — el campo queda vacío, el usuario rellena manualmente
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // intencional: solo re-evaluar al cambiar el phone normalizado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedPhone]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  if (!rendered) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={[
        "fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-0 sm:px-4 sm:py-6",
        "bg-black/60 backdrop-blur-md",
        "transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      ].join(" ")}
      // inert en vez de aria-hidden: cuando el modal cierra y el botón X aún
      // tiene focus, aria-hidden en el ancestor dispara warning "Blocked
      // aria-hidden on element because its descendant retained focus".
      // inert prohíbe interacción Y oculta para AT sin ese problema.
      // Fix 2026-04-19 — ver consola /marketplace con modal cerrando.
      inert={!open}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Autenticación — Buleje"
        onKeyDown={handleFocusTrap}
        className={[
          // Fix 2026-06-14: el panel ya NO es `fixed bottom-0` (chocaba con
          // `sm:static` + max-h y cortaba el tope del modal sin scroll). El
          // overlay flex (`items-end sm:items-center`) lo posiciona; el panel
          // solo se autolimita en alto y scrollea internamente. dvh para mobile.
          "relative w-full sm:max-w-[56rem] max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain",
          "rounded-t-3xl sm:rounded-3xl",
          "bg-white dark:bg-gray-900 shadow-2xl",
          "transition-all duration-300 ease-out",
          visible
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-8 sm:translate-y-0 sm:scale-95",
        ].join(" ")}
      >
        {/* Toast */}
        {toast && (
          <div
            role="alert"
            className="absolute inset-x-4 top-4 z-10 rounded-2xl bg-[var(--accent)] px-4 py-3 text-center text-sm font-medium text-white shadow-lg shadow-emerald-500/25 animate-[fadeIn_0.3s_ease-out]"
          >
            {toast}
          </div>
        )}

        {/* Botón cerrar */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 transition-all focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="sm:flex">
        {/* ── Panel promo (desktop, estilo Rappi/split-screen) ── */}
        <aside
          aria-hidden
          className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-8 text-white sm:flex sm:w-[42%] sm:rounded-l-3xl"
          style={{
            background:
              "linear-gradient(150deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 60%, #061a1e) 70%, #061a1e 100%)",
          }}
        >
          <span className="text-lg font-black tracking-tight">Buleje</span>
          <div>
            <p className="text-[1.75rem] font-black leading-[1.1] tracking-tight">
              Tu barrio,
              <br />
              a un toque.
            </p>
            <p className="mt-3 max-w-[16rem] text-sm font-medium text-white/85">
              Pedí a las bodegas y restaurantes de Ciudad Constitución con delivery rápido.
              Pagás al recibir — Yape, Plin o efectivo.
            </p>
          </div>
          <ul className="space-y-1.5 text-sm font-medium text-white/90">
            <li>Envío gratis desde S/50</li>
            <li>10% OFF en tu primera compra</li>
            <li>Seguí tu pedido en vivo</li>
          </ul>
        </aside>

        {/* ── Contenido (auth) ── */}
        <div className="relative flex-1 px-6 pb-8 pt-8 sm:px-10">
          {/* ── Logo + título ── */}
          <div className="mb-7 flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-2xl font-black shadow-md ring-4 ring-white dark:ring-gray-900">
              B
            </div>
            <div className="text-center">
              <h2 className="font-display text-3xl font-semibold text-gray-900 dark:text-white tracking-[var(--ls-tight)]">
                {step === "otp"
                  ? "Verificación"
                  : initialName
                    ? `¡Hola, ${initialName.split(" ")[0]}!`
                    : "Bienvenido a Buleje"}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {step === "otp"
                  ? "Ingresa el código que te enviamos"
                  : initialName
                    ? "Casi listo — solo falta tu celular para terminar"
                    : "Inicia sesión o crea tu cuenta para comprar en tu barrio"}
              </p>
            </div>
          </div>

          {/* ── Métodos (Brandon 2026-06-14, estilo Rappi): botones grandes
              apilados. "Continuar con tu celular" cambia a la vista de ingreso
              de número. Si viene de OAuth (initialName), saltea esto. ── */}
          {step === "phone" && !initialName && phoneView === "methods" && (
            <div className="space-y-3">
              <button
                ref={firstFocusableRef}
                onClick={handleGoogle}
                disabled={!oauthReady}
                title={oauthReady ? undefined : "Configuración pendiente"}
                className="group flex w-full min-h-12 items-center justify-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <GoogleIcon />
                {oauthReady ? "Continuar con Google" : "Google — Próximamente"}
              </button>

              {/* Celular — acción principal (accent, estilo CTA verde de Rappi) */}
              <button
                onClick={() => setPhoneView("form")}
                className="flex w-full min-h-12 items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:opacity-95 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <Phone className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Continuar con tu celular
              </button>

              <button
                onClick={handleFacebook}
                disabled={!oauthReady}
                title={oauthReady ? undefined : "Configuración pendiente"}
                className="group flex w-full min-h-12 items-center justify-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FacebookIcon />
                {oauthReady ? "Continuar con Facebook" : "Facebook — Próximamente"}
              </button>
            </div>
          )}

          {/* ── Paso 1: Formulario simplificado (phone primero) ──
              Cambio 2026-04-21: solo se requiere el celular. Si el customer
              ya existe, el nombre se autollena vía /api/auth/customer-lookup.
              Si NO existe (cliente nuevo), aparece el campo Nombre debajo. */}
          {step === "phone" && (initialName || phoneView === "form") && (
            <div className="space-y-3.5">

              {/* Volver a los métodos (solo si no viene de OAuth) */}
              {!initialName && (
                <button
                  type="button"
                  onClick={() => setPhoneView("methods")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  ← Otras opciones
                </button>
              )}

              {/* Celular — campo principal y único en el primer paso */}
              <div>
                <label
                  htmlFor="auth-phone"
                  className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Número de celular
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
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
                    className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all focus:border-[var(--data-success-500)] focus:ring-2 focus:ring-[var(--data-success-500)]/20"
                  />
                </div>
              </div>

              {/* Nombre — aparece solo si:
                  - El phone tiene 9+ dígitos Y
                  - El backend NO encontró un customer (dniVerified=false) Y
                  - el campo está vacío
                  Si es returning customer, el nombre ya viene autollenado. */}
              {normalizedPhone.length >= 9 && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide"
                  >
                    <User className="h-3.5 w-3.5" />
                    Nombre completo
                    {dniVerified && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-green-700 dark:text-green-300">
                        ✓ Autollenado
                      </span>
                    )}
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (dniVerified) setDniVerified(false);
                    }}
                    placeholder={dniVerified ? "" : "Tu nombre completo (opcional)"}
                    autoComplete="name"
                    className={[
                      "w-full rounded-2xl border bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all",
                      dniVerified
                        ? "border-green-400/50 dark:border-green-500/30 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-700 focus:border-[var(--data-success-500)] focus:ring-2 focus:ring-[var(--data-success-500)]/20",
                    ].join(" ")}
                  />
                  {!dniVerified && (
                    <p className="mt-1 text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">
                      Si ya compraste antes, el nombre se llenará solo. Si sos nuevo, escribilo.
                    </p>
                  )}
                </div>
              )}

              {/* Botón enviar OTP */}
              <button
                onClick={() => {
                  void handleSendOtp();
                }}
                disabled={loading}
                className="w-full min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  "Continuar"
                )}
              </button>
            </div>
          )}

          {/* ── Paso 2: Ingresar código OTP ── */}
          {step === "otp" && (
            <div className="space-y-5">
              {/* Ilustración OTP */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-[var(--data-success-600)] dark:text-emerald-400">
                  <Shield className="h-8 w-8" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  Ingresa el código de 6 dígitos enviado a{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    +51 {phone}
                  </span>
                </p>
              </div>

              <div>
                <label
                  htmlFor="auth-otp"
                  className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide"
                >
                  Código de verificación
                </label>
                <input
                  id="auth-otp"
                  ref={otpInputRef}
                  type="text"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="• • • • • •"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none transition-all focus:border-[var(--data-success-500)] focus:ring-2 focus:ring-[var(--data-success-500)]/20"
                />
              </div>

              {/* Botón verificar */}
              <button
                onClick={() => {
                  void handleVerifyOtp();
                }}
                disabled={loading || otpCode.length !== 6}
                className="w-full min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando...
                  </span>
                ) : (
                  "Verificar y entrar"
                )}
              </button>

              {/* Reenviar */}
              <button
                ref={lastFocusableRef}
                onClick={handleResendOtp}
                disabled={loading}
                className="w-full text-sm font-medium text-[var(--data-success-600)] dark:text-emerald-400 hover:text-[var(--data-success-700)] dark:hover:text-emerald-300 transition-colors disabled:opacity-50 min-h-11"
              >
                ← Volver y solicitar nuevo código
              </button>
            </div>
          )}

          {/* Aviso legal */}
          <p className="mt-6 text-center text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 leading-relaxed">
            Al continuar aceptas los{" "}
            <a
              href="/terminos"
              className="underline decoration-gray-300 dark:decoration-gray-600 hover:text-[var(--data-success-500)] transition-colors"
            >
              Términos
            </a>{" "}
            y la{" "}
            <a
              href="/privacidad"
              className="underline decoration-gray-300 dark:decoration-gray-600 hover:text-[var(--data-success-500)] transition-colors"
            >
              Política de Privacidad
            </a>
          </p>
        </div>{/* /contenido auth */}
        </div>{/* /split-screen */}
      </div>
    </div>
  );
}

export default AuthModal;
