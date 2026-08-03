"use client";

/**
 * /admin/login — Login universal para dueños y staff de tienda.
 *
 * Mayo 2026: solo usuario + contraseña. El backend busca globalmente por
 * username y resuelve el tenantId del AdminUser que matchee — el usuario
 * NO necesita saber su slug.
 *
 * Layout: split-view 2 columnas en desktop (hero teal a la izquierda,
 * form a la derecha). Mobile: stack single-column con form arriba.
 */

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useRef, useMemo, type FormEvent, type KeyboardEvent } from "react";
import {
  Loader2, LogIn, User, Lock, Eye, EyeOff, AlertTriangle,
  Store, ArrowRight, ShieldCheck,
  Bike, Crown, ChevronDown,
  TrendingUp, ShoppingBag, Wallet, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getKeepAlive, setKeepAlive } from "@/lib/session-keepalive";

// Brandon mayo 14 2026 v3: layout editorial con dashboard preview.
//   - Lado izquierdo: form de login dentro de una card flotante, brand
//     compacto, trust badges sutiles. Centrado vertical.
//   - Lado derecho (lg+): MOCKUP DEL DASHBOARD real con stat hero animada,
//     mini-chart de barras, feed de pedidos en vivo, badges de estado.
//     Rotado sutil para look 3D/pro. Halo accent + dot grid de fondo.
//   - Paleta: --accent + neutros + variantes de opacidad. Sin random colors.
//   - Tipografía: italic serif para el headline, sans-serif tight para datos.

