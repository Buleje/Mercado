"use client";

import { useEffect, useRef, useState } from "react";
import {
  Shield,
  Award,
  Crown,
  Sparkles,
  Star,
  Gift,
  ArrowUp,
  TrendingUp,
  Lock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tier = "bronce" | "plata" | "oro";

interface LoyaltyTransaction {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface LoyaltyData {
  points: number;
  tier: Tier;
  transactions?: LoyaltyTransaction[];
}

interface LoyaltyWidgetProps {
  customerPhone?: string;
  className?: string;
}

// ── Configuración de tiers ────────────────────────────────────────────────────

const TIER_CONFIG = {
  bronce: {
    label: "Bronce",
    Icon: Shield,
    gradientFrom: "#b45309",
    gradientTo: "#f59e0b",
    fillClass: "bg-[#b45309]",
    ringClass: "ring-[#b45309]/40",
    textClass: "text-[#b45309] dark:text-[#f59e0b]",
    bgClass: "bg-[var(--surface-sunken)]",
    minPoints: 0,
    maxPoints: 500,
    nextTier: "plata" as Tier | null,
    nextTierLabel: "Plata",
    benefits: [
      "1 punto por cada S/1 gastado",
      "Acumula puntos en todas tus compras",
      "Acceso a ofertas exclusivas para socios",
    ],
  },
  plata: {
    label: "Plata",
    Icon: Award,
    gradientFrom: "#6b7280",
    gradientTo: "#d1d5db",
    fillClass: "bg-[#6b7280]",
    ringClass: "ring-[#6b7280]/40",
    textClass: "text-[#6b7280] dark:text-[#d1d5db]",
    bgClass: "bg-[var(--surface-sunken)]",
    minPoints: 500,
    maxPoints: 1000,
    nextTier: "oro" as Tier | null,
    nextTierLabel: "Oro",
    benefits: [
      "1.5x puntos por cada S/1 gastado",
      "Envio gratis en pedidos mayores a S/50",
      "Prioridad en atención al cliente",
    ],
  },
  oro: {
    label: "Oro",
    Icon: Crown,
    gradientFrom: "#b45309",
    gradientTo: "#fbbf24",
    fillClass: "bg-[#d97706]",
    ringClass: "ring-[#d97706]/50",
    textClass: "text-[#d97706] dark:text-[#fbbf24]",
    bgClass: "bg-[var(--surface-sunken)]",
    minPoints: 1000,
    maxPoints: null,
    nextTier: null,
    nextTierLabel: null,
    benefits: [
      "2x puntos por cada S/1 gastado",
      "Envio gratis en todos los pedidos",
      "5% de descuento permanente en toda la tienda",
    ],
  },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPoints(n: number): string {
  return n.toLocaleString("es-PE");
}

function getTransactionLabel(tx: LoyaltyTransaction): string {
  const meta = tx.metadata;
  const orderId =
    meta && typeof meta.orderId === "string" ? meta.orderId : null;
  const couponCode =
    meta && typeof meta.couponCode === "string" ? meta.couponCode : null;

  if (tx.amount > 0) {
    if (orderId) return `Compra #${orderId.slice(-6).toUpperCase()}`;
    if (tx.reason === "referral") return "Bono por referido";
    if (tx.reason === "promotion") return "Promocion especial";
    return "Puntos acumulados";
  } else {
    if (couponCode) return `Canje: cupon ${couponCode}`;
    if (tx.reason === "redemption") return "Canje de puntos";
    return "Puntos canjeados";
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-[var(--surface-raised)] p-5 space-y-4 animate-pulse"
      aria-label="Cargando programa de puntos"
      role="status"
    >
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded-md bg-muted" />
          <div className="h-7 w-36 rounded-md bg-muted" />
          <div className="h-3 w-20 rounded-md bg-muted" />
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-muted" />
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded-md bg-muted" />
        <div className="h-3 w-2/3 rounded-md bg-muted" />
        <div className="h-3 w-1/2 rounded-md bg-muted" />
      </div>
    </div>
  );
}

// ── Teaser card (no logueado o error) ────────────────────────────────────────

function TeaserCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--accent)]/30 bg-[var(--surface-sunken)]",
        "p-5",
        className,
      )}
      role="complementary"
      aria-label="Programa de puntos de fidelidad"
    >
      {/* Decoración de fondo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--accent)]/10 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-[#f4a261]/10 blur-2xl"
      />

      <div className="relative space-y-3">
        {/* Header con íconos de tiers */}
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-primary)] ring-2 ring-background">
              <Shield className="h-4 w-4 text-[var(--surface-canvas)]" aria-hidden="true" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-tertiary)] ring-2 ring-background">
              <Award className="h-4 w-4 text-[var(--surface-canvas)]" aria-hidden="true" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] ring-2 ring-background">
              <Crown className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Programa de puntos
          </span>
        </div>

        {/* Mensaje principal */}
        <div>
          <p className="text-base font-bold text-[var(--text-primary)] leading-snug">
            Gana puntos con cada compra
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Inicia sesion para ver tus puntos y desbloquear beneficios exclusivos
          </p>
        </div>

        {/* Beneficios en pastillas */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { icon: Star, text: "Puntos por compra" },
            { icon: Gift, text: "Canjes exclusivos" },
            { icon: TrendingUp, text: "Sube de nivel" },
          ].map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
            >
              <Icon className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
              {text}
            </span>
          ))}
        </div>

        {/* CTA sutil */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--accent)] font-medium">
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>Inicia sesion para ver tus puntos</span>
        </div>
      </div>
    </div>
  );
}

