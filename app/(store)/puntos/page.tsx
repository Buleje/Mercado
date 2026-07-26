"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Trophy,
  Loader2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Clock,
  ShoppingCart,
  Gift,
  Medal,
  Sparkles,
  Tag,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

/* ── Types ──────────────────────────────────────────────────────── */

type AutoDiscountTier = {
  minPurchases: number;
  percent: number;
  label: string;
};

type AutoDiscountData = {
  totalOrders: number;
  currentTier: string;
  currentPercent: number;
  nextTier: { label: string; percent: number; ordersNeeded: number } | null;
  allTiers: AutoDiscountTier[];
};

type LoyaltyData = {
  phone?: string;
  name?: string;
  loyaltyPoints?: number;
  loyaltyTier: string;
  totalSpent?: number | string;
  tiers?: { name: string; minSpent: number }[];
  referralCode?: string | null;
  creditBalance?: number;
  autoDiscount?: AutoDiscountData;
};

type Reward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: string;
  value: number;
  icon: string;
};

type LoyaltyTransaction = {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

/* ── Tier styles ─────────────────────────────────────────────────── */

const TIER_META: Record<
  string,
  { label: string; color: string; Icon: typeof Award }
> = {
  bronce: { label: "Bronce", color: "var(--data-warning-700)", Icon: Medal },
  plata: { label: "Plata", color: "var(--text-secondary)", Icon: Medal },
  oro: { label: "Oro", color: "var(--data-warning-600)", Icon: Trophy },
  diamante: { label: "Diamante", color: "var(--accent)", Icon: Award },
};

const DEFAULT_TIERS = [
  { name: "bronce", minSpent: 0 },
  { name: "plata", minSpent: 200 },
  { name: "oro", minSpent: 500 },
  { name: "diamante", minSpent: 1500 },
] as const;

/* ── Helpers ────────────────────────────────────────────────────── */

function fmtSoles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

function fmtPoints(n: number): string {
  return n.toLocaleString("es-PE");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 5) return "hace un momento";
    if (mins < 60) return `hace ${mins} min`;
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${days} día${days === 1 ? "" : "s"}`;
  } catch {
    return iso;
  }
}

/**
 * Convierte totalSpent (que puede venir como string Decimal o number) a number
 * de forma defensiva. Bug capturado en producción cuando .toFixed() crasheaba
 * sobre el string serializado de Prisma Decimal.
 */
function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Convierte transacciones de puntos en matriz 4×7 (28 días) de actividad.
 * Cuenta CUALQUIER movimiento (gain o redeem) en el día.
 */
function computeActivityHeat(txs: LoyaltyTransaction[]): number[][] {
  const matrix: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startMs = now.getTime() - 27 * 24 * 60 * 60 * 1000;
  for (const t of txs) {
    const d = new Date(t.createdAt);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (d.getTime() - startMs) / (24 * 60 * 60 * 1000),
    );
    if (diffDays < 0 || diffDays > 27) continue;
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    matrix[week][day] = (matrix[week][day] ?? 0) + 1;
  }
  return matrix;
}

/* ── Tier Ring (SVG) ────────────────────────────────────────────── */

function TierRing({
  tierName,
  totalSpent,
  tiers,
}: {
  tierName: string;
  totalSpent: number;
  tiers: { name: string; minSpent: number }[];
}) {
  const meta = TIER_META[tierName] ?? TIER_META.bronce;
  const currentIdx = tiers.findIndex((t) => t.name === tierName);
  const current = tiers[currentIdx] ?? tiers[0];
  const next = tiers[currentIdx + 1];
  const progress = next
    ? Math.min(
        1,
        (totalSpent - current.minSpent) /
          (next.minSpent - current.minSpent || 1),
      )
    : 1;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="var(--color-card-border)"
              strokeWidth="6"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={meta.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 800ms ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <meta.Icon
              className="h-7 w-7"
              style={{ color: meta.color }}
              strokeWidth={2.25}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Tu nivel
          </p>
          <p
            className="text-xl font-extrabold leading-tight"
            style={{ color: meta.color }}
          >
            {meta.label}
          </p>
          <p className="text-xs text-muted mt-1">
            {next ? (
              <>
                {fmtSoles(Math.max(0, next.minSpent - totalSpent))} para{" "}
                <span
                  style={{
                    color:
                      TIER_META[next.name]?.color ?? "var(--text-primary)",
                  }}
                  className="font-bold"
                >
                  {TIER_META[next.name]?.label ?? next.name}
                </span>
              </>
            ) : (
              <span className="font-bold" style={{ color: meta.color }}>
                Nivel máximo alcanzado
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Heat Map ──────────────────────────────────────────────────── */

function HeatMap({ txs }: { txs: LoyaltyTransaction[] }) {
  const matrix = useMemo(() => computeActivityHeat(txs), [txs]);
  const max = Math.max(1, ...matrix.flat());

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Tu actividad
        </p>
        <span className="text-xs text-muted">28 días</span>
      </div>
      <div className="flex flex-col gap-1">
        {matrix.map((week, wIdx) => (
          <div key={wIdx} className="flex gap-1">
            {week.map((count, dIdx) => {
              const intensity = count / max;
              return (
                <div
                  key={dIdx}
                  className="flex-1 aspect-square rounded-md"
                  style={{
                    background:
                      count === 0
                        ? "var(--color-card-border)"
                        : `color-mix(in oklch, var(--color-primary, #00A0A0) ${Math.round(intensity * 80) + 20}%, transparent)`,
                  }}
                  title={`${count} movimiento${count === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted">
        <span>Menos</span>
        <div className="flex gap-1">
          {[0.2, 0.4, 0.6, 0.8, 1].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{
                background: `color-mix(in oklch, var(--color-primary, #00A0A0) ${Math.round(i * 80) + 20}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>Más</span>
      </div>
    </div>
  );
}

/* ── Cómo ganás puntos (info card) ─────────────────────────────── */

function HowToEarn() {
  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00A0A0) 12%, var(--color-card)) 0%, var(--color-card) 100%)",
        border:
          "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 28%, transparent)",
      }}
    >
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={2.25} />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Cómo ganás puntos
          </p>
        </div>
        <ul className="space-y-2.5 text-sm text-muted">
          <li className="flex items-start gap-2">
            <ShoppingCart
              className="h-4 w-4 shrink-0 mt-0.5 text-primary"
              strokeWidth={2.25}
            />
            <span>
              <span className="font-bold text-[var(--text-primary)]">1 punto</span> por cada
              S/ 1 gastado
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Gift
              className="h-4 w-4 shrink-0 mt-0.5 text-primary"
              strokeWidth={2.25}
            />
            <span>
              <span className="font-bold text-[var(--text-primary)]">+50 pts</span> por
              referido que pida
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Trophy
              className="h-4 w-4 shrink-0 mt-0.5 text-primary"
              strokeWidth={2.25}
            />
            <span>Subí de nivel y desbloqueá descuentos auto</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ── Reward Card (recompensa canjeable) ────────────────────────── */

