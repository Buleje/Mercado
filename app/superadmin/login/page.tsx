"use client";

/**
 * /superadmin/login — Login para dueños de la plataforma Buleje.
 *
 * Brandon mayo 14 2026 v3: aplicado el mismo concepto editorial del
 * /admin/login v3. Layout asimétrico [1fr_1.15fr]:
 *   - Izquierda: form centrado con brand badge violeta, headline italic
 *     serif, switches a otros paneles colapsado.
 *   - Derecha (lg+): MOCKUP del Superadmin Console — stat hero MRR/Tenants,
 *     feed de actividad de plataforma (signups, payments, alerts),
 *     mini-chart de tenants activos, stickers flotantes rotados.
 * Paleta: --brand-purple (violeta plataforma) + neutros. Mantiene flujo 2FA.
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useSearchParams } from "next/navigation";
import { SectionTitle } from "@buleje/design-system";
import {
  Loader2, Lock, ShieldCheck, KeyRound, ArrowLeft, Eye, EyeOff, User,
  AlertTriangle, ArrowRight, Crown, Bike, Store, ChevronDown,
  TrendingUp, Building2, Activity, Server, DollarSign, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useLoginSecurity } from "@/hooks/useLoginSecurity";
import { getKeepAlive } from "@/lib/session-keepalive";

export default function SuperAdminLoginPage() {
  const searchParams = useSearchParams();
  const usernameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const sessionExpired = searchParams.get("reason") === "expired";

  // Resumen silencioso (Brandon 2026-08-30): reusa el mismo flag "confiar en
  // este equipo" del login admin (localStorage compartido) — si ya estaba
  // marcado y el platform-token (12h, se renueva solo pasada la mitad de su
  // vida) sigue vivo, entra directo sin mostrar el form. A diferencia del
  // admin (refresh de 7 días), acá el techo real es 12h: un corte MÁS largo
  // que eso (ej. toda una noche) sigue pidiendo 2FA de nuevo — deliberado,
  // es la cuenta de mayor privilegio de toda la plataforma.
  const [resuming, setResuming] = useState(!sessionExpired);
  useEffect(() => {
    if (sessionExpired) return; // ya se sabe inválida, no perder tiempo probando
    let cancelado = false;
    (async () => {
      if (!getKeepAlive()) { setResuming(false); return; }
      try {
        const res = await fetch("/api/superadmin/auth", { method: "GET", credentials: "include" });
        if (!cancelado && res.ok) {
          window.location.assign("/superadmin/dashboard");
          return;
        }
      } catch {
        /* sin red — mostrar el form */
      }
      if (!cancelado) setResuming(false);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState(""); // bot trap
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | false>(false);
  const [shaking, setShaking] = useState(false);
  const {
    capsLock, retryAfter, onPasswordKey, startRetryFromResponse,
    messageForStatus, networkErrorMessage, mmss,
  } = useLoginSecurity();

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    // Brandon 2026-05-21 FIX bug "login congelado al sesión expirada":
    // 1. El check `document.cookie.includes(...)` SIEMPRE era false porque
    //    la cookie `buleje-platform-sess` es httpOnly — no aparece en
    //    document.cookie. Removido (dead code).
    // 2. Si llegamos con ?reason=expired, hacemos DELETE al endpoint auth
    //    para limpiar la cookie stale server-side. Sin esto, la cookie
    //    httpOnly queda en el browser hasta su maxAge y puede causar
    //    redirects raros si el user intenta navegar mientras logueado.
    if (sessionExpired) {
      fetch("/api/superadmin/auth", {
        method: "DELETE",
        credentials: "include",
      }).catch((err) => {
        // No-op intencional: la limpieza de cookie stale es best-effort.
        // Si falla (offline, server caído, rate-limited), el form de login
        // sigue mostrándose y el user puede intentar igual; el server
        // descartará la cookie inválida al primer POST exitoso.
        console.warn("[superadmin/login] cleanup stale cookie failed", String(err));
      });
    }
    usernameRef.current?.focus();
  }, [sessionExpired]);

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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username, password, honeypot }),
      });
      const data = await res.json();
      if (data.requires2FA && data.challengeId) {
        setChallengeId(data.challengeId);
        setTimeout(() => codeRef.current?.focus(), 100);
      } else if (res.ok) {
        window.location.assign("/superadmin/dashboard");
      } else if (res.status === 429) {
        // Rate limit / lockout: recargar no ayuda → countdown.
        startRetryFromResponse(res);
        setError(false);
      } else {
        setError(messageForStatus(res.status, { attemptsLeft: data?.attemptsLeft }) ?? data.error ?? "Credenciales inválidas");
        setTimeout(() => setError(false), 3500);
      }
    } catch {
      setError(networkErrorMessage());
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ challengeId, code }),
      });
      if (res.ok) {
        window.location.assign("/superadmin/dashboard");
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

  if (resuming) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)]">
        <div className="flex flex-col items-center gap-3 text-[var(--text-tertiary)]">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--brand-purple)" }} />
          <p className="text-sm font-medium">Entrando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--surface-canvas)] grid lg:grid-cols-[1fr_1.15fr]">
      {/* CSS scoped que oculta widgets flotantes globales + focus violet del input */}
      <style jsx global>{`
        body[data-route="superadmin-login"] [data-floating-widget],
        body[data-route="superadmin-login"] .floating-widget,
        body[data-route="superadmin-login"] [aria-label*="Productos recientes"],
        body[data-route="superadmin-login"] [aria-label*="Carrito"],
        body[data-route="superadmin-login"] [aria-label*="WhatsApp"] {
          display: none !important;
        }
        .su-input:focus {
          border-color: var(--brand-purple);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand-purple) 15%, transparent);
        }
        .su-input:hover {
          border-color: color-mix(in oklab, var(--brand-purple) 40%, transparent);
        }
      `}</style>
      <BodyRouteMark />

      {/* Halos violeta atrás de todo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-purple) 6%, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-purple) 4%, transparent)" }}
      />

      {/* ─── COLUMNA IZQUIERDA — Form editorial centrado ─────────────── */}
      <aside className="relative flex flex-col justify-center px-5 py-10 sm:px-10 sm:py-16 lg:px-16">
        <div
          className={cn(
            "relative z-10 w-full max-w-[460px] mx-auto",
            shaking && "animate-[shake_0.45s_ease-out]",
          )}
        >
          {/* Brand badge superior — violeta plataforma */}
          <div className="flex items-center gap-2.5 mb-10">
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl shadow-md"
              style={{
                background: "var(--brand-purple)",
                boxShadow: "0 8px 20px -6px color-mix(in oklab, var(--brand-purple) 50%, transparent)",
              }}
            >
              <Crown className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p
                className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] leading-tight"
                style={{ color: "var(--brand-purple)" }}
              >
                Buleje · Plataforma
              </p>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Acceso Superadmin
              </p>
            </div>
          </div>

          {/* Eyebrow + título grande */}
          <p
            className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-3"
            style={{ color: "var(--brand-purple)" }}
          >
            {challengeId ? "Verificación 2 pasos" : "Iniciar sesión"}
          </p>
          <SectionTitle className="text-[2.25rem] sm:text-[2.75rem] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
            {challengeId ? (
              <>
                Confirmá
                <br />
                <span className="italic font-serif" style={{ color: "var(--brand-purple)" }}>
                  tu identidad.
                </span>
              </>
            ) : (
              <>
                Acceso
                <br />
                <span className="italic font-serif" style={{ color: "var(--brand-purple)" }}>
                  plataforma.
                </span>
              </>
            )}
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-sm">
            {challengeId
              ? "Ingresa el código de 6 dígitos de tu app autenticadora."
              : "Solo para dueños de Buleje. ¿Tienes una bodega? Usa el panel del negocio."}
          </p>

          {/* Aviso sesión expirada */}
          {sessionExpired && !challengeId && (
            <div
              className="mt-6 flex items-start gap-2.5 p-4 rounded-2xl text-sm font-bold"
              style={{
                background: "color-mix(in oklab, var(--brand-purple) 10%, transparent)",
                border: "2px solid color-mix(in oklab, var(--brand-purple) 25%, transparent)",
                color: "var(--brand-purple)",
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Tu sesión expiró por seguridad. Volvé a ingresar.
            </div>
          )}

          {/* Form login */}
          {!challengeId && (
            <form onSubmit={handleLogin} className="mt-10 space-y-4">
              {/* Honeypot */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  top: "-9999px",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
              >
                <label htmlFor="su-website">Website (no completar)</label>
                <input
                  id="su-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="su-username"
                  className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                >
                  Usuario
                </label>
                <div className="relative group">
                  <User
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] transition-colors"
                    strokeWidth={2}
                  />
                  <input
                    ref={usernameRef}
                    id="su-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-14 pl-12 pr-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all su-input"
                    placeholder="superadmin"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="su-password"
                  className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                >
                  Contraseña
                </label>
                <div className="relative group">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] transition-colors"
                    strokeWidth={2}
                  />
                  <input
                    id="su-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onPasswordKey}
                    onKeyUp={onPasswordKey}
                    className="w-full h-14 pl-12 pr-14 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all su-input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {capsLock && (
                  <p role="status" className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Bloq Mayús está activado
                  </p>
                )}
              </div>

              {retryAfter > 0 && (
                <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--data-warning-500)]/10 border-2 border-[var(--data-warning-500)]/25 text-sm font-bold text-[var(--data-warning-700)]">
                  <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                  <span>Demasiados intentos. Esperá <span className="tabular-nums">{mmss(retryAfter)}</span> — recargar no ayuda.</span>
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
                disabled={loading || !username || !password || retryAfter > 0}
                className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl text-white text-base font-extrabold tracking-tight active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--brand-purple)",
                  boxShadow: "0 12px 24px -8px color-mix(in oklab, var(--brand-purple) 50%, transparent)",
                }}
              >
                {loading ? (
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
                    <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
                    Acceder a la plataforma
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form 2FA */}
          {challengeId && (
            <form onSubmit={handleVerify2FA} className="mt-10 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="su-code"
                  className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                >
                  Código TOTP
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
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
                    className="w-full h-16 pl-12 pr-4 rounded-2xl border-2 bg-[var(--surface-canvas)] text-center text-2xl font-mono font-bold text-[var(--text-primary)] tracking-[0.5em] placeholder:text-[var(--text-tertiary)] outline-none transition-all"
                    style={{
                      borderColor: "color-mix(in oklab, var(--brand-purple) 30%, transparent)",
                    }}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  Abrí Google Authenticator o tu app TOTP.
                </p>
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
                disabled={loading || code.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl text-white text-base font-extrabold tracking-tight active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--brand-purple)",
                  boxShadow: "0 12px 24px -8px color-mix(in oklab, var(--brand-purple) 50%, transparent)",
                }}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                Verificar y acceder
              </button>

              <button
                type="button"
                onClick={resetTo2FA}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al paso anterior
              </button>
            </form>
          )}

          {/* Switches a otros paneles — disclosure colapsado */}
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
                href="/admin/login"
                icon={<Store className="h-4 w-4" strokeWidth={2} />}
                eyebrow="Negocio"
                title="Panel de tu bodega"
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
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--brand-purple)" }}
            />
            Cada acceso queda en el audit log · Ley 29733 PE · Sesión 12h · 2FA
          </p>
        </div>
      </aside>

      {/* ─── COLUMNA DERECHA — Console preview de plataforma ──────────── */}
      <PlatformConsolePreview />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BodyRouteMark — agrega data-route="superadmin-login" para CSS scoped.