export default function AdminLoginPage() {
  const fromRef = useRef<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  const tenantPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(/^(\/t\/[^/]+)\/admin/);
    return match ? match[1] : "";
  }, []);
  const adminPath = (path: string) => `${tenantPrefix}${path}`;

  /**
   * SECURITY 2026-05-16 (P0 open redirect fix): valida que un destino
   * proveniente de `?from=` sea SOLO una ruta interna relativa. Bloquea
   * `https://evil.com`, `//evil.com`, `javascript:`, `data:` y cualquier
   * forma con `://`. Si el valor es inválido, retorna el fallback admin.
   * Antes: `router.push(decodeURIComponent(fromRef.current))` aceptaba
   * cualquier URL externa → phishing via WhatsApp post-login.
   */
  const safeRedirectPath = (raw: string | null | undefined, fallback: string): string => {
    if (!raw) return fallback;
    let dest = raw;
    try {
      dest = decodeURIComponent(raw);
    } catch {
      return fallback;
    }
    if (!dest.startsWith("/")) return fallback;
    if (dest.startsWith("//")) return fallback;      // protocol-relative
    if (dest.includes("://")) return fallback;        // absolute URL
    if (/^[a-z]+:/i.test(dest)) return fallback;      // javascript:, data:, etc.
    if (dest.includes("\\")) return fallback;          // backslash tricks
    return dest;
  };

  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // B2 "confiar en este equipo": activa el keep-alive (sesión no se cae mientras
  // trabajás en ESTE dispositivo). Reusa lib/session-keepalive — NO debilita
  // tokens ni saltea 2FA. Pre-marcado si ya estaba activo.
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  // Tras autenticar arrancamos la navegación DURA (ver hardRedirect). Este flag
  // mantiene el botón deshabilitado y en estado "Entrando…" mientras el browser
  // recarga — evita que el usuario re-submitee y que el botón parpadee a activo.
  const [redirecting, setRedirecting] = useState(false);
  // ADR-120 login unificado: si la credencial existe en varias tiendas, el
  // backend devuelve la lista y mostramos un selector en vez de adivinar.
  const [tenantChoices, setTenantChoices] = useState<Array<{ slug: string; name: string }> | null>(null);
  // Bloq Mayús activado — causa #1 de "puse bien la clave y no me deja".
  const [capsLock, setCapsLock] = useState(false);
  // Segundos restantes tras un 429 (rate limit / lockout). Mientras >0, el
  // submit se deshabilita y mostramos una cuenta regresiva: recargar NO ayuda.
  const [retryAfter, setRetryAfter] = useState(0);
  // Motivo por el que llegó al login (sesión expirada / ruta protegida).
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fromRef.current = params.get("from");
    // Banner de contexto: si lo redirigieron desde una ruta protegida.
    const r = params.get("reason");
    if (r === "expired") setReason("Tu sesión expiró. Ingresá de nuevo.");
    else if (fromRef.current) setReason("Inicia sesión para continuar.");

    // Login universal (ADR-120): el backend resuelve el tenant por la
    // credencial. Si vino ?tenant= (desde un /t/{slug} o el superadmin) lo
    // guardamos SOLO como hint para el header x-tenant-id y el redirect
    // post-login — el usuario nunca ve "entrando a (tienda)": siempre es
    // usuario + contraseña.
    const tenantParam = params.get("tenant");
    if (tenantParam) {
      localStorage.setItem("active-tenant-slug", tenantParam);
      sessionStorage.setItem("active-tenant-slug", tenantParam);
      if (!fromRef.current) fromRef.current = `/t/${tenantParam}/admin`;
    }

    const saved = localStorage.getItem("login-remember-username");
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }

    // Pre-marcar "confiar en este equipo" si el keep-alive ya estaba activo.
    setTrustDevice(getKeepAlive());

    // SECURITY 2026-05-16 (P0 fix): eliminado el flujo de auto-login con
    // password desde localStorage. Antes leía `sa-cred-${tenantParam}` con
    // {username, password} en plaintext y los seteaba en el form si vino
    // `?auto=1` desde superadmin/tenants → cualquier XSS robaba credenciales.
    // Ahora solo precargamos el username via ?user= (no password). El
    // superadmin debe pegar la contraseña temporal manualmente.
    const userParam = params.get("user");
    if (userParam) setUsername(userParam);

    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Cuenta regresiva del bloqueo por rate limit / lockout (429). Tick 1s.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = setInterval(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [retryAfter]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  };

  /**
   * FIX 2026-07-19 (Brandon: "me logueo y no entra, recargo el login y recién
   * funciona"). Causa: tras autenticar, la cookie de sesión ya está seteada,
   * pero `router.push()` es una navegación SOFT del App Router que puede servir
   * el RSC de `/admin` cacheado/prefetcheado de ANTES del login (cuando el
   * middleware redirigía a /login) → rebota a login EN SILENCIO. Un reload duro
   * funcionaba porque hace un request nuevo y el middleware lee la cookie fresca.
   *
   * Solución: cruzar la frontera de auth con navegación DURA
   * (`window.location.assign`), que fuerza un documento nuevo. Es la corrección
   * estándar para transiciones no-autenticado → autenticado con cookies HttpOnly.
   */
  const hardRedirect = (path: string) => {
    setRedirecting(true);
    window.location.assign(path);
  };

  const handleSubmit = async (e?: FormEvent, chosenSlug?: string) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // ADR-120: el backend resuelve el tenant por la credencial (login global).
      // `chosenSlug` solo se envía cuando el usuario eligió en el selector de
      // tiendas (credencial duplicada). Igual mandamos el hint para fallbacks.
      const slugFromUrl = typeof window !== "undefined"
        ? window.location.pathname.match(/^\/t\/([^/]+)\/admin/)?.[1]
        : null;
      const slugFromStorage = typeof window !== "undefined"
        ? localStorage.getItem("active-tenant-slug")
        : null;
      const hintSlug = slugFromUrl || slugFromStorage || "main";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-tenant-id": hintSlug,
      };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({
          // trim: espacios pegados desde copy-paste o el teclado móvil hacían
          // fallar un usuario correcto ("no me deja entrar").
          username: username.trim() || undefined,
          password: pw,
          ...(chosenSlug ? { tenantSlug: chosenSlug } : {}),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          requires2FA?: boolean;
          requiresTenantChoice?: boolean;
          options?: Array<{ slug: string; name: string }>;
          role?: string;
          onboardingPending?: boolean;
          tenantId?: string;
          tenantSlug?: string;
          mustChangePassword?: boolean;
          lastLoginAt?: string | null;
          lastLoginIp?: string | null;
        };

        // ── Credencial en varias tiendas: mostrar selector ──────────────
        if (data.requiresTenantChoice && data.options && data.options.length > 0) {
          setTenantChoices(data.options);
          setLoading(false);
          return;
        }

        // ── 2FA requerido: redirigir sin mostrar error ──────────────────
        if (data.requires2FA) {
          if (rememberMe) localStorage.setItem("login-remember-username", username.trim());
          else localStorage.removeItem("login-remember-username");
          // Preservar `from` para post-2FA redirect. Nav dura: la página 2FA
          // lee la cookie pending-totp recién seteada (mismo race que /admin).
          const dest = fromRef.current
            ? `/admin/login/2fa?from=${encodeURIComponent(fromRef.current)}`
            : "/admin/login/2fa";
          hardRedirect(dest);
          return;
        }

        if (rememberMe) localStorage.setItem("login-remember-username", username.trim());
        else localStorage.removeItem("login-remember-username");

        // B2: aplicar "confiar en este equipo" a la sesión recién creada
        // (keep-alive proactivo mientras trabajás; nada de saltar 2FA).
        setKeepAlive(trustDevice);

        if (data.tenantSlug) {
          localStorage.setItem("active-tenant-slug", data.tenantSlug);
          sessionStorage.setItem("active-tenant-slug", data.tenantSlug);
        }
        // B3 "último acceso": guardamos el ingreso anterior para que el panel
        // lo muestre al entrar (un solo aviso, se limpia al mostrarse).
        if (data.lastLoginAt) {
          try {
            sessionStorage.setItem(
              "bsm-last-login",
              JSON.stringify({ at: data.lastLoginAt, ip: data.lastLoginIp ?? null }),
            );
          } catch {
            // sessionStorage puede fallar (modo privado): sin aviso, sin bug.
          }
        }
        // ── Contraseña temporal (reset del superadmin): forzar cambio (ADR-133) ──
        if (data.mustChangePassword) {
          hardRedirect("/admin/cambiar-clave");
          return;
        }
        if (data.onboardingPending && !fromRef.current) {
          hardRedirect("/onboarding");
        } else if (data.role === "owner" || data.role === "platform_admin") {
          hardRedirect("/superadmin/login");
        } else {
          hardRedirect(safeRedirectPath(fromRef.current, adminPath("/admin")));
        }
      } else if (res.status === 429) {
        // Rate limit o lockout: recargar NO ayuda (es por tiempo del servidor).
        // Mostramos cuenta regresiva para que el usuario sepa cuánto esperar.
        const ra = Number(res.headers.get("Retry-After")) || 60;
        setRetryAfter(ra);
        setError(null);
      } else if (res.status === 400) {
        showError("Completá tu usuario y contraseña.");
      } else if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        const left = body?.attemptsLeft;
        let msg = capsLock
          ? "Usuario o contraseña incorrectos. Ojo: Bloq Mayús está activado."
          : "Usuario o contraseña incorrectos.";
        if (typeof left === "number" && left >= 0 && left <= 2) {
          msg +=
            left === 0
              ? " Cuenta bloqueada 15 min por seguridad."
              : ` Te queda${left === 1 ? "" : "n"} ${left} intento${left === 1 ? "" : "s"}.`;
        }
        showError(msg);
      } else if (res.status >= 500) {
        showError("El servidor tuvo un problema. Reintentá en unos segundos.");
      } else {
        showError("No se pudo iniciar sesión.");
      }
    } catch {
      showError(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "Sin conexión. Revisá tu internet e intentá de nuevo."
          : "No se pudo conectar con el servidor. Reintentá.",
      );
    } finally {
      setLoading(false);
    }
  };

  /** Detecta Bloq Mayús en teclado físico para avisar en el form. */
  const detectCapsLock = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  };

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleBypass = async () => {
    setBypassLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bypass", { method: "POST" });
      if (res.ok) {
        hardRedirect(safeRedirectPath(fromRef.current, adminPath("/admin")));
        return;
      }
      showError(
        res.status === 404
          ? "Entrar sin login está desactivado"
          : "No se pudo entrar sin login"
      );
    } catch {
      showError("No se pudo entrar sin login");
    }
    setBypassLoading(false);
  };

  const isDev =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--surface-canvas)] grid lg:grid-cols-[1fr_1.15fr]">
      {/* CSS scoped que oculta widgets flotantes globales en el login */}
      <style jsx global>{`
        body[data-route="admin-login"] [data-floating-widget],
        body[data-route="admin-login"] .floating-widget,
        body[data-route="admin-login"] [aria-label*="Productos recientes"],
        body[data-route="admin-login"] [aria-label*="Carrito"],
        body[data-route="admin-login"] [aria-label*="WhatsApp"] {
          display: none !important;
        }
      `}</style>
      <BodyRouteMark />

      {/* Halo global accent — atrás de todo, da continuidad de marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      {/* ─── COLUMNA IZQUIERDA — Form editorial centrado ─────────────── */}
      <aside
        className="relative flex flex-col justify-center px-5 py-10 sm:px-10 sm:py-16 lg:px-16"
      >
        <div
          className={cn(
            "relative z-10 w-full max-w-[460px] mx-auto",
            shaking && "animate-[shake_0.45s_ease-out]",
          )}
        >
          {/* Brand badge superior */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] shadow-md shadow-[var(--accent)]/30">
              <Store className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                Buleje · Panel
              </p>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Tu negocio en línea
              </p>
            </div>
          </div>

          {/* Eyebrow + título grande */}
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
            Iniciar sesión
          </p>
          <SectionTitle className="text-[2.25rem] sm:text-[2.75rem] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
            Bienvenido
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              de vuelta.
            </span>
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-sm">
            Usuario y contraseña te llevan a tu panel.
          </p>

          {/* ADR-120: selector de tienda cuando la credencial existe en varias */}
          {tenantChoices ? (
            <div className="mt-10 space-y-3">
              <p className="text-sm text-[var(--text-secondary)] max-w-sm">
                Tu cuenta existe en varias tiendas. Elegí a cuál querés entrar:
              </p>
              {tenantChoices.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  disabled={loading || redirecting}
                  onClick={() => handleSubmit(undefined, t.slug)}
                  className="w-full flex items-center justify-between gap-3 h-14 px-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-left font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/8 disabled:opacity-50 transition-all"
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] shrink-0">{t.slug}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setTenantChoices(null); setError(null); }}
                className="text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors pt-1"
              >
                ← Volver
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Usuario
              </label>
              {/* Móvil "sin trabas": el username NO capitaliza la 1ª letra
                  ("Qaadmin") ni autocorrige — era causa #1 de "puse bien todo
                  y no me deja". El trim de espacios va en el submit. */}
              <div className="relative group">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors"
                  strokeWidth={2}
                />
                <input
                  ref={usernameRef}
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/12 hover:border-[var(--accent)]/40 transition-all"
                  placeholder="qaadmin"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Contraseña
              </label>
              <div className="relative group">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors"
                  strokeWidth={2}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  onKeyDown={detectCapsLock}
                  onKeyUp={detectCapsLock}
                  aria-describedby={capsLock ? "caps-lock-warn" : undefined}
                  className="w-full h-14 pl-12 pr-14 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/12 hover:border-[var(--accent)]/40 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {capsLock && (
                <p
                  id="caps-lock-warn"
                  role="status"
                  className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Bloq Mayús está activado
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
                />
                <span className="text-[var(--text-secondary)] font-semibold">
                  Recordarme
                </span>
              </label>
              <a
                href="https://wa.me/51929340532?text=Olvid%C3%A9%20mi%20contrase%C3%B1a%20de%20Buleje"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-[var(--accent)] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* B2: confiar en este equipo → mantiene la sesión activa mientras
                trabajás (keep-alive). No debilita seguridad ni saltea 2FA. */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">Confiar en este equipo</span>
                {" "}— mantené la sesión activa mientras trabajás y no vuelvas al login tan seguido.
              </span>
            </label>

            {reason && !error && retryAfter === 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--accent)]/8 border border-[var(--accent)]/20 text-sm font-semibold text-[var(--text-secondary)]">
                <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
                {reason}
              </div>
            )}

            {retryAfter > 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--data-warning-500)]/10 border-2 border-[var(--data-warning-500)]/25 text-sm font-bold text-[var(--data-warning-700)]"
              >
                <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                <span>
                  Demasiados intentos. Esperá{" "}
                  <span className="tabular-nums">{mmss(retryAfter)}</span> — recargar no ayuda.
                </span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--data-error-500)]/10 border-2 border-[var(--data-error-500)]/25 text-sm font-bold text-[var(--data-error-500)]"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || redirecting || !pw || retryAfter > 0}
              className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white text-base font-extrabold tracking-tight shadow-lg shadow-[var(--accent)]/30 hover:scale-[1.01] hover:shadow-xl hover:shadow-[var(--accent)]/40 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {redirecting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Entrando al panel…
                </>
              ) : loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verificando…
                </>
              ) : retryAfter > 0 ? (
                <>
                  <Clock className="h-5 w-5" strokeWidth={2.25} />
                  Esperá {mmss(retryAfter)}
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" strokeWidth={2.25} />
                  Entrar al panel
                </>
              )}
            </button>

            {/* "Modo demo" solo visible en development (NODE_ENV !== production) */}
            {isDev && (
              <button
                type="button"
                onClick={handleBypass}
                disabled={bypassLoading}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-transparent text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              >
                {bypassLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Modo demo (solo dev)
              </button>
            )}
          </form>
          )}

          {/* Switches a otros paneles — disclosure colapsado por defecto */}
          <details className="mt-10 group">
            <summary className="flex items-center justify-between gap-2 cursor-pointer py-3 px-4 -mx-4 rounded-xl hover:bg-[var(--surface-sunken)]/50 transition-colors list-none">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                ¿Buscás otro panel?
              </span>
              <ChevronDown
                className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-open:rotate-180"
                strokeWidth={2.25}
              />
            </summary>
            <div className="mt-3 space-y-2 pl-1">
              <SwitchChip
                href="/superadmin/login"
                icon={<Crown className="h-4 w-4" strokeWidth={2} />}
                eyebrow="Plataforma"
                title="Acceso Superadmin"
              />
              <SwitchChip
                href="/delivery-app/login"
                icon={<Bike className="h-4 w-4" strokeWidth={2} />}
                eyebrow="Repartidor"
                title="Acceso Delivery"
              />
            </div>
          </details>

          {/* Trust badge inferior */}
          <p className="mt-12 flex items-center gap-2 text-xs text-[var(--text-tertiary)] leading-relaxed">
            <ShieldCheck
              className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
              strokeWidth={2.25}
            />
            Datos aislados · Ley 29733 PE · Cookies HttpOnly · CSRF activo
          </p>
        </div>
      </aside>

      {/* ─── COLUMNA DERECHA — Dashboard preview con vida ─────────────── */}
      <DashboardPreview />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BodyRouteMark — agrega data-route="admin-login" al <body> para que el