function RewardCard({
  reward,
  available,
  onRedeem,
}: {
  reward: Reward;
  available: number;
  onRedeem: (r: Reward) => void;
}) {
  const canRedeem = available >= reward.pointsCost;
  const progress = Math.min(100, (available / reward.pointsCost) * 100);

  return (
    <div
      className={cn(
        "rounded-3xl p-5 transition-all relative overflow-hidden",
        canRedeem && "hover:-translate-y-0.5",
      )}
      style={{
        background: "var(--color-card)",
        border: canRedeem
          ? "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)"
          : "1px solid var(--color-card-border)",
        boxShadow: canRedeem
          ? "0 8px 20px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 30%, transparent)"
          : undefined,
        opacity: canRedeem ? 1 : 0.85,
      }}
    >
      {canRedeem && (
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background:
              "linear-gradient(90deg, var(--color-primary, #00A0A0) 0%, var(--accent) 100%)",
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: canRedeem
              ? "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)"
              : "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
          }}
        >
          <Gift
            className="h-5 w-5"
            style={{
              color: canRedeem ? "white" : "var(--color-primary, #00A0A0)",
            }}
            strokeWidth={2.5}
          />
        </div>
        <div
          className="text-right shrink-0 px-3 py-1 rounded-full text-xs font-extrabold tabular-nums"
          style={{
            background: canRedeem
              ? "color-mix(in oklch, var(--color-primary, #00A0A0) 16%, transparent)"
              : "var(--color-card-border)",
            color: canRedeem ? "var(--color-primary-dark, #009690)" : "var(--color-muted)",
          }}
        >
          {fmtPoints(reward.pointsCost)} pts
        </div>
      </div>
      <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight mb-1">
        {reward.name}
      </h3>
      <p className="text-sm text-muted line-clamp-2 mb-4">
        {reward.description}
      </p>

      {!canRedeem && (
        <div className="mb-3">
          <div className="relative h-2 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full transition-all duration-[var(--dur-slower)]"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--color-primary, #00A0A0) 0%, var(--accent) 100%)",
              }}
            />
          </div>
          <p className="text-xs text-muted mt-2 font-bold">
            Te faltan {fmtPoints(reward.pointsCost - available)} pts
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!canRedeem}
        onClick={() => canRedeem && onRedeem(reward)}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-extrabold transition-all",
          canRedeem
            ? "text-white hover:-translate-y-0.5 active:scale-[0.98]"
            : "cursor-not-allowed",
        )}
        style={
          canRedeem
            ? {
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                boxShadow:
                  "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
              }
            : {
                background: "var(--color-card-border)",
                color: "var(--color-muted)",
              }
        }
      >
        {canRedeem ? (
          <>
            <Sparkles className="h-4 w-4" strokeWidth={2.5} />
            Canjear ahora
          </>
        ) : (
          <>
            <Tag className="h-4 w-4" strokeWidth={2.25} />
            Bloqueado
          </>
        )}
      </button>
    </div>
  );
}

