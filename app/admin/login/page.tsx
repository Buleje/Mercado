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
  Store, Zap, ArrowRight, ShoppingCart, Package, Wallet, ShieldCheck,
  Bike, Crown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const FEATURES: Array<{ icon: typeof Store; label: string; desc: string }> = [
  { icon: ShoppingCart, label: "Ventas y caja", desc: "POS, turnos y cierre del día." },
  { icon: Package, label: "Inventario en tiempo real", desc: "Stock, kardex, vencimientos y mermas." },
  { icon: Wallet, label: "Mi plata", desc: "Ingresos, egresos, ganancias y reportes." },
];

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
        if (rememberMe) localStorage.setItem("login-remember-username", username);
        else localStorage.removeItem("login-remember-username");

        const data = (await res.json()) as {
          ok: boolean;
          role?: string;
          onboardingPending?: boolean;
          tenantId?: string;
          tenantSlug?: string;
        };
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

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] grid lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.2fr_1fr]">
      {/* ─── HERO IZQUIERDO ───────────────────────────────────────────── */}
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--text-primary) 0%, #0f1d24 50%, var(--text-primary) 100%)",
        }}
      >
        {/* Mesh blobs */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(at 20% 0%, rgba(0,180,166,0.40) 0px, transparent 50%), radial-gradient(at 80% 100%, rgba(45,212,191,0.20) 0px, transparent 50%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
        />
        {/* Grid pattern */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* TOP — brand */}
        <header className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
                boxShadow: "0 12px 32px -8px rgba(0,180,166,0.5)",
              }}
            >
              <Store className="h-6 w-6 text-white" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                Buleje · Negocio
              </p>
              <p className="text-base font-extrabold leading-tight">Panel del dueño</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/15 text-[length:var(--ts-2xs)] font-bold text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success)] animate-pulse" />
            En línea
          </span>
        </header>

        {/* MIDDLE — copy + features */}
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl xl:text-5xl font-black tracking-[-0.03em] text-balance leading-[1.05]">
            Tu bodega,{" "}
            <span className="italic font-serif text-[var(--accent)]">
              en un solo lugar.
            </span>
          </h1>
          <p className="mt-5 text-[15px] text-white/70 leading-relaxed max-w-sm">
            Inventario, ventas, fiados, delivery y reportes — todo lo que
            necesitas para vender más sin perder el control.
          </p>

          <ul className="mt-9 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-start gap-3.5">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border shrink-0"
                  style={{
                    background: "rgba(0,180,166,0.10)",
                    borderColor: "rgba(0,180,166,0.25)",
                  }}
                >
                  <f.icon className="h-4.5 w-4.5 text-[var(--accent)]" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[15px] font-bold text-white">{f.label}</p>
                  <p className="text-[13px] text-white/55 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* BOTTOM — trust */}
        <footer className="relative z-10 flex items-start gap-3 text-xs text-white/45 max-w-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" strokeWidth={2} />
          <span className="leading-relaxed">
            Tus datos están aislados — solo tú accedes a tu tienda.
            Cumplimiento Ley 29733 PE · Cookies HttpOnly · CSRF activo.
          </span>
        </footer>
      </aside>

      {/* ─── FORM DERECHO ────────────────────────────────────────────── */}
      <main className="flex items-center justify-center px-6 py-8 sm:px-12 sm:py-12">
        <div className={cn("w-full max-w-[420px]", shaking && "animate-[shake_0.45s_ease-out]")}>
          {/* Logo mobile (hero hidden) */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-md"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
              }}
            >
              <Store className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <p className="font-extrabold text-[var(--text-primary)] text-lg tracking-tight">Buleje</p>
          </div>

          {/* Eyebrow + título */}
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Iniciar sesión
          </p>
          <SectionTitle className="text-3xl sm:text-[2.25rem] font-extrabold text-[var(--text-primary)] leading-[1.1] tracking-tight">
            Bienvenido de vuelta
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-2.5 max-w-sm">
            {activeTenant ? (
              <>Estás entrando a <strong className="text-[var(--text-primary)]">{activeTenant}</strong>. <button type="button" onClick={() => { setActiveTenant(null); localStorage.removeItem("active-tenant-slug"); }} className="text-[var(--accent)] hover:underline font-semibold">cambiar</button></>
            ) : (
              "Ingresa tu usuario y contraseña — te llevamos directo a tu panel."
            )}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Usuario
              </label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" strokeWidth={2} />
                <input
                  ref={usernameRef}
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15 transition-all"
                  placeholder="qaadmin"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Contraseña
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" strokeWidth={2} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full h-12 pl-10 pr-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
                />
                <span className="text-[var(--text-secondary)] font-medium">Recordarme</span>
              </label>
              <a
                href="https://wa.me/51916409675?text=Olvid%C3%A9%20mi%20contrase%C3%B1a%20de%20Buleje"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 text-sm font-semibold text-[var(--data-error)]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !pw}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
                boxShadow: "0 12px 24px -8px rgba(0,180,166,0.4)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" strokeWidth={2.25} />
                  Entrar al panel
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBypass}
              disabled={bypassLoading}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {bypassLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Entrar sin login (modo demo)
            </button>
          </form>

          {/* Switches a otros paneles */}
          <div className="mt-8 pt-6 border-t border-[var(--rule-soft)] space-y-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              ¿Buscas otro panel?
            </p>
            <SwitchChip
              href="/superadmin/login"
              icon={<Crown className="h-4 w-4" strokeWidth={2} />}
              eyebrow="Plataforma"
              title="Acceso Superadmin"
              accent="violet"
            />
            <SwitchChip
              href="/delivery-app/login"
              icon={<Bike className="h-4 w-4" strokeWidth={2} />}
              eyebrow="Repartidor"
              title="Acceso Delivery"
              accent="orange"
            />
          </div>
        </div>
      </main>
    </div>
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
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  accent: "violet" | "orange" | "teal";
}) {
  const accentBg =
    accent === "violet" ? "bg-[var(--brand-purple)]/10 border-[var(--brand-purple)]/30 text-[var(--brand-purple)]" :
    accent === "orange" ? "bg-[var(--brand-secondary)]/10 border-[var(--brand-secondary)]/30 text-[var(--brand-secondary)]" :
    "bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]";

  return (
    <a
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)]/60 border border-transparent hover:border-[var(--rule-base)] transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg border", accentBg)}>
          {icon}
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">{title}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 transition-all" />
    </a>
  );
}
