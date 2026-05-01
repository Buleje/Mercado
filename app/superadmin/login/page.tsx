"use client";

/**
 * /superadmin/login — Login para dueños de la plataforma Buleje.
 *
 * Identidad visual distinta del admin: paleta sobria (zinc-950 + amber para
 * "warning de privilegio"), eyebrow "Plataforma Buleje · Acceso restringido",
 * mensajes que dejan claro que esto NO es para dueños de tienda. Soporta el
 * flujo 2FA (TOTP) si el superadmin lo tiene activo.
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageTitle, SectionTitle } from "@buleje/design-system";
import {
  Loader2, Lock, ShieldCheck, KeyRound, ArrowLeft, Eye, EyeOff, User,
  AlertTriangle, Building2, ArrowRight, Crown, Server, Activity,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const PLATFORM_FEATURES: Array<{ icon: typeof Server; label: string; desc: string }> = [
  { icon: Building2, label: "Gestión de tenants", desc: "Crear, suspender e impersonar tiendas." },
  { icon: Server, label: "Salud del sistema", desc: "Monitoreo, crons, salud de la plataforma." },
  { icon: Activity, label: "Audit log Ley 29733", desc: "Trazabilidad completa de accesos a datos." },
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

  // 2FA state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Si ya tiene cookie de sesión, redirigir al dashboard
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
      {/* ─── Hero — solo desktop, paleta oscura plataforma ──────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-zinc-900 text-white">
        {/* Gradient overlay con tinte ámbar (warning privilegio) */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            background:
              "radial-gradient(at 20% 0%, rgba(245,158,11,0.18) 0px, transparent 50%), radial-gradient(at 80% 100%, rgba(0,180,166,0.12) 0px, transparent 50%)",
          }}
        />
        {/* Pattern */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <header className="relative z-10 flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30">
            <Crown className="h-5 w-5 text-amber-400" strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-amber-400">
              Plataforma · Acceso restringido
            </p>
            <p className="text-base font-extrabold leading-tight">Superadmin Buleje</p>
          </div>
        </header>

        <div className="relative z-10 max-w-sm">
          <PageTitle className="font-display tracking-[var(--ls-tight)] leading-[1.05] text-white">
            Plataforma Buleje. Sólo para administradores.
          </PageTitle>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Acceso de plataforma. Si sos dueño de una bodega, este NO es tu panel —
            usá el Panel del Negocio.
          </p>

          <ul className="mt-8 space-y-4">
            {PLATFORM_FEATURES.map((f) => (
              <li key={f.label} className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 shrink-0">
                  <f.icon className="h-4 w-4 text-amber-400" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-bold">{f.label}</p>
                  <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="relative z-10 flex items-start gap-3 text-xs text-white/50 max-w-sm">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Cada acceso queda registrado en el audit log (Ley 29733 · Protección de Datos).
            Sesión 12h · 2FA recomendado.
          </span>
        </footer>
      </aside>

      {/* ─── Form ───────────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center p-6 sm:p-12 bg-zinc-950">
        <div className={cn("w-full max-w-sm text-white", shaking && "animate-[shake_0.45s_ease-out]")}>
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30">
              <Crown className="h-5 w-5 text-amber-400" strokeWidth={2.25} />
            </div>
            <p className="font-extrabold text-white text-lg tracking-tight">Plataforma Buleje</p>
          </div>

          {/* Eyebrow + título */}
          <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-amber-400 mb-2">
            {challengeId ? "Verificación de 2 pasos" : "Plataforma · Superadmin"}
          </p>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold text-white leading-tight">
            {challengeId ? "Confirmá tu identidad" : "Acceso restringido"}
          </SectionTitle>
          <p className="text-sm text-white/60 mt-2">
            {challengeId
              ? "Ingresá el código de 6 dígitos de tu app autenticadora."
              : "Sólo dueños de la plataforma. ¿Tenés una bodega? Usá el panel del negocio."}
          </p>

          {/* Aviso sesión expirada */}
          {sessionExpired && !challengeId && (
            <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Tu sesión expiró por seguridad. Volvé a ingresar.
            </div>
          )}

          {/* Form login (paso 1) */}
          {!challengeId && (
            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="su-username" className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" strokeWidth={2} />
                  <input
                    ref={usernameRef}
                    id="su-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-white/10 bg-zinc-900 text-sm font-semibold text-white placeholder:text-white/30 outline-none focus:border-amber-400 transition-colors"
                    placeholder="superadmin"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="su-password" className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" strokeWidth={2} />
                  <input
                    id="su-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-10 pr-11 rounded-xl border-2 border-white/10 bg-zinc-900 text-sm font-semibold text-white placeholder:text-white/30 outline-none focus:border-amber-400 transition-colors"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-amber-500 text-zinc-950 text-sm font-extrabold uppercase tracking-wider hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Form 2FA (paso 2) */}
          {challengeId && (
            <form onSubmit={handleVerify2FA} className="mt-8 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="su-code" className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Código TOTP
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400" strokeWidth={2} />
                  <input
                    ref={codeRef}
                    id="su-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full h-14 pl-10 pr-4 rounded-xl border-2 border-amber-500/30 bg-zinc-900 text-center text-2xl font-mono font-bold text-white tracking-[0.5em] placeholder:text-white/20 outline-none focus:border-amber-400 transition-colors"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <p className="text-xs text-white/50">Abrí Google Authenticator o tu app TOTP.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-amber-500 text-zinc-950 text-sm font-extrabold uppercase tracking-wider hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Switch al panel del negocio */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <a
              href="/admin/login"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-white/60" strokeWidth={2} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                    ¿Tenés una bodega?
                  </p>
                  <p className="text-sm font-bold text-white">Acceder al Panel del Negocio</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-amber-400 transition-colors" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
