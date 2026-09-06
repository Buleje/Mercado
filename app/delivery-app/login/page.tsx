"use client";

/**
 * /delivery-app/login — Login para repartidores Buleje.
 *
 * Brandon mayo 14 2026 v3: aplicado el mismo concepto editorial que
 * /admin/login y /superadmin/login. Layout asimétrico [1fr_1.15fr]:
 *   - Izquierda: form centrado con brand badge naranja Moto, headline
 *     italic serif, switches a otros paneles colapsados.
 *   - Derecha (lg+): MOCKUP de la app de Repartidor — stat hero ganancias
 *     del día, mini-chart de viajes por hora, feed de pedidos asignados,
 *     stickers flotantes rotados.
 * Paleta: --brand-secondary (naranja delivery) + neutros.
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowUpRight, Store, Crown, Bike,
  Lock, ChevronDown, ShieldCheck, AlertTriangle, MapPin,
  Navigation, Clock, TrendingUp, Wallet, Eye, EyeOff,
} from "@buleje/design-system/icons";
import { MotoIcon } from "@/components/delivery/icons";
import { cn } from "@/lib/utils";
import { useLoginSecurity } from "@/hooks/useLoginSecurity";

export default function DeliveryLoginPage() {
  const router = useRouter();
  const phoneRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const {
    capsLock, retryAfter, onPasswordKey, startRetryFromResponse,
    messageForStatus, networkErrorMessage, mmss,
  } = useLoginSecurity();

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
      const res = await fetch("/api/delivery/me/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          // Rate limit / lockout: recargar no ayuda → countdown.
          startRetryFromResponse(res);
        } else {
          setError(messageForStatus(res.status, { attemptsLeft: data?.attemptsLeft }) ?? data.error ?? "No pudimos iniciar sesión");
        }
        return;
      }
      router.push("/delivery-app");
    } catch {
      setError(networkErrorMessage());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--surface-canvas)] grid lg:grid-cols-[1fr_1.15fr]">
      {/* CSS scoped: oculta widgets flotantes globales + focus orange del input */}
      <style jsx global>{`
        body[data-route="delivery-login"] [data-floating-widget],
        body[data-route="delivery-login"] .floating-widget,
        body[data-route="delivery-login"] [aria-label*="Productos recientes"],
        body[data-route="delivery-login"] [aria-label*="Carrito"],
        body[data-route="delivery-login"] [aria-label*="WhatsApp"] {
          display: none !important;
        }
        .dv-input:focus {
          border-color: var(--brand-secondary);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand-secondary) 15%, transparent);
        }
        .dv-input:hover {
          border-color: color-mix(in oklab, var(--brand-secondary) 40%, transparent);
        }
      `}</style>
      <BodyRouteMark />

      {/* Halos naranja atrás de todo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-secondary) 6%, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-secondary) 4%, transparent)" }}
      />

      {/* ─── COLUMNA IZQUIERDA — Form editorial centrado ─────────────── */}
      <aside className="relative flex flex-col justify-center px-5 py-10 sm:px-10 sm:py-16 lg:px-16">
        <div
          className={cn(
            "relative z-10 w-full max-w-[460px] mx-auto",
            shaking && "animate-[shake_0.45s_ease-out]",
          )}
        >
          {/* Brand badge superior */}
          <div className="flex items-center gap-2.5 mb-10">
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl shadow-md"
              style={{
                background: "var(--brand-secondary)",
                boxShadow: "0 8px 20px -6px color-mix(in oklab, var(--brand-secondary) 50%, transparent)",
              }}
            >
              <MotoIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p
                className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] leading-tight"
                style={{ color: "var(--brand-secondary)" }}
              >
                Buleje · Delivery
              </p>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                App de repartidor
              </p>
            </div>
          </div>

          {/* Eyebrow + título grande */}
          <p
            className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-3"
            style={{ color: "var(--brand-secondary)" }}
          >
            Iniciar sesión
          </p>
          <h1 className="text-[2.25rem] sm:text-[2.75rem] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
            Maneja tu ruta,
            <br />
            <span className="italic font-serif" style={{ color: "var(--brand-secondary)" }}>
              gana más hoy.
            </span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-sm">
            Ingresá con el número de WhatsApp con el que te inscribiste.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-10 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="login-phone"
                className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Tu WhatsApp
              </label>
              <div className="relative group">
                <Bike
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] transition-colors"
                  strokeWidth={2}
                />
                <input
                  ref={phoneRef}
                  id="login-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9XX XXX XXX"
                  autoComplete="tel"
                  className="w-full h-14 pl-12 pr-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all dv-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="login-pwd"
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
                  id="login-pwd"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onPasswordKey}
                  onKeyUp={onPasswordKey}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  className="w-full h-14 pl-12 pr-14 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all dv-input"
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
              <p className="text-xs text-[var(--text-tertiary)]">
                Si es tu primera vez, contactá a tu admin para obtener acceso.
              </p>
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
              disabled={loading || retryAfter > 0}
              className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl text-white text-base font-extrabold tracking-tight active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--brand-secondary)",
                boxShadow: "0 12px 24px -8px color-mix(in oklab, var(--brand-secondary) 50%, transparent)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                  Verificando…
                </>
              ) : retryAfter > 0 ? (
                <>
                  <Clock className="h-5 w-5" strokeWidth={2.5} />
                  Esperá {mmss(retryAfter)}
                </>
              ) : (
                <>
                  <Bike className="h-5 w-5" strokeWidth={2.25} />
                  Entrar a la app
                </>
              )}
            </button>
          </form>

          {/* CTA repartidor nuevo */}
          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            ¿Aún no eres repartidor?{" "}
            <Link
              href="/marketplace/repartidor"
              className="font-extrabold hover:underline"
              style={{ color: "var(--brand-secondary)" }}
            >
              Inscribite acá
            </Link>
          </p>

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
                title="Panel de la bodega"
              />
              <SwitchChip
                href="/superadmin/login"
                icon={<Crown className="h-4 w-4" strokeWidth={2} />}
                eyebrow="Plataforma"
                title="Acceso Superadmin"
              />
            </div>
          </details>

          {/* Trust badge inferior */}
          <p className="mt-12 flex items-center gap-2 text-xs text-[var(--text-tertiary)] leading-relaxed">
            <ShieldCheck
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--brand-secondary)" }}
            />
            Tu ubicación se comparte sólo cuando estás en línea · Cookies HttpOnly
          </p>
        </div>
      </aside>

      {/* ─── COLUMNA DERECHA — App preview de repartidor ──────────────── */}
      <RiderAppPreview />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function BodyRouteMark() {
  useEffect(() => {
    document.body.setAttribute("data-route", "delivery-login");
    return () => {
      document.body.removeAttribute("data-route");
    };
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RiderAppPreview — Mockup de la app de Repartidor:
//   - Stat hero: ganancias hoy (S/) + viajes
//   - Mini-chart: viajes por hora del día
//   - Feed: pedidos asignados con tienda/distancia/monto
//   - Stickers: "App Repartidor" + "+5 viajes vs. ayer"
// Identidad visual naranja `--brand-secondary`.
// ─────────────────────────────────────────────────────────────────────────────
function RiderAppPreview() {
  const orders = [
    { id: "1", store: "Pollería El Dorado", zone: "Callería · 1.2 km",  amount: 7.5, t: "ahora",       status: "live"   as const },
    { id: "2", store: "Doña Marta",         zone: "Yarinacocha · 2.1 km", amount: 6.0, t: "hace 12 min", status: "done"   as const },
    { id: "3", store: "Minimarket Lucía",   zone: "Manantay · 1.8 km",    amount: 8.5, t: "hace 28 min", status: "done"   as const },
    { id: "4", store: "Bodega San Martín",  zone: "Callería · 0.9 km",    amount: 5.0, t: "hace 45 min", status: "done"   as const },
  ];

  const bars = [0, 1, 3, 4, 2, 6, 5, 3];

  return (
    <main className="relative hidden lg:flex items-center justify-center px-12 py-16 overflow-hidden">
      {/* Halos naranja atrás */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-[500px] w-[500px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-secondary) 10%, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-10 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--brand-secondary) 8%, transparent)" }}
      />
      {/* Dot grid naranja */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(var(--brand-secondary) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div
        className="relative w-full max-w-[480px]"
        style={{ transform: "rotate(1.2deg)" }}
      >
        {/* Sombra/ofset detrás */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[28px] translate-x-3 translate-y-3 blur-sm"
          style={{ background: "color-mix(in oklab, var(--brand-secondary) 18%, transparent)" }}
        />

        {/* Card principal — estilo "app móvil" */}
        <div className="relative rounded-[36px] bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-2xl overflow-hidden">
          {/* Status bar tipo iOS */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <p className="text-xs font-bold text-[var(--text-tertiary)] tabular-nums">9:41</p>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">●●●●</span>
              <span aria-hidden className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-bold">100%</span>
            </div>
          </div>

          {/* Header app */}
          <div className="flex items-center justify-between px-6 pb-4 border-b border-[var(--rule-soft)]">
            <div className="flex items-center gap-2.5">
              <div
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: "var(--brand-secondary)" }}
              >
                <MotoIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                  Hola
                </p>
                <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                  Carlos S.
                </p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider"
              style={{
                background: "color-mix(in oklab, var(--data-success-500) 15%, transparent)",
                color: "var(--data-success-600, var(--data-success-500))",
              }}
            >
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
                  style={{ background: "var(--data-success-500)" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--data-success-500)" }}
                />
              </span>
              En línea
            </span>
          </div>

          {/* Stat hero — ganancias hoy */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-3 mb-1">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Ganancias hoy
              </p>
              <span
                className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold"
                style={{ color: "var(--brand-secondary)" }}
              >
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                +S/ 27 vs. ayer
              </span>
            </div>
            <p className="text-5xl font-black tracking-[-0.04em] tabular-nums leading-none text-[var(--text-primary)]">
              S/ <span style={{ color: "var(--brand-secondary)" }}>87</span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              12 viajes · 24 km recorridos
            </p>
          </div>

          {/* Mini chart — viajes por hora */}
          <div className="px-6 pt-5">
            <div className="flex items-end justify-between gap-2 h-20">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-lg transition-all"
                  style={{
                    height: `${Math.max(8, h * 14)}%`,
                    background: `linear-gradient(180deg, var(--brand-secondary) 0%, color-mix(in oklab, var(--brand-secondary) 60%, transparent) 100%)`,
                    opacity: i === bars.length - 1 ? 1 : 0.55 + (i / bars.length) * 0.4,
                  }}
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 tabular-nums font-bold">
              <span>9am</span>
              <span>12pm</span>
              <span>3pm</span>
              <span>6pm</span>
              <span>9pm</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 pt-5 grid grid-cols-3 gap-3">
            {[
              { Icon: Wallet,     value: "S/ 12", label: "Propinas" },
              { Icon: Clock,      value: "9min", label: "Promedio" },
              { Icon: Navigation, value: "4.9★", label: "Rating" },
            ].map(({ Icon, value, label }) => (
              <div
                key={label}
                className="rounded-2xl bg-[var(--surface-sunken)]/60 border border-[var(--rule-soft)] px-3 py-3"
              >
                <Icon
                  className="h-4 w-4 mb-2"
                  strokeWidth={2}
                  style={{ color: "var(--brand-secondary)" }}
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

          {/* Feed pedidos del día */}
          <div className="px-6 py-5">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              Tus viajes hoy
            </p>
            <ul className="space-y-2">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border",
                    o.status === "live"
                      ? "border-[color:color-mix(in_oklab,var(--brand-secondary)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--brand-secondary)_8%,transparent)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                        o.status === "live"
                          ? "text-white"
                          : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
                      )}
                      style={
                        o.status === "live"
                          ? { background: "var(--brand-secondary)" }
                          : undefined
                      }
                    >
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">
                        {o.store}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                        {o.zone} · {o.t}
                      </p>
                    </div>
                  </div>
                  <p
                    className="text-sm font-black tabular-nums shrink-0"
                    style={
                      o.status === "live"
                        ? { color: "var(--brand-secondary)" }
                        : { color: "var(--text-primary)" }
                    }
                  >
                    S/ {o.amount.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sticker flotante "App Repartidor" */}
        <div
          className="absolute -top-5 -left-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-xl"
          style={{
            background: "var(--text-primary)",
            color: "var(--surface-canvas)",
            transform: "rotate(-3deg)",
          }}
        >
          <Bike
            className="h-4 w-4"
            style={{ color: "var(--brand-secondary)" }}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]">
            App Repartidor
          </span>
        </div>

        {/* Sticker flotante "+5 viajes vs. ayer" */}
        <div
          className="absolute -bottom-4 -right-4 inline-flex items-center gap-1.5 rounded-2xl text-white px-4 py-2.5 shadow-xl"
          style={{
            background: "var(--brand-secondary)",
            boxShadow: "0 12px 32px -8px color-mix(in oklab, var(--brand-secondary) 60%, transparent)",
            transform: "rotate(4deg)",
          }}
        >
          <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          <span className="text-sm font-black tracking-tight tabular-nums">
            +5 viajes vs. ayer
          </span>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwitchChip — variante naranja (delivery) consistente.
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
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-sunken)]/40 transition-all group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors"
          style={{
            background: "color-mix(in oklab, var(--brand-secondary) 12%, transparent)",
            color: "var(--brand-secondary)",
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
      <ArrowUpRight
        className="h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0"
        strokeWidth={2.5}
      />
    </Link>
  );
}
