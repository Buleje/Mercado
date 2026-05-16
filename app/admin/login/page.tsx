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
import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, LogIn, User, Lock, Eye, EyeOff, AlertTriangle,
  Store, ArrowRight, ShieldCheck,
  Bike, Crown, ChevronDown,
  TrendingUp, ShoppingBag, Wallet, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// Brandon mayo 14 2026 v3: layout editorial con dashboard preview.
//   - Lado izquierdo: form de login dentro de una card flotante, brand
//     compacto, trust badges sutiles. Centrado vertical.
//   - Lado derecho (lg+): MOCKUP DEL DASHBOARD real con stat hero animada,
//     mini-chart de barras, feed de pedidos en vivo, badges de estado.
//     Rotado sutil para look 3D/pro. Halo accent + dot grid de fondo.
//   - Paleta: --accent + neutros + variantes de opacidad. Sin random colors.
//   - Tipografía: italic serif para el headline, sans-serif tight para datos.

export default function AdminLoginPage() {
  const router = useRouter();
  const fromRef = useRef<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  const tenantPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(/^(\/t\/[^/]+)\/admin/);
    return match ? match[1] : "";
  }, []);
  const adminPath = (path: string) => `${tenantPrefix}${path}`;

  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fromRef.current = params.get("from");

    const tenantParam = params.get("tenant");
    const autoParam = params.get("auto");

    if (tenantParam) {
      localStorage.setItem("active-tenant-slug", tenantParam);
      sessionStorage.setItem("active-tenant-slug", tenantParam);
      setActiveTenant(tenantParam);
      if (!fromRef.current) fromRef.current = `/t/${tenantParam}/admin`;
    } else {
      const slug = localStorage.getItem("active-tenant-slug");
      if (slug && slug !== "main") setActiveTenant(slug);
    }

    const saved = localStorage.getItem("login-remember-username");
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }

    if (tenantParam && autoParam === "1") {
      try {
        const credKey = `sa-cred-${tenantParam}`;
        const credJson = localStorage.getItem(credKey);
        if (credJson) {
          const cred = JSON.parse(credJson) as { username: string; password: string };
          if (cred.username) setUsername(cred.username);
          if (cred.password) setPw(cred.password);
        }
      } catch { /* ignore */ }
    }

    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // El backend resuelve el tenant por username globalmente. Igual mandamos
      // el slug de la URL/cookie como hint para el caso fallback Settings.
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
        body: JSON.stringify({ username: username || undefined, password: pw }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          requires2FA?: boolean;
          role?: string;
          onboardingPending?: boolean;
          tenantId?: string;
          tenantSlug?: string;
        };

        // ── 2FA requerido: redirigir sin mostrar error ──────────────────
        if (data.requires2FA) {
          if (rememberMe) localStorage.setItem("login-remember-username", username);
          else localStorage.removeItem("login-remember-username");
          // Preservar `from` para post-2FA redirect
          const dest = fromRef.current
            ? `/admin/login/2fa?from=${encodeURIComponent(fromRef.current)}`
            : "/admin/login/2fa";
          router.push(dest);
          return;
        }

        if (rememberMe) localStorage.setItem("login-remember-username", username);
        else localStorage.removeItem("login-remember-username");

        if (data.tenantSlug) {
          localStorage.setItem("active-tenant-slug", data.tenantSlug);
          sessionStorage.setItem("active-tenant-slug", data.tenantSlug);
        }
        if (data.onboardingPending && !fromRef.current) {
          router.push("/onboarding");
        } else if (data.role === "owner" || data.role === "platform_admin") {
          router.push("/superadmin/login");
        } else {
          router.push(fromRef.current ? decodeURIComponent(fromRef.current) : adminPath("/admin"));
        }
      } else {
        showError("Usuario o contraseña incorrectos");
      }
    } catch {
      showError("No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleBypass = async () => {
    setBypassLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bypass", { method: "POST" });
      if (res.ok) {
        router.push(fromRef.current ? decodeURIComponent(fromRef.current) : adminPath("/admin"));
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
          {activeTenant ? (
            <p className="text-sm text-[var(--text-secondary)] mt-4">
              Entrando a{" "}
              <strong className="text-[var(--text-primary)]">
                {activeTenant}
              </strong>
              .{" "}
              <button
                type="button"
                onClick={() => {
                  setActiveTenant(null);
                  localStorage.removeItem("active-tenant-slug");
                }}
                className="text-[var(--accent)] hover:underline font-semibold"
              >
                cambiar
              </button>
            </p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-sm">
              Usuario y contraseña te llevan a tu panel.
            </p>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-10 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Usuario
              </label>
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
                  data-bwignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
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
                  className="w-full h-14 pl-12 pr-14 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/12 hover:border-[var(--accent)]/40 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  data-bwignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
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
              disabled={loading || !pw}
              className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white text-base font-extrabold tracking-tight shadow-lg shadow-[var(--accent)]/30 hover:scale-[1.01] hover:shadow-xl hover:shadow-[var(--accent)]/40 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verificando…
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
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
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
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
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 transition-all group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0 group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white transition-colors">
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