// CSS scoped pueda ocultar widgets flotantes globales.
// ─────────────────────────────────────────────────────────────────────────────
function BodyRouteMark() {
  useEffect(() => {
    document.body.setAttribute("data-route", "admin-login");
    return () => {
      document.body.removeAttribute("data-route");
    };
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DashboardPreview — Mockup del panel admin del lado derecho.
// Stat hero gigante + mini-chart bars animado + feed de pedidos en vivo +
// badge "EN VIVO". Rotación 1.2deg para look pro/3D. Halo accent detrás.
// ─────────────────────────────────────────────────────────────────────────────

function DashboardPreview() {
  // Datos demo realistas (no son reales — solo para el mockup).
  const orders = [
    { id: "1", name: "Doña Marta", amount: 28.5, item: "Pollo broaster", t: "hace 2 min", status: "confirmed" },
    { id: "2", name: "Carlos S.",  amount: 15.0, item: "Yape recibido",    t: "hace 5 min", status: "paid" },
    { id: "3", name: "Lucía P.",   amount: 42.3, item: "Carrito armado",   t: "hace 7 min", status: "pending" },
    { id: "4", name: "Don José",   amount: 18.9, item: "Combo familiar",   t: "hace 12 min", status: "confirmed" },
  ];

  const bars = [42, 58, 38, 72, 55, 90, 68, 81];

  return (
    <main className="relative hidden lg:flex items-center justify-center px-12 py-16 overflow-hidden">
      {/* Halos accent atrás */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.10] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-10 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
      />
      {/* Dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(var(--accent) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Mockup principal — rotación sutil para look 3D */}
      <div
        className="relative w-full max-w-[520px]"
        style={{ transform: "rotate(1.2deg)" }}
      >
        {/* Card sombra/ofset detrás */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[28px] bg-[var(--accent)]/15 translate-x-3 translate-y-3 blur-sm"
        />

        {/* Card principal con shadow profunda */}
        <div className="relative rounded-[28px] bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-2xl overflow-hidden">
          {/* Header del dashboard mock */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--rule-soft)]">
            <div className="flex items-center gap-2">
              <span className="flex gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]/60" />
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]/60" />
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]/60" />
              </span>
              <p className="ml-2 text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
                buleje.pe/admin
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-70 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              </span>
              En vivo
            </span>
          </div>

          {/* Stat hero — venta del día */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-3 mb-1">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Ventas hoy
              </p>
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-600,var(--accent))]">
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                +18%
              </span>
            </div>
            <p className="text-5xl font-black tracking-[-0.04em] tabular-nums leading-none text-[var(--text-primary)]">
              S/ <span className="text-[var(--accent)]">2,887</span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              23 pedidos · 4 fiados pendientes
            </p>
          </div>

          {/* Mini chart — barras animadas */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-2 h-20">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-lg transition-all"
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(180deg, var(--accent) 0%, color-mix(in oklab, var(--accent) 60%, transparent) 100%)`,
                    opacity: i === bars.length - 1 ? 1 : 0.55 + (i / bars.length) * 0.4,
                  }}
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 tabular-nums font-bold">
              <span>10am</span>
              <span>2pm</span>
              <span>6pm</span>
              <span>10pm</span>
            </div>
          </div>

          {/* Stats mini row */}
          <div className="px-6 pt-5 grid grid-cols-3 gap-3">
            {[
              { Icon: ShoppingBag, value: "23", label: "Pedidos" },
              { Icon: Wallet,      value: "97%", label: "Yape" },
              { Icon: Clock,       value: "12min", label: "Promedio" },
            ].map(({ Icon, value, label }) => (
              <div
                key={label}
                className="rounded-2xl bg-[var(--surface-sunken)]/60 border border-[var(--rule-soft)] px-3 py-3"
              >
                <Icon className="h-4 w-4 text-[var(--accent)] mb-2" strokeWidth={2} aria-hidden />
                <p className="text-lg font-extrabold tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
                  {value}
                </p>
                <p className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Feed pedidos en vivo */}
          <div className="px-6 py-5">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              Últimos pedidos
            </p>
            <ul className="space-y-2">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)]/40 px-3 py-2.5 border border-[var(--rule-soft)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg font-black text-[length:var(--ts-xs)] shrink-0",
                        o.status === "paid"
                          ? "bg-[var(--data-success-500,var(--accent))]/15 text-[var(--data-success-600,var(--accent))]"
                          : o.status === "confirmed"
                          ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-600,var(--data-warning-500))]",
                      )}
                    >
                      {o.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">
                        {o.name}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                        {o.item} · {o.t}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-black tabular-nums text-[var(--text-primary)] shrink-0">
                    S/ {o.amount.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Tag flotante "Tu próximo login" — sticker pro */}
        <div
          className="absolute -top-5 -left-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2.5 shadow-xl"
          style={{ transform: "rotate(-3deg)" }}
        >
          <span aria-hidden className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-80 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]">
            Tu panel · Hoy
          </span>
        </div>

        {/* Sticker float "+18%" — feedback positivo */}
        <div
          className="absolute -bottom-4 -right-4 inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white px-4 py-2.5 shadow-xl shadow-[var(--accent)]/40"
          style={{ transform: "rotate(4deg)" }}
        >
          <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          <span className="text-sm font-black tracking-tight tabular-nums">
            +18% vs. ayer
          </span>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwitchChip — link a otro panel con identidad visual diferenciada.
// ─────────────────────────────────────────────────────────────────────────────

function SwitchChip({
  href,
  icon,
  eyebrow,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:bg-primary/10 transition-all group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0 group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white transition-colors">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
            {eyebrow}
          </p>
          <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
            {title}
          </p>
        </div>
      </div>
      <ArrowRight
        className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0"
        strokeWidth={2.5}
      />
    </a>
  );
}