// ── Barra de progreso animada ─────────────────────────────────────────────────

function ProgressBar({
  pct,
  tierClass,
}: {
  pct: number;
  tierClass: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.width = "0%";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "width 0.9s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.width = `${pct}%`;
    });
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-muted dark:bg-muted/50"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        ref={barRef}
        className={cn("h-full rounded-full", tierClass)}
        style={{ width: "0%" }}
      />
    </div>
  );
}

// ── Animación de chispas para nivel Oro ──────────────────────────────────────

function GoldSparkles() {
  const sparks = Array.from({ length: 6 }, (_, i) => ({
    delay: i * 200,
    x: 10 + i * 14,
    size: i % 2 === 0 ? "h-3 w-3" : "h-2 w-2",
  }));

  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {sparks.map((s, i) => (
        <Sparkles
          key={i}
          className={cn("text-yellow-400 animate-pulse", s.size)}
          style={{ animationDelay: `${s.delay}ms` }}
        />
      ))}
    </div>
  );
}

// ── Badge circular de tier ────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: Tier }) {
  const config = TIER_CONFIG[tier];
  const { Icon } = config;

  return (
    <div className="relative shrink-0">
      {/* Anillo exterior con glow */}
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full ring-4",
          config.fillClass,
          config.ringClass,
        )}
        aria-hidden="true"
      >
        <Icon className="h-7 w-7 text-white" />
      </div>
      {/* Etiqueta del tier debajo del badge */}
      <span
        className={cn(
          "absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap",
          "rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
          config.bgClass,
          config.textClass,
        )}
      >
        {config.label}
      </span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function LoyaltyWidget({
  customerPhone,
  className,
}: LoyaltyWidgetProps) {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(!!customerPhone);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (!customerPhone) return;

    let cancelled = false;

    (async () => {
      try {
        // Pre-check sesión activa: evita 401 ruidoso en consola cuando hay
        // un customer en localStorage pero la cookie ya expiró.
        const auth = await fetch("/api/auth/customer/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled || !auth.ok) {
          if (!cancelled) { setFetchFailed(true); setLoading(false); }
          return;
        }
        const authData = await auth.json();
        if (!authData?.authenticated) {
          if (!cancelled) { setFetchFailed(true); setLoading(false); }
          return;
        }

        const res = await fetch(`/api/loyalty/${encodeURIComponent(customerPhone)}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          points: number;
          tier?: Tier;
          loyaltyTier?: string;
          loyaltyPoints?: number;
          transactions?: LoyaltyTransaction[];
        };
        if (cancelled) return;
        const points = json.points ?? json.loyaltyPoints ?? 0;
        const rawTier = (json.tier ?? json.loyaltyTier ?? "bronce")
          .toString()
          .toLowerCase();
        const tier: Tier =
          rawTier === "oro" ? "oro" : rawTier === "plata" ? "plata" : "bronce";
        setData({ points, tier, transactions: json.transactions ?? [] });
      } catch {
        if (!cancelled) setFetchFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerPhone]);

  // ── Sin sesión o error de fetch → Teaser ────────────────────────────────
  if (!customerPhone || fetchFailed) {
    return <TeaserCard className={className} />;
  }

  // ── Cargando ─────────────────────────────────────────────────────────────
  if (loading) {
    return <WidgetSkeleton />;
  }

  // ── Sin datos (cliente no encontrado, 404 silencioso) ────────────────────
  if (!data) {
    return <TeaserCard className={className} />;
  }

  const config = TIER_CONFIG[data.tier];
  const isGold = data.tier === "oro";

  // Cálculo de progreso hacia el siguiente tier
  const progressPct = isGold
    ? 100
    : Math.min(
        100,
        Math.round(
          ((data.points - config.minPoints) /
            ((config.maxPoints ?? config.minPoints + 500) - config.minPoints)) *
            100,
        ),
      );
  const remaining = isGold
    ? 0
    : Math.max(0, (config.maxPoints ?? 0) - data.points);

  // Últimas 3 transacciones
  const recentTx = (data.transactions ?? []).slice(0, 3);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[var(--surface-raised)] shadow-sm",
        "border-border dark:border-border",
        "transition-shadow duration-[var(--dur-base)] hover:shadow-md",
        className,
      )}
      role="region"
      aria-label="Tu programa de puntos de fidelidad"
    >
      {/* Franja superior de color del tier */}
      <div
        className={cn(
          "h-1.5 w-full",
          config.fillClass,
        )}
        aria-hidden="true"
      />

      <div className="p-5 space-y-5">
        {/* ── Sección header: badge + puntos ──────────────────────────── */}
        <div className="flex items-start gap-4">
          <TierBadge tier={data.tier} />

          {/* Puntos y nivel */}
          <div className="flex-1 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Tus puntos acumulados
            </p>
            <p
              className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]"
              aria-label={`${formatPoints(data.points)} puntos`}
            >
              {formatPoints(data.points)}
              <span className="ml-1.5 text-base font-semibold text-[var(--text-secondary)]">
                pts
              </span>
            </p>

            {/* Nivel máximo o siguiente tier */}
            {isGold ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <GoldSparkles />
                <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                  Nivel máximo alcanzado
                </span>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                <ArrowUp
                  className="h-3 w-3 text-[var(--accent)]"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatPoints(remaining)}
                  </span>{" "}
                  puntos para nivel{" "}
                  <span
                    className={cn("font-bold", config.textClass)}
                  >
                    {config.nextTierLabel}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Barra de progreso ────────────────────────────────────────── */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-medium">{config.label}</span>
            {!isGold && (
              <span className="font-medium">{config.nextTierLabel}</span>
            )}
          </div>
          {isGold ? (
            <div
              className={cn(
                "h-3 w-full overflow-hidden rounded-full",
                config.fillClass,
              )}
              role="progressbar"
              aria-valuenow={100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Nivel máximo alcanzado"
            />
          ) : (
            <ProgressBar pct={progressPct} tierClass={config.fillClass} />
          )}
          <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-secondary)] tabular-nums">
            <span>{formatPoints(config.minPoints)}</span>
            {!isGold && config.maxPoints != null && (
              <span>{formatPoints(config.maxPoints)}</span>
            )}
          </div>
        </div>

        {/* ── Beneficios del tier actual ───────────────────────────────── */}
        <div
          className={cn("rounded-xl p-3.5 space-y-2", config.bgClass)}
          aria-label={`Beneficios del nivel ${config.label}`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Tus beneficios actuales
          </p>
          <ul className="space-y-1.5" role="list">
            {config.benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-2 text-sm text-[var(--text-primary)]"
              >
                <Star
                  className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", config.textClass)}
                  aria-hidden="true"
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Actividad reciente ───────────────────────────────────────── */}
        {recentTx.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              Actividad reciente
            </p>
            <ul className="space-y-1.5" role="list">
              {recentTx.map((tx) => {
                const isEarn = tx.amount > 0;
                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          isEarn
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "bg-[#f4a261]/15 text-[#f4a261]",
                        )}
                        aria-hidden="true"
                      >
                        {isEarn ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <Gift className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--text-primary)]">
                        {getTransactionLabel(tx)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-bold tabular-nums",
                        isEarn
                          ? "text-[var(--accent)]"
                          : "text-[#f4a261]",
                      )}
                      aria-label={`${isEarn ? "Ganaste" : "Canjeaste"} ${Math.abs(tx.amount)} puntos`}
                    >
                      {isEarn ? "+" : ""}
                      {tx.amount.toLocaleString("es-PE")} pts
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Footer motivacional ─────────────────────────────────────── */}
        {!isGold && (
          <p className="text-center text-xs text-[var(--text-secondary)] border-t border-border pt-3">
            Sigue comprando y llega al nivel{" "}
            <span className={cn("font-bold", config.textClass)}>
              {config.nextTierLabel}
            </span>{" "}
            para ganar mas beneficios
          </p>
        )}
        {isGold && (
          <p className="text-center text-xs font-semibold text-yellow-600 dark:text-yellow-400 border-t border-border pt-3">
            Eres cliente VIP de Buleje. Gracias por tu fidelidad.
          </p>
        )}
      </div>
    </div>
  );
}

export default LoyaltyWidget;
