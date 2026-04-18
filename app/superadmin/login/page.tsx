"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Lock,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Eye,
  EyeOff,
  User,
  Server,
  Globe,
  BarChart3,
  AlertTriangle,
  Building2,
} from "lucide-react";

/* ─── Estilos y animaciones ──────────────────────────────────────────────── */
const STYLES = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}
@keyframes floatA {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%       { transform: translateY(-20px) rotate(8deg); }
}
@keyframes floatB {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%       { transform: translateY(16px) rotate(-6deg); }
}
@keyframes pulse-ring {
  0%   { transform: scale(1); opacity: 0.4; }
  50%  { transform: scale(1.12); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}
.anim-fadeup { animation: fadeUp 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both; }
.anim-shake  { animation: shake 0.45s cubic-bezier(0.4,0,0.2,1) both; }
.float-a     { animation: floatA 7s ease-in-out infinite; }
.float-b     { animation: floatB 9s ease-in-out infinite; }
.pulse-ring  { animation: pulse-ring 2.5s ease-out infinite; }
@media (min-width: 1024px) {
  .login-grid { grid-template-columns: 1fr 1fr !important; }
  .login-col-left  { display: flex !important; }
  .login-col-right { grid-column: 2; }
}
@media (max-width: 1023px) {
  .login-col-left  { display: none !important; }
  .login-col-right { grid-column: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .anim-fadeup, .anim-shake, .float-a, .float-b, .pulse-ring { animation: none !important; }
}
`;

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
    >
      <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <span className="text-lg font-extrabold text-white">{value}</span>
    </div>
  );
}

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const usernameRef = useRef<HTMLInputElement>(null);
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
  const codeRef = useRef<HTMLInputElement>(null);

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
    <>
      <style>{STYLES}</style>
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ccfbf1 50%, #e0f2fe 100%)" }}
      >
        {/* Card contenedor 2 columnas */}
        <div
          className="anim-fadeup w-full login-grid overflow-hidden"
          style={{
            maxWidth: "880px",
            borderRadius: "1.5rem",
            boxShadow: "0 32px 80px -12px rgba(0,0,0,0.18), 0 8px 24px -4px rgba(0,0,0,0.10)",
            display: "grid",
            gridTemplateColumns: "1fr",
          }}
        >
          {/* ── Columna izquierda (hero plataforma) ─────────────────────── */}
          <div
            className="login-col-left flex-col justify-between p-10 relative overflow-hidden"
            style={{
              background: "linear-gradient(155deg, #042f2e 0%, #00B4A6 55%, #115e59 100%)",
              minHeight: "560px",
            }}
          >
            {/* Dot pattern */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            {/* Círculo flotante 1 */}
            <div
              aria-hidden="true"
              className="float-a"
              style={{
                position: "absolute", top: "8%", right: "-50px",
                width: "200px", height: "200px", borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            />
            {/* Círculo flotante 2 */}
            <div
              aria-hidden="true"
              className="float-b"
              style={{
                position: "absolute", bottom: "10%", left: "-60px",
                width: "240px", height: "240px", borderRadius: "50%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />

            {/* Contenido hero */}
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Logo plataforma */}
              <div className="flex items-center gap-3 mb-10">
                <div
                  className="relative flex items-center justify-center w-12 h-12 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  <ShieldCheck className="w-6 h-6 text-white" />
                  {/* Pulse ring decorativo */}
                  <div
                    className="pulse-ring"
                    style={{
                      position: "absolute",
                      inset: "-4px",
                      borderRadius: "1rem",
                      border: "2px solid rgba(255,255,255,0.3)",
                    }}
                  />
                </div>
                <div>
                  <span className="font-extrabold text-white text-lg leading-none block">
                    Platform Admin
                  </span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Buleje SaaS
                  </span>
                </div>
              </div>

              {/* Headline */}
              <h2
                className="font-extrabold text-white mb-3"
                style={{
                  fontSize: "clamp(1.6rem, 2.8vw, 2.2rem)",
                  lineHeight: "1.15",
                  letterSpacing: "-0.03em",
                }}
              >
                Control total de{" "}
                <span style={{ color: "rgba(255,255,255,0.6)" }}>
                  la plataforma
                </span>
              </h2>
              <p
                className="mb-10"
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.9rem",
                  lineHeight: "1.6",
                  maxWidth: "320px",
                }}
              >
                Gestiona tenants, métricas globales, configuración del sistema
                y seguridad desde un único panel.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-10">
                <StatBadge label="Tenants" value="12" />
                <StatBadge label="Uptime" value="99.9%" />
                <StatBadge label="APIs" value="90+" />
              </div>

              {/* Feature list */}
              <div className="flex flex-col gap-4">
                {[
                  { icon: Building2, title: "Gestión de tenants", desc: "Alta, baja y configuración de tiendas" },
                  { icon: BarChart3, title: "Analytics globales", desc: "Métricas en tiempo real de toda la plataforma" },
                  { icon: Globe, title: "Multi-región", desc: "Control centralizado, deploy distribuido" },
                  { icon: Server, title: "Salud del sistema", desc: "Monitoreo de APIs, DB y workers" },
                ].map(({ icon: Icon, title, desc }, i) => (
                  <div
                    key={title}
                    className="anim-fadeup flex items-start gap-3"
                    style={{ animationDelay: `${0.1 + i * 0.08}s` }}
                  >
                    <div
                      className="mt-0.5 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm leading-tight">{title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p
              style={{
                position: "relative",
                zIndex: 1,
                color: "rgba(255,255,255,0.35)",
                fontSize: "0.7rem",
              }}
            >
              Acceso restringido — solo personal autorizado
            </p>
          </div>

          {/* ── Columna derecha (formulario) ────────────────────────────── */}
          <div
            className="login-col-right bg-white flex flex-col justify-center p-8 lg:p-10"
            style={{ minHeight: "560px" }}
          >
            {/* Header mobile: logo visible solo en móvil */}
            <div className="flex items-center gap-2 mb-7 lg:hidden">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: "linear-gradient(135deg, #00B4A6, #2dd4bf)" }}
              >
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-extrabold text-gray-900 text-lg">Platform Admin</span>
            </div>

            {!challengeId ? (
              <>
                {/* Session expired banner */}
                {sessionExpired && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--data-warning-50)] border border-[var(--data-warning)] px-4 py-3 text-[var(--data-warning)] text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Tu sesión expiró. Ingresa de nuevo para continuar.
                  </div>
                )}
                {/* Título del formulario */}
                <div className="mb-7">
                  <h1
                    className="font-extrabold text-gray-900 mb-1"
                    style={{ fontSize: "clamp(1.3rem, 2.5vw, 1.65rem)", letterSpacing: "-0.02em" }}
                  >
                    Bienvenido, Admin
                  </h1>
                  <p className="text-sm text-gray-500">
                    Ingresa tus credenciales para acceder al panel de plataforma
                  </p>
                </div>

                {/* Formulario login */}
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Input usuario */}
                  <div className="relative">
                    <User
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      ref={usernameRef}
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      placeholder="Usuario"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 text-sm bg-gray-50 text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-[var(--dur-base)] border-[var(--rule-base)] focus:border-teal-500"
                      style={{ minHeight: "48px" }}
                    />
                  </div>

                  {/* Input contraseña con toggle */}
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Contraseña"
                      className={`w-full pl-10 pr-12 py-3 rounded-xl border-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-[var(--dur-base)] ${
                        error
                          ? "border-[var(--data-error)] bg-[var(--data-error-50)]"
                          : "border-[var(--rule-base)] bg-gray-50 focus:border-teal-500"
                      }`}
                      style={{ minHeight: "48px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Error banner con shake */}
                  {error && (
                    <div
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[var(--data-error-50)] text-[var(--data-error)] border border-[var(--data-error)] ${shaking ? "anim-shake" : ""}`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Botón acceder */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white transition-all duration-[var(--dur-base)] disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                    style={{
                      minHeight: "48px",
                      background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
                    }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {loading ? "Verificando..." : "Acceder al panel"}
                  </button>
                </form>

                {/* Pie del formulario */}
                <div className="mt-6 flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 px-2">acceso seguro</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <p className="mt-4 text-xs text-center text-gray-400 leading-relaxed">
                  Esta área es de <strong className="text-gray-600">acceso restringido</strong>. <br />
                  Los intentos fallidos son registrados y monitoreados.
                </p>
              </>
            ) : (
              /* ── 2FA Verification ────────────────────────────────────── */
              <>
                <div className="mb-7">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
                  >
                    <KeyRound className="w-6 h-6 text-white" />
                  </div>
                  <h1
                    className="font-extrabold text-gray-900 mb-1"
                    style={{ fontSize: "clamp(1.3rem, 2.5vw, 1.65rem)", letterSpacing: "-0.02em" }}
                  >
                    Verificación 2FA
                  </h1>
                  <p className="text-sm text-gray-500">
                    Ingresa el código de 6 dígitos del servidor para continuar
                  </p>
                </div>

                <form onSubmit={handleVerify2FA} className="space-y-4">
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    placeholder="000000"
                    className="w-full bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] focus:border-[var(--accent)] text-[var(--text-primary)] rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-[var(--ls-wider)] outline-none transition-all"
                    style={{ minHeight: "64px" }}
                  />

                  {error && (
                    <div
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-[var(--data-error-50)] text-[var(--data-error)] border border-[var(--data-error)] ${shaking ? "anim-shake" : ""}`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white transition-all duration-[var(--dur-base)] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
                    style={{
                      minHeight: "48px",
                      background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
                    }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    {loading ? "Verificando..." : "Confirmar código"}
                  </button>

                  <button
                    type="button"
                    onClick={resetTo2FA}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-teal-700 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Volver al login
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
