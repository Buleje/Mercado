"use client";

/**
 * /superadmin/login — Login para dueños de la plataforma Buleje.
 *
 * Identidad visual: violeta del proyecto (`--brand-purple`) sobre fondo zinc-950.
 * Distintivo del admin (teal) y del delivery (orange/teal). El violeta indica
 * "plataforma" / "admin de admins" — patrón estándar de SaaS (Stripe, Linear).
 * Soporta flujo 2FA TOTP.
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageTitle, SectionTitle } from "@buleje/design-system";
import {
  Loader2, Lock, ShieldCheck, KeyRound, ArrowLeft, Eye, EyeOff, User,
  AlertTriangle, Building2, ArrowRight, Crown, Server, Activity, Bike, Store,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const PLATFORM_FEATURES: Array<{ icon: typeof Server; label: string; desc: string }> = [
  { icon: Building2, label: "Gestión de tenants", desc: "Crear, suspender e impersonar tiendas." },
  { icon: Server, label: "Salud del sistema", desc: "Crons, monitoreo, deploys, capacidad." },
  { icon: Activity, label: "Audit log Ley 29733", desc: "Trazabilidad completa de accesos." },
];

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const usernameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const sessionExpired = searchParams.get("reason") === "expired";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | false>(false);
  const [shaking, setShaking] = useState(false);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (document.cookie.includes("buleje-platform-sess")) {
      router.replace("/superadmin/dashboard");
    }
    usernameRef.current?.focus();
  }, [router]);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/superadmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.requires2FA && data.challengeId) {
        setChallengeId(data.challengeId);
        setTimeout(() => codeRef.current?.focus(), 100);
      } else if (res.ok) {
        router.push("/superadmin");
      } else {
        setError(data.error || "Credenciales inválidas");
        setTimeout(() => setError(false), 2500);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/superadmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      if (res.ok) {
        router.push("/superadmin");
      } else {
        setError("Código inválido o expirado");
        setTimeout(() => setError(false), 2500);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const resetTo2FA = () => {
    setChallengeId(null);
    setCode("");
    setError(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 grid lg:grid-cols-[1.05fr_1fr]">
      {/* ─── Hero — paleta violeta del proyecto ─────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-zinc-900 text-white">
        {/* Glow violeta */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(at 25% 0%, rgba(139,92,246,0.30) 0px, transparent 55%), radial-gradient(at 75% 100%, rgba(139,92,246,0.18) 0px, transparent 50%)",
          }}
        />
        {/* Mesh blob */}
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--brand-purple) 0%, transparent 70%)" }}
        />
        {/* Pattern */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Top */}
        <header className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
              style={{ background: "var(--brand-purple)", boxShadow: "0 12px 32px -8px rgba(139,92,246,0.5)" }}
            >
              <Crown className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]" style={{ color: "var(--brand-purple)" }}>
                Buleje · Plataforma
              </p>
              <p className="text-base font-extrabold leading-tight">Superadmin</p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[length:var(--ts-2xs)] font-bold"
            style={{
              background: "rgba(139,92,246,0.12)",
              borderColor: "rgba(139,92,246,0.35)",
              color: "rgb(196,181,253)",
            }}
          >
            <Lock className="h-3 w-3" strokeWidth={2.5} />
            Acceso restringido
          </span>
        </header>

        {/* Middle */}
        <div className="relative z-10 max-w-md">
          <PageTitle className="font-display tracking-[var(--ls-tight)] leading-[1.05] text-white">
            Plataforma Buleje. Sólo para dueños.
          </PageTitle>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Acceso a operaciones de plataforma. Si tenés una bodega, este NO es
            tu panel — usá el Panel del Negocio.
          </p>

          <ul className="mt-8 space-y-4">
            {PLATFORM_FEATURES.map((f) => (
              <li key={f.label} className="flex items-start gap-3">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border shrink-0"
                  style={{ background: "rgba(139,92,246,0.10)", borderColor: "rgba(139,92,246,0.25)" }}
                >
                  <f.icon className="h-4 w-4" strokeWidth={2} style={{ color: "var(--brand-purple)" }} />
                </span>
                <div>
                  <p className="text-sm font-bold">{f.label}</p>
                  <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <footer className="relative z-10 flex items-start gap-3 text-xs text-white/55 max-w-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--brand-purple)" }} />
          <span className="leading-relaxed">
            Cada acceso queda registrado en el audit log. Ley 29733 PE ·
            Sesión 12h · 2FA recomendado.
          </span>
        </footer>
      </aside>

      {/* ─── Form — fondo zinc-950 ──────────────────────────────────────── */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className={cn("w-full max-w-sm text-white", shaking && "animate-[shake_0.45s_ease-out]")}>
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--brand-purple)" }}
            >
              <Crown className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <p className="font-extrabold text-white text-lg tracking-tight">Plataforma Buleje</p>
          </div>

          {/* Eyebrow + título */}
          <p
            className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] mb-2"
            style={{ color: "var(--brand-purple)" }}
          >
            {challengeId ? "Verificación 2 pasos" : "Plataforma · Superadmin"}
          </p>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold text-white leading-tight">
            {challengeId ? "Confirmá tu identidad" : "Acceso a la plataforma"}
          </SectionTitle>
          <p className="text-sm text-white/60 mt-2">
            {challengeId
              ? "Ingresá el código de 6 dígitos de tu app autenticadora."
              : "Sólo dueños de Buleje. ¿Tenés una bodega? Usá el Panel del Negocio abajo."}
          </p>

          {/* Aviso sesión expirada */}
          {sessionExpired && !challengeId && (
            <div
              className="mt-5 flex items-start gap-2 p-3 rounded-xl text-sm font-semibold"
              style={{
                background: "rgba(139,92,246,0.10)",
                border: "1px solid rgba(139,92,246,0.30)",
                color: "rgb(196,181,253)",
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Tu sesión expiró por seguridad. Volvé a ingresar.
            </div>
          )}

          {/* Form login */}
          {!challengeId && (
            <form onSubmit={handleLogin} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="su-username" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/60">
                  Usuario
                </label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-white transition-colors" strokeWidth={2} />
                  <input
                    ref={usernameRef}
                    id="su-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-white/10 bg-zinc-900 text-sm font-semibold text-white placeholder:text-white/30 outline-none focus:border-[var(--brand-purple)] focus:ring-4 focus:ring-[var(--brand-purple)]/20 transition-all"
                    placeholder="superadmin"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="su-password" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/60">
                  Contraseña
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-white transition-colors" strokeWidth={2} />
                  <input
                    id="su-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-10 pr-11 rounded-xl border-2 border-white/10 bg-zinc-900 text-sm font-semibold text-white placeholder:text-white/30 outline-none focus:border-[var(--brand-purple)] focus:ring-4 focus:ring-[var(--brand-purple)]/20 transition-all"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                    aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] shadow-lg"
                style={{
                  background: "var(--brand-purple)",
                  boxShadow: "0 12px 32px -8px rgba(139,92,246,0.45)",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                    Acceder a la plataforma
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form 2FA */}
          {challengeId && (
            <form onSubmit={handleVerify2FA} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="su-code" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/60">
                  Código TOTP
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                    strokeWidth={2}
                    style={{ color: "var(--brand-purple)" }}
                  />
                  <input
                    ref={codeRef}
                    id="su-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full h-14 pl-10 pr-4 rounded-xl border-2 bg-zinc-900 text-center text-2xl font-mono font-bold text-white tracking-[0.5em] placeholder:text-white/20 outline-none transition-all"
                    style={{
                      borderColor: "rgba(139,92,246,0.30)",
                    }}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <p className="text-xs text-white/50">Abrí Google Authenticator o tu app TOTP.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                style={{ background: "var(--brand-purple)" }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verificar y acceder
              </button>

              <button
                type="button"
                onClick={resetTo2FA}
                className="w-full inline-flex items-center justify-center gap-1.5 h-10 text-xs font-bold text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al paso anterior
              </button>
            </form>
          )}

          {/* Switches a otros paneles */}
          <div className="mt-8 pt-6 border-t border-white/10 space-y-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40 mb-3">
              ¿Buscás otro panel?
            </p>
            <SwitchChipDark
              href="/admin/login"
              icon={<Store className="h-4 w-4" strokeWidth={2} />}
              eyebrow="Negocio"
              title="Panel de tu bodega"
              accent="teal"
            />
            <SwitchChipDark
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
// SwitchChipDark — variante para tema oscuro (superadmin/delivery dark form).
// ─────────────────────────────────────────────────────────────────────────────

function SwitchChipDark({
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
  accent: "teal" | "orange" | "violet";
}) {
  const accentBg =
    accent === "teal"   ? { bg: "rgba(0,180,166,0.10)",   border: "rgba(0,180,166,0.30)",   color: "rgb(94,234,212)" } :
    accent === "orange" ? { bg: "rgba(249,115,22,0.10)",  border: "rgba(249,115,22,0.30)",  color: "rgb(253,186,116)" } :
                          { bg: "rgba(139,92,246,0.10)",  border: "rgba(139,92,246,0.30)",  color: "rgb(196,181,253)" };

  return (
    <a
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 transition-all group"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
          style={{ background: accentBg.bg, borderColor: accentBg.border, color: accentBg.color }}
        >
          {icon}
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40">
            {eyebrow}
          </p>
          <p className="text-sm font-extrabold text-white">{title}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
    </a>
  );
}
