"use client";

import { PageTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogIn,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Store,
  Zap,
  MessageSquare,
  WifiOff,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ─── Animaciones CSS ─────────────────────────────────────────────────────── */
const STYLES = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
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
  50%       { transform: translateY(-18px) rotate(8deg); }
}
@keyframes floatB {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%       { transform: translateY(14px) rotate(-6deg); }
}
@keyframes floatC {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-10px); }
}
.anim-fadeup {
  animation: fadeUp 0.55s cubic-bezier(0.175,0.885,0.32,1.275) both;
}
.anim-shake {
  animation: shake 0.45s cubic-bezier(0.4,0,0.2,1) both;
}
.float-a { animation: floatA 6s ease-in-out infinite; }
.float-b { animation: floatB 8s ease-in-out infinite; }
.float-c { animation: floatC 5s ease-in-out infinite; }
/* 2-col grid en desktop */
@media (min-width: 1024px) {
  .login-grid { grid-template-columns: 1fr 1fr !important; }
  .login-col-left  { grid-column: 1; }
  .login-col-right { grid-column: 2; }
}
@media (max-width: 1023px) {
  .login-col-left  { display: none !important; }
  .login-col-right { grid-column: 1; }
}
/* Dark mode outer */
.dark .login-outer {
  background: linear-gradient(135deg,#0a0f0d 0%,#0f1a14 60%,#0a0f0d 100%) !important;
}
@media (prefers-reduced-motion: reduce) {
  .anim-fadeup, .anim-shake, .float-a, .float-b, .float-c {
    animation: none !important;
  }
}
`;

/* ─── SVG de marca social ─────────────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

/* ─── Feature card (columna izquierda) ───────────────────────────────────── */
function FeatureItem({
  icon,
  title,
  desc,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay: string;
}) {
  return (
    <div
      className="anim-fadeup flex items-start gap-3"
      style={{ animationDelay: delay }}
    >
      <div
        className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.15)" }}
      >
        {icon}
      </div>
      <div>
        <p className="font-semibold text-white text-sm leading-tight">{title}</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

/* ─── Botón social ────────────────────────────────────────────────────────── */
function SocialBtn({
  label,
  icon,
  bg,
  textColor,
  border,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  textColor: string;
  border?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Iniciar sesión con ${label}`}
      className="flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-[var(--dur-base)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 hover:opacity-80 active:scale-95"
      style={{
        flex: 1,
        minHeight: "48px",
        background: bg,
        color: textColor,
        border: border ?? "none",
        cursor: "pointer",
        padding: "0 12px",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─── Componente principal ────────────────────────────────────────────────── */
export default function AdminLoginPage() {
  const router = useRouter();
  const fromRef = useRef<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Detect tenant prefix from URL so navigations preserve /t/slug/
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

  /* Inicialización */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fromRef.current = params.get("from");

    // ?tenant=slug → viene de /t/[slug]/admin, guardar para redirect post-login
    const tenantParam = params.get("tenant");
    const autoParam = params.get("auto");
    const userParam = params.get("user");

    if (tenantParam) {
      localStorage.setItem("active-tenant-slug", tenantParam);
      sessionStorage.setItem("active-tenant-slug", tenantParam);
      setActiveTenant(tenantParam);
      // Si no hay ?from= explícito, el post-login va a /t/[slug]/admin
      if (!fromRef.current) {
        fromRef.current = `/t/${tenantParam}/admin`;
      }
    } else {
      const slug = localStorage.getItem("active-tenant-slug");
      if (slug && slug !== "main") setActiveTenant(slug);
    }

    const saved = localStorage.getItem("login-remember-username");
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }

    // SuperAdmin auto-fill: ?tenant=slug&auto=1
    if (tenantParam && autoParam === "1") {
      try {
        const credKey = `sa-cred-${tenantParam}`;
        const credJson = localStorage.getItem(credKey);
        if (credJson) {
          const cred = JSON.parse(credJson) as { username: string; password: string };
          if (cred.username) setUsername(cred.username);
          if (cred.password) setPw(cred.password);
          return; // Don't focus, fields are filled
        }
      } catch { /* silent */ }
      if (userParam) setUsername(userParam);
    }

    /* Focus automático */
    usernameRef.current?.focus();
  }, []);

  /* Trigger animación shake en error */
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

  /* Submit principal */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tenantSlug =
        typeof window !== "undefined"
          ? localStorage.getItem("active-tenant-slug")
          : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (tenantSlug) headers["x-tenant-id"] = tenantSlug;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: username || undefined, password: pw }),
      });

      if (res.ok) {
        if (rememberMe) {
          localStorage.setItem("login-remember-username", username);
        } else {
          localStorage.removeItem("login-remember-username");
        }
        const data = (await res.json()) as {
          ok: boolean;
          role?: string;
          onboardingPending?: boolean;
          tenantId?: string;
          tenantSlug?: string;
        };
        // Store the tenant slug from the login response (server resolved the correct tenant)
        if (data.tenantSlug) {
          localStorage.setItem("active-tenant-slug", data.tenantSlug);
          sessionStorage.setItem("active-tenant-slug", data.tenantSlug);
        }
        if (data.onboardingPending && !fromRef.current) {
          router.push("/onboarding");
        } else if (data.role === "owner" || data.role === "platform_admin") {
          // Superadmin-level users should use the platform login
          router.push("/superadmin/login");
        } else {
          router.push(
            fromRef.current
              ? decodeURIComponent(fromRef.current)
              : adminPath("/admin")
          );
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

  /* Bypass login */
  const handleBypass = async () => {
    setBypassLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bypass", { method: "POST" });
      if (res.ok) {
        router.push(
          fromRef.current ? decodeURIComponent(fromRef.current) : adminPath("/admin")
        );
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
    <>
      <style>{STYLES}</style>
      <div
        className="min-h-screen flex items-center justify-center p-4 login-outer"
        style={{ background: "linear-gradient(135deg,#f0fdf4 0%,#ccfbf1 50%,#e0f2fe 100%)" }}
      >
        {/* Wrapper 2 columnas */}
        <div
          className="anim-fadeup w-full overflow-hidden login-grid"
          style={{
            maxWidth: "900px",
            borderRadius: "1.5rem",
            boxShadow: "0 32px 80px -12px rgba(0,0,0,0.18), 0 8px 24px -4px rgba(0,0,0,0.10)",
            display: "grid",
            gridTemplateColumns: "1fr",
          }}
        >
          {/* ── Columna izquierda (hero) ─────────────────────────────────── */}
          <div
            className="login-col-left flex flex-col justify-between p-10"
            style={{
              background: "linear-gradient(155deg,#00B4A6 0%,#2dd4bf 55%,#33C4B8 100%)",
              position: "relative",
              overflow: "hidden",
              minHeight: "560px",
            }}
          >
            {/* Dot pattern decorativo */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/* Círculos flotantes decorativos */}
            <div
              aria-hidden="true"
              className="float-a"
              style={{
                position: "absolute",
                top: "10%",
                right: "-40px",
                width: "180px",
                height: "180px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            />
            <div
              aria-hidden="true"
              className="float-b"
              style={{
                position: "absolute",
                bottom: "12%",
                left: "-50px",
                width: "220px",
                height: "220px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            />
            <div
              aria-hidden="true"
              className="float-c"
              style={{
                position: "absolute",
                bottom: "35%",
                right: "8%",
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.10)",
              }}
            />

            {/* Contenido del hero */}
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Logo */}
              <div className="flex items-center gap-3 mb-10">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                >
                  <Store className="w-6 h-6 text-white" />
                </div>
                <span
                  className="font-extrabold text-white tracking-tight"
                  style={{ fontSize: "1.5rem" }}
                >
                  Buleje
                </span>
              </div>

              {/* Headline */}
              <SectionTitle
                className="font-extrabold text-white mb-3"
                style={{
                  fontSize: "clamp(1.75rem,3vw,2.4rem)",
                  lineHeight: "1.15",
                  letterSpacing: "-0.03em",
                }}
              >
                Gestiona tu negocio{" "}
                <span style={{ color: "rgba(255,255,255,0.75)" }}>
                  inteligente
                </span>
              </SectionTitle>
              <p
                className="mb-10"
                style={{
                  color: "rgba(255,255,255,0.70)",
                  fontSize: "0.95rem",
                  lineHeight: "1.6",
                  maxWidth: "340px",
                }}
              >
                Plataforma ERP + e-commerce diseñada para bodegas peruanas.
                Vende más, organiza mejor.
              </p>

              {/* Features */}
              <div className="flex flex-col gap-5">
                <FeatureItem
                  icon={<Zap className="w-4 h-4 text-white" />}
                  title="POS integrado"
                  desc="Cobra rápido, gestiona caja y genera boletas al instante"
                  delay="0.15s"
                />
                <FeatureItem
                  icon={<MessageSquare className="w-4 h-4 text-white" />}
                  title="WhatsApp Bot"
                  desc="Recibe pedidos y notifica a tus clientes automáticamente"
                  delay="0.25s"
                />
                <FeatureItem
                  icon={<WifiOff className="w-4 h-4 text-white" />}
                  title="Modo offline"
                  desc="Sigue vendiendo aunque se vaya el internet"
                  delay="0.35s"
                />
              </div>
            </div>

            {/* Footer del hero */}
            <p
              style={{
                position: "relative",
                zIndex: 1,
                color: "rgba(255,255,255,0.45)",
                fontSize: "0.72rem",
              }}
            >
              Hecho con cariño en Pucallpa, Perú
            </p>
          </div>

          {/* ── Columna derecha (formulario) ─────────────────────────────── */}
          <div
            className="login-col-right bg-[var(--surface-raised)] flex flex-col justify-center p-8 lg:p-10"
            style={{ minHeight: "560px" }}
          >
            {/* Header del form */}
            <div className="mb-7">
              {/* Logo visible solo en mobile */}
              <div className="flex items-center gap-2 mb-6 lg:hidden">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl"
                  style={{ background: "linear-gradient(135deg,#00B4A6,#2dd4bf)" }}
                >
                  <Store className="w-5 h-5 text-white" />
                </div>
                <span className="font-extrabold text-[var(--text-primary)] text-lg">
                  Buleje
                </span>
              </div>

              <PageTitle
                className="font-extrabold text-[var(--text-primary)] mb-1"
                style={{ fontSize: "clamp(1.4rem,3vw,1.75rem)", letterSpacing: "-0.02em" }}
              >
                Bienvenido de vuelta
              </PageTitle>
              <p className="text-sm text-[var(--text-tertiary)]">
                Ingresa tus credenciales para continuar
              </p>

              {/* Badge de tenant activo */}
              {activeTenant && (
                <div
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg"
                  style={{
                    background: "rgba(15,118,110,0.08)",
                    border: "1px solid rgba(15,118,110,0.2)",
                  }}
                >
                  <Store className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                    Tienda:{" "}
                    <strong className="font-bold">{activeTenant}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Input usuario */}
              <div className="relative">
                <User
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={usernameRef}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Usuario (opcional)"
                  autoComplete="username"
                  className={cn(
                    "w-full pl-10 pr-4 py-3 rounded-xl border-2 text-sm",
                    "bg-[var(--surface-sunken)]",
                    "text-[var(--text-primary)]",
                    "placeholder:text-[var(--text-tertiary)] dark:placeholder:text-[var(--text-secondary)]",
                    "outline-none transition-all duration-[var(--dur-base)]",
                    "focus:border-teal-500 dark:focus:border-teal-500",
                    "border-[var(--rule-base)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500"
                  )}
                  style={{ minHeight: "48px" }}
                />
              </div>

              {/* Input contraseña */}
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  className={cn(
                    "w-full pl-10 pr-12 py-3 rounded-xl border-2 text-sm",
                    "text-[var(--text-primary)]",
                    "placeholder:text-[var(--text-tertiary)] dark:placeholder:text-[var(--text-secondary)]",
                    "outline-none transition-all duration-[var(--dur-base)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500",
                    error
                      ? "border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/20 focus:border-[var(--data-error)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-sunken)] focus:border-teal-500 dark:focus:border-teal-500"
                  )}
                  style={{ minHeight: "48px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 rounded"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Error con shake */}
              {error && (
                <div
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium",
                    "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error)] dark:text-[var(--data-error)]",
                    "border border-[var(--data-error)] dark:border-[var(--data-error)]",
                    shaking && "anim-shake"
                  )}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              {/* Recordarme + Olvidé contraseña */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-[var(--dur-fast)]",
                        rememberMe
                          ? "bg-teal-600 border-teal-600"
                          : "border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)]"
                      )}
                    >
                      {rememberMe && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          viewBox="0 0 10 8"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] dark:group-hover:text-gray-200 transition-colors">
                    Recordarme
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => alert("Recuperación de contraseña próximamente")}
                  className="text-xs text-teal-700 dark:text-teal-400 hover:underline font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 rounded"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Botón principal */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg font-bold text-sm text-white transition-all duration-[var(--dur-base)] disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                style={{
                  minHeight: "48px",
                  background: "linear-gradient(135deg,#00B4A6 0%,#2dd4bf 100%)",
                  boxShadow: "0 6px 20px -4px rgba(15,118,110,0.45)",
                }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                )}
                {loading ? "Verificando…" : "Ingresar"}
              </button>
            </form>

            {/* Separador login social */}
            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                o continúa con
              </span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Botones sociales */}
            <div className="flex gap-2">
              <SocialBtn
                label="Google"
                icon={<GoogleIcon />}
                bg="#fff"
                textColor="#374151"
                border="1.5px solid #e5e7eb"
                onClick={() => alert("Login con Google próximamente")}
              />
              <SocialBtn
                label="Facebook"
                icon={<FacebookIcon />}
                bg="#1877F2"
                textColor="#fff"
                onClick={() => alert("Login con Facebook próximamente")}
              />
              <SocialBtn
                label="Apple"
                icon={<AppleIcon />}
                bg="#000"
                textColor="#fff"
                onClick={() => alert("Login con Apple próximamente")}
              />
            </div>

            {/* Separador bypass */}
            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-[var(--text-tertiary)]">o</span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Bypass login */}
            <button
              type="button"
              onClick={handleBypass}
              disabled={bypassLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg font-semibold text-sm transition-all duration-[var(--dur-base)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 hover:bg-[var(--surface-sunken)] active:scale-[0.98]"
              style={{
                minHeight: "48px",
                background: "transparent",
                border: "1.5px solid #e5e7eb",
                color: "#6b7280",
              }}
            >
              {bypassLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {bypassLoading ? "Entrando…" : "Entrar sin login"}
            </button>

            {/* Hint de roles */}
            <p className="text-center mt-3 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] font-mono"
              style={{ fontSize: "0.68rem" }}>
              admin · cajero · almacen
            </p>

            {/* Footer */}
            <p
              className="text-center mt-6 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
              style={{ fontSize: "0.7rem" }}
            >
              Buleje &copy; 2026 &middot; Hecho en Perú
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
