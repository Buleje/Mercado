"use client";

/**
 * /admin/login — Login para dueños y staff de tienda.
 *
 * Identidad visual: "Para tu bodega · Buleje". Acento primary (teal del DS).
 * Hero lateral con bullets de beneficios operativos. Distinto del login de
 * superadmin (violeta/plataforma) y del de delivery (teal+orange/repartidor).
 */

import { PageTitle, SectionTitle } from "@buleje/design-system";
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
    const userParam = params.get("user");

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
          return;
        }
      } catch { /* silent */ }
      if (userParam) setUsername(userParam);
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
    setTimeout(() => setError(null), 3000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tenantSlug = typeof window !== "undefined"
        ? localStorage.getItem("active-tenant-slug")
        : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tenantSlug) {
        headers["x-tenant-id"] = tenantSlug;
        document.cookie = `active-tenant=${tenantSlug}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
      }

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
        showError("Credenciales incorrectas");
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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, var(--accent-soft) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, var(--accent-muted) 0%, transparent 55%), var(--surface-canvas)",
      }}
    >
      <main className={cn("w-full max-w-[440px]", shaking && "animate-[shake_0.45s_ease-out]")}>
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg mb-5"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--data-success-600) 100%)",
              boxShadow: "0 16px 32px -8px rgba(0,180,166,0.3)",
            }}
          >
            <Store className="h-7 w-7 text-white" strokeWidth={2.25} />
          </div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Panel del negocio
          </p>
          <SectionTitle className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] leading-tight tracking-tight">
            Bienvenido
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-xs">
            {activeTenant ? (
              <>Estás entrando a <strong className="text-[var(--text-primary)]">{activeTenant}</strong>.</>
            ) : (
              "Ingresa con las credenciales de tu tienda."
            )}
          </p>
        </div>

        <div
          className="rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-6 sm:p-8"
          style={{ boxShadow: "0 24px 60px -12px rgba(0,0,0,0.18), 0 8px 16px -8px rgba(0,0,0,0.06)" }}
        >

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
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
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
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
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 text-sm font-semibold text-[var(--data-error)]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !pw}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[var(--accent)]/20"
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

        </div>

        {/* Switches a otros paneles — fuera del card, footer del wrapper */}
        <div className="mt-6 space-y-2">
          <p className="text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
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

        {/* Trust footer */}
        <p className="mt-6 flex items-start gap-2 text-xs text-[var(--text-tertiary)] justify-center text-center max-w-xs mx-auto leading-relaxed">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--accent)]" />
          <span>Tus datos están aislados. Cumplimiento Ley 29733 PE.</span>
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwitchChip — link a otro panel de auth con identidad visual diferenciada.
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