// ─────────────────────────────────────────────────────────────────────────────
function BodyRouteMark() {
  useEffect(() => {
    document.body.setAttribute("data-route", "superadmin-login");
    return () => {
      document.body.removeAttribute("data-route");
    };
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PlatformConsolePreview — Mockup del Superadmin Console:
//   - Stat hero: MRR + Tenants activos
//   - Mini-chart: signups últimos 7 días
//   - Feed de eventos: nuevos tenants, payments, alerts
//   - Stickers flotantes rotados
// Identidad visual violeta `--brand-purple` (plataforma).
// ─────────────────────────────────────────────────────────────────────────────
function PlatformConsolePreview() {
  const events = [
    { id: "1", icon: Building2, who: "pizza-pucallpa", what: "Tenant nuevo · Plan Pro",          t: "hace 3 min",  variant: "new" as const },
    { id: "2", icon: DollarSign, who: "doña-marta",     what: "Pago S/ 179 · Plan Pro mensual",   t: "hace 8 min",  variant: "paid" as const },
    { id: "3", icon: Activity,   who: "system",         what: "Cron diario · 47 webhooks OK",    t: "hace 14 min", variant: "ok" as const },
    { id: "4", icon: Server,     who: "p99 latency",    what: "320ms · dentro de SLO",            t: "hace 18 min", variant: "ok" as const },
  ];

  const bars = [38, 52, 41, 65, 48, 78, 92];

  return (
    <main className="relative hidden lg:flex items-center justify-center px-12 py-16 overflow-hidden">
      {/* Halos violeta atrás */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-[500px] w-[500px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-purple) 10%, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-10 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-purple) 8%, transparent)" }}
      />
      {/* Dot grid violeta */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(var(--brand-purple) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div
        className="relative w-full max-w-[520px]"
        style={{ transform: "rotate(1.2deg)" }}
      >
        {/* Sombra/ofset detrás */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[28px] translate-x-3 translate-y-3 blur-sm"
          style={{ background: "color-mix(in oklab, var(--brand-purple) 18%, transparent)" }}
        />

        {/* Card principal */}
        <div className="relative rounded-[28px] bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-2xl overflow-hidden">
          {/* Header tipo macOS */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--rule-soft)]">
            <div className="flex items-center gap-2">
              <span className="flex gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]/60" />
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#0d9488]/60" />
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]/60" />
              </span>
              <p className="ml-2 text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
                buleje.pe/superadmin
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider"
              style={{
                background: "color-mix(in oklab, var(--brand-purple) 12%, transparent)",
                color: "var(--brand-purple)",
              }}
            >
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
                  style={{ background: "var(--brand-purple)" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--brand-purple)" }}
                />
              </span>
              Live
            </span>
          </div>

          {/* Stat hero — MRR */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-3 mb-1">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                MRR · Mensual recurrente
              </p>
              <span
                className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold"
                style={{ color: "var(--data-success-600, var(--data-success-500))" }}
              >
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                +24%
              </span>
            </div>
            <p className="text-5xl font-black tracking-[-0.04em] tabular-nums leading-none text-[var(--text-primary)]">
              S/ <span style={{ color: "var(--brand-purple)" }}>14,830</span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              42 tenants activos · 4 trials abiertos
            </p>
          </div>

          {/* Mini chart — signups últimos 7 días */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-2 h-20">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-lg transition-all"
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(180deg, var(--brand-purple) 0%, color-mix(in oklab, var(--brand-purple) 60%, transparent) 100%)`,
                    opacity: i === bars.length - 1 ? 1 : 0.55 + (i / bars.length) * 0.4,
                  }}
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 tabular-nums font-bold">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mié</span>
              <span>Jue</span>
              <span>Vie</span>
              <span>Sáb</span>
              <span>Dom</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 pt-5 grid grid-cols-3 gap-3">
            {[
              { Icon: Building2, value: "42",   label: "Tenants" },
              { Icon: Activity,  value: "99.8%", label: "Uptime" },
              { Icon: Server,    value: "320ms", label: "p99" },
            ].map(({ Icon, value, label }) => (
              <div
                key={label}
                className="rounded-2xl bg-[var(--surface-sunken)]/60 border border-[var(--rule-soft)] px-3 py-3"
              >
                <Icon
                  className="h-4 w-4 mb-2"
                  strokeWidth={2}
                  style={{ color: "var(--brand-purple)" }}
                  aria-hidden
                />
                <p className="text-lg font-extrabold tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
                  {value}
                </p>
                <p className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Feed de actividad de plataforma */}
          <div className="px-6 py-5">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              Actividad plataforma
            </p>
            <ul className="space-y-2">
              {events.map((ev) => {
                const Icon = ev.icon;
                return (
                  <li
                    key={ev.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)]/40 px-3 py-2.5 border border-[var(--rule-soft)]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                          ev.variant === "new"
                            ? "text-white"
                            : ev.variant === "paid"
                            ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-600,var(--data-success-500))]"
                            : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
                        )}
                        style={
                          ev.variant === "new"
                            ? { background: "var(--brand-purple)" }
                            : undefined
                        }
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">
                          {ev.who}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                          {ev.what}
                        </p>
                      </div>
                    </div>
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] shrink-0 tabular-nums">
                      {ev.t}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Sticker flotante "Superadmin · Hoy" */}
        <div
          className="absolute -top-5 -left-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-xl"
          style={{
            background: "var(--text-primary)",
            color: "var(--surface-canvas)",
            transform: "rotate(-3deg)",
          }}
        >
          <Crown className="h-4 w-4" style={{ color: "var(--brand-purple)" }} strokeWidth={2.25} aria-hidden />
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]">
            Superadmin Console
          </span>
        </div>

        {/* Sticker flotante "+8 tenants esta semana" */}
        <div
          className="absolute -bottom-4 -right-4 inline-flex items-center gap-1.5 rounded-2xl text-white px-4 py-2.5 shadow-xl"
          style={{
            background: "var(--brand-purple)",
            boxShadow: "0 12px 32px -8px color-mix(in oklab, var(--brand-purple) 60%, transparent)",
            transform: "rotate(4deg)",
          }}
        >
          <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          <span className="text-sm font-black tracking-tight tabular-nums">
            +8 tenants · esta semana
          </span>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwitchChip — paleta violeta (plataforma) consistente con el resto.
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
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-current hover:bg-[var(--surface-sunken)]/40 transition-all group"
      style={{ borderColor: "var(--rule-base)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors"
          style={{
            background: "color-mix(in oklab, var(--brand-purple) 12%, transparent)",
            color: "var(--brand-purple)",
          }}
        >
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
        className="h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-all shrink-0"
        strokeWidth={2.5}
        style={{ color: "var(--text-tertiary)" }}
      />
    </a>
  );
}