/* ── Transaction row ──────────────────────────────────────────── */

function TransactionRow({ tx }: { tx: LoyaltyTransaction }) {
  const isGain = tx.amount > 0;
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-2xl transition-colors"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: isGain
            ? "color-mix(in oklch, var(--data-success-500) 14%, transparent)"
            : "color-mix(in oklch, var(--data-warning-500) 14%, transparent)",
        }}
      >
        {isGain ? (
          <TrendingUp
            className="h-5 w-5"
            style={{ color: "var(--data-success-500)" }}
            strokeWidth={2.5}
          />
        ) : (
          <TrendingDown
            className="h-5 w-5"
            style={{ color: "var(--data-warning-500)" }}
            strokeWidth={2.5}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
          {tx.reason}
        </p>
        <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
          <Clock className="h-3 w-3" strokeWidth={2.25} />
          {fmtRelative(tx.createdAt)} · {fmtDate(tx.createdAt)}
        </p>
      </div>
      <p
        className="text-base font-extrabold tabular-nums shrink-0"
        style={{
          color: isGain ? "var(--data-success-500)" : "var(--data-warning-600)",
        }}
      >
        {isGain ? "+" : ""}
        {fmtPoints(tx.amount)}
      </p>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */

export default function PuntosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();

  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const loadData = useCallback(async (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 6) return;
    setLoading(true);
    setError("");
    setNeedsLogin(false);
    try {
      // Pre-check session: evita 401 ruidoso si la cookie expiró.
      const authRes = await fetch("/api/auth/customer/me", {
        credentials: "include",
        cache: "no-store",
      });
      const authData = authRes.ok ? await authRes.json() : null;
      if (!authData?.authenticated) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }

      const [loyaltyRes, rewardsRes, historyRes] = await Promise.all([
        fetch(`/api/loyalty/${encodeURIComponent(clean)}`, {
          credentials: "include",
        }),
        fetch("/api/loyalty/redeem"),
        fetch(
          `/api/loyalty/${encodeURIComponent(clean)}/history?limit=20`,
          { credentials: "include" },
        ),
      ]);
      if (loyaltyRes.status === 401 || loyaltyRes.status === 403) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }
      if (loyaltyRes.ok) {
        const data: LoyaltyData = await loyaltyRes.json();
        startTransition(() => setLoyalty(data));
      }
      if (rewardsRes.ok) {
        const data: Reward[] = await rewardsRes.json();
        startTransition(() => setRewards(data));
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        startTransition(() => {
          setTransactions(data.transactions ?? []);
          setTxTotal(data.total ?? 0);
        });
      }
    } catch {
      setError("No pudimos cargar tus puntos. Intentá de nuevo.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (customer?.phone) {
      loadData(customer.phone);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.phone]);

  useEffect(() => {
    if (!customer?.phone && !loading) {
      const t = setTimeout(() => openCustomerModal("profile"), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRedeem = useCallback(
    async (reward: Reward) => {
      if (!customer?.phone) return;
      const clean = customer.phone.replace(/\D/g, "");
      setRedeeming(reward.id);
      try {
        const res = await fetch("/api/loyalty/redeem", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ phone: clean, rewardId: reward.id }),
        });
        if (res.ok) {
          // Reload data to reflect new balance
          await loadData(customer.phone);
        }
      } catch {
        /* silent — UI ya muestra estado */
      } finally {
        setRedeeming(null);
      }
    },
    [customer, loadData],
  );

  /* ── Derived ─────────────────────────────────────────────────── */

  const tier = loyalty?.loyaltyTier ?? "bronce";
  const tierMeta = TIER_META[tier] ?? TIER_META.bronce;
  const points = loyalty?.loyaltyPoints ?? 0;
  const totalSpent = toNum(loyalty?.totalSpent);
  const tiers = loyalty?.tiers ?? DEFAULT_TIERS;
  const currentTierIdx = tiers.findIndex((t) => t.name === tier);
  const nextTier = tiers[currentTierIdx + 1];

  // Estadísticas de transacciones
  const totalGained = transactions
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const totalRedeemed = transactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  // Equivalencia aproximada: 100 puntos = S/ 1 (config típica del sistema)
  const pointsAsSoles = points / 100;

  // Recompensa más cercana a desbloquear
  const nearestReward = useMemo(() => {
    const locked = rewards.filter((r) => r.pointsCost > points);
    if (locked.length === 0) return null;
    return locked.reduce((min, r) =>
      r.pointsCost - points < min.pointsCost - points ? r : min,
    );
  }, [rewards, points]);

  /* ── Render: not logged in ──────────────────────────────────── */

  if (needsLogin) {
    return (
      <div
        className="min-h-screen dark:bg-background"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--surface-canvas, #f9fafb))",
        }}
      >
        <main className="max-w-md mx-auto px-4 sm:px-6 pt-32 pb-28">
          <div
            className="rounded-3xl p-8 text-center space-y-5"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-card-border)",
            }}
          >
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
              <Award
                className="h-10 w-10 text-primary/60"
                strokeWidth={1.75}
              />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[var(--text-primary)]">
                Identificate para ver tus puntos
              </h2>
              <p className="text-base text-muted mt-2 leading-relaxed">
                Iniciá sesión con tu teléfono para acceder a tu programa de
                fidelidad.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCustomerModal("profile")}
              className="w-full h-12 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
            >
              Iniciar sesión
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ── Render: main page ──────────────────────────────────────── */

  return (
    <div
      className="min-h-screen dark:bg-background"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--surface-canvas, #f9fafb))",
      }}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Mis puntos", url: "https://www.buleje.pe/puntos" },
        ]}
      />

      {/* ── Hero compacto ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-28 sm:pt-32 pb-8"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 h-80 w-80 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end gap-4 flex-wrap">
            <Link
              href="/mi-panel"
              className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors text-white shrink-0 border border-white/20"
              aria-label="Volver a mi cuenta"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85 mb-1">
                <Award className="h-3.5 w-3.5" strokeWidth={2.5} />
                Programa de fidelidad
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
                Tus puntos Buleje
              </h1>
            </div>

            {!loading && customer?.phone && (
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.32)",
                  }}
                >
                  <Sparkles
                    className="h-4 w-4 text-white"
                    strokeWidth={2.5}
                  />
                  <div>
                    <p className="text-base font-extrabold text-white tabular-nums leading-none">
                      {fmtPoints(points)}
                    </p>
                    <p className="text-xs text-white/85 font-bold">
                      Disponibles
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <Tag className="h-4 w-4 text-white" strokeWidth={2.5} />
                  <div>
                    <p className="text-base font-extrabold text-white tabular-nums leading-none">
                      {fmtSoles(pointsAsSoles)}
                    </p>
                    <p className="text-xs text-white/75 font-bold">
                      Equivalente
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm capitalize"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <tierMeta.Icon
                    className="h-4 w-4 text-white"
                    strokeWidth={2.5}
                  />
                  <div>
                    <p className="text-base font-extrabold text-white leading-none">
                      {tierMeta.label}
                    </p>
                    <p className="text-xs text-white/75 font-bold">
                      Tu nivel
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────── */}
      <main
        id="main-content"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-28"
      >
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="h-10 w-10 text-primary animate-spin"
              strokeWidth={2.25}
            />
          </div>
        )}

        {!loading && error && (
          <div
            className="rounded-3xl p-6 max-w-md mx-auto text-center"
            style={{
              background:
                "color-mix(in oklch, var(--data-error-500) 8%, var(--color-card))",
              border:
                "1px solid color-mix(in oklch, var(--data-error-500) 28%, transparent)",
            }}
          >
            <p className="text-base font-bold text-[var(--data-error-600)]">
              {error}
            </p>
            <button
              type="button"
              onClick={() => customer?.phone && loadData(customer.phone)}
              className="mt-4 h-11 px-5 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* ─── SIDEBAR ─────────────────────────────────── */}
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
              <TierRing
                tierName={tier}
                totalSpent={totalSpent}
                tiers={tiers as { name: string; minSpent: number }[]}
              />

              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-2xl p-3 text-center"
                  style={{
                    background:
                      "color-mix(in oklch, var(--data-success-500) 8%, var(--color-card))",
                    border:
                      "1px solid color-mix(in oklch, var(--data-success-500) 22%, transparent)",
                  }}
                >
                  <p className="text-xs font-bold uppercase text-muted">
                    Ganados
                  </p>
                  <p
                    className="text-lg font-extrabold tabular-nums leading-tight mt-1"
                    style={{ color: "var(--data-success-500)" }}
                  >
                    +{fmtPoints(totalGained)}
                  </p>
                </div>
                <div
                  className="rounded-2xl p-3 text-center"
                  style={{
                    background:
                      "color-mix(in oklch, var(--data-warning-500) 8%, var(--color-card))",
                    border:
                      "1px solid color-mix(in oklch, var(--data-warning-500) 22%, transparent)",
                  }}
                >
                  <p className="text-xs font-bold uppercase text-muted">
                    Canjeados
                  </p>
                  <p
                    className="text-lg font-extrabold tabular-nums leading-tight mt-1"
                    style={{ color: "var(--data-warning-600)" }}
                  >
                    -{fmtPoints(totalRedeemed)}
                  </p>
                </div>
              </div>

              <HowToEarn />

              {transactions.length > 0 && <HeatMap txs={transactions} />}

              {/* CTA Comprar más */}
              <Link
                href="/tienda"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-extrabold transition-all hover:-translate-y-0.5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                  color: "white",
                  boxShadow:
                    "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
                }}
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.5} />
                Sumá puntos comprando
              </Link>
            </aside>

            {/* ─── MAIN ───────────────────────────────────── */}
            <div className="space-y-8 min-w-0">
              {/* Hero card: progreso al próximo tier */}
              {nextTier && (
                <section
                  className="rounded-3xl p-6 relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00A0A0) 14%, var(--color-card)) 0%, var(--color-card) 100%)",
                    border:
                      "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)",
                  }}
                >
                  <div
                    className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00A0A0) 14%, transparent)",
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy
                        className="h-5 w-5 text-primary"
                        strokeWidth={2.5}
                      />
                      <h2 className="text-base font-extrabold uppercase tracking-wider text-primary">
                        Camino a{" "}
                        {TIER_META[nextTier.name]?.label ?? nextTier.name}
                      </h2>
                    </div>
                    <p className="text-base text-muted leading-relaxed mb-4">
                      Te faltan{" "}
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {fmtSoles(Math.max(0, nextTier.minSpent - totalSpent))}
                      </span>{" "}
                      en compras para subir a{" "}
                      <span
                        className="font-extrabold capitalize"
                        style={{
                          color:
                            TIER_META[nextTier.name]?.color ??
                            "var(--text-primary)",
                        }}
                      >
                        {TIER_META[nextTier.name]?.label ?? nextTier.name}
                      </span>
                      .
                    </p>
                    <div className="relative h-3 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full transition-all duration-[var(--dur-slower)]"
                        style={{
                          width: `${Math.min(100, (totalSpent / nextTier.minSpent) * 100)}%`,
                          background:
                            "linear-gradient(90deg, var(--color-primary, #00A0A0) 0%, var(--accent) 100%)",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs font-bold text-muted">
                      <span className="tabular-nums">
                        {fmtSoles(totalSpent)}
                      </span>
                      <span className="tabular-nums">
                        {fmtSoles(nextTier.minSpent)}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Recompensa más cercana (si está bloqueada) */}
              {nearestReward && (
                <section
                  className="rounded-3xl p-5 relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in oklch, var(--accent) 12%, var(--color-card)) 0%, var(--color-card) 100%)",
                    border:
                      "1px solid color-mix(in oklch, var(--accent) 28%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
                      }}
                    >
                      <Gift
                        className="h-6 w-6 text-white"
                        strokeWidth={2.25}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-dark)] dark:text-[var(--accent)]">
                        Cerca de desbloquearse
                      </p>
                      <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                        {nearestReward.name}
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        Te faltan{" "}
                        <span className="font-extrabold text-[var(--text-primary)]">
                          {fmtPoints(nearestReward.pointsCost - points)} pts
                        </span>
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Recompensas */}
              {rewards.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                      <Gift
                        className="h-5 w-5 text-primary"
                        strokeWidth={2.5}
                      />
                      Recompensas
                    </h2>
                    <span className="text-sm text-muted font-bold">
                      {rewards.filter((r) => r.pointsCost <= points).length}{" "}
                      disponibles
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {rewards.map((r) => (
                      <RewardCard
                        key={r.id}
                        reward={r}
                        available={points}
                        onRedeem={handleRedeem}
                      />
                    ))}
                  </div>
                  {redeeming && (
                    <p className="text-sm text-muted text-center mt-4 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Canjeando...
                    </p>
                  )}
                </section>
              )}

              {/* Historial */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                    <Clock
                      className="h-5 w-5 text-primary"
                      strokeWidth={2.5}
                    />
                    Historial de movimientos
                  </h2>
                  <span className="text-sm text-muted font-bold">
                    {txTotal > 0
                      ? `${txTotal} total`
                      : `${transactions.length}`}
                  </span>
                </div>
                {transactions.length === 0 ? (
                  <div
                    className="rounded-3xl p-8 text-center"
                    style={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-card-border)",
                    }}
                  >
                    <Sparkles
                      className="h-12 w-12 text-primary/40 mx-auto mb-3"
                      strokeWidth={1.75}
                    />
                    <p className="text-base font-bold text-[var(--text-primary)]">
                      Aún no tenés movimientos
                    </p>
                    <p className="text-sm text-muted mt-1">
                      Hacé tu primer pedido y empezá a sumar puntos.
                    </p>
                    <Link
                      href="/tienda"
                      className="inline-flex items-center gap-2 mt-4 px-5 h-11 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors"
                    >
                      <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
                      Ir a la tienda
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
