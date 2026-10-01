"use client";

/**
 * SocioTierBadge — Badge visual para tiers del Socio Buleje.
 *
 * Tiers:
 *   - bronce (S/ 0-500 gastado): Medal gris
 *   - plata (S/ 500-2000): Medal plateado
 *   - oro (S/ 2000-5000): Medal dorado
 *   - diamante (S/ 5000+): Gem morado
 *
 * Variantes:
 *   - compact: solo ícono (h-6 w-6)
 *   - chip: pill con icon + nombre
 *   - card: card grande con tier + % al próximo + beneficios
 */

import { Medal, Sparkles, Crown, Award, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type SocioTier = "bronce" | "plata" | "oro" | "diamante";

/** Orden de progresión de tiers (para la escalera visual). */
const TIER_ORDER: readonly SocioTier[] = ["bronce", "plata", "oro", "diamante"];

interface TierConfig {
  label: string;
  icon: typeof Medal;
  bgClass: string;
  textClass: string;
  borderClass: string;
  minSpent: number;
  maxSpent: number | null;
  benefits: string[];
}

export const TIER_CONFIG: Record<SocioTier, TierConfig> = {
  bronce: {
    label: "Bronce",
    icon: Medal,
    bgClass: "bg-[#c47b2d]/10",
    textClass: "text-[#a86821]",
    borderClass: "border-[#c47b2d]/30",
    minSpent: 0,
    maxSpent: 500,
    benefits: ["Puntos por cada compra", "Cupones semanales"],
  },
  plata: {
    label: "Plata",
    icon: Award,
    bgClass: "bg-[#8a8a8a]/10",
    textClass: "text-[#6b6b6b]",
    borderClass: "border-[#8a8a8a]/30",
    minSpent: 500,
    maxSpent: 2000,
    benefits: ["5% cashback", "Delivery gratis 3x/mes", "Ofertas exclusivas"],
  },
  oro: {
    label: "Oro",
    icon: Crown,
    bgClass: "bg-[#d4a017]/10",
    textClass: "text-[#b8860b]",
    borderClass: "border-[#d4a017]/40",
    minSpent: 2000,
    maxSpent: 5000,
    benefits: ["8% cashback", "Delivery gratis ilimitado", "Soporte VIP", "Early access ofertas"],
  },
  diamante: {
    label: "Diamante",
    icon: Sparkles,
    bgClass: "bg-[#7c3aed]/10",
    textClass: "text-[#6d28d9]",
    borderClass: "border-[#7c3aed]/40",
    minSpent: 5000,
    maxSpent: null,
    benefits: [
      "10% cashback",
      "Delivery gratis + prioritario",
      "Gerente personal por WhatsApp",
      "Regalos de cumpleaños",
      "Invitaciones a eventos",
    ],
  },
};

export function getTierFromSpent(totalSpent: number): SocioTier {
  if (totalSpent >= 5000) return "diamante";
  if (totalSpent >= 2000) return "oro";
  if (totalSpent >= 500) return "plata";
  return "bronce";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface CompactProps {
  tier: SocioTier;
  size?: number;
  className?: string;
}

export function SocioTierIcon({ tier, size = 20, className }: CompactProps) {
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border",
        cfg.bgClass,
        cfg.borderClass,
        className,
      )}
      style={{ width: size + 8, height: size + 8 }}
      aria-label={`Tier ${cfg.label}`}
    >
      <Icon className={cfg.textClass} strokeWidth={1.75} style={{ width: size, height: size }} />
    </span>
  );
}

interface ChipProps {
  tier: SocioTier;
  showLabel?: boolean;
  className?: string;
}

export function SocioTierChip({ tier, showLabel = true, className }: ChipProps) {
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold",
        cfg.bgClass,
        cfg.textClass,
        cfg.borderClass,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      {showLabel && `Socio ${cfg.label}`}
    </span>
  );
}

interface CardProps {
  totalSpent: number;
  className?: string;
}

export function SocioTierCard({ totalSpent, className }: CardProps) {
  const tier = getTierFromSpent(totalSpent);
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg.icon;
  const nextTier: SocioTier | null =
    tier === "bronce" ? "plata" : tier === "plata" ? "oro" : tier === "oro" ? "diamante" : null;
  const nextCfg = nextTier ? TIER_CONFIG[nextTier] : null;
  const progressPct = nextCfg
    ? Math.min(
        100,
        Math.round(((totalSpent - cfg.minSpent) / (nextCfg.minSpent - cfg.minSpent)) * 100),
      )
    : 100;
  const remainingToNext = nextCfg ? Math.max(0, nextCfg.minSpent - totalSpent) : 0;
  const currentIdx = TIER_ORDER.indexOf(tier);
  const ladderPct = TIER_ORDER.length > 1 ? currentIdx / (TIER_ORDER.length - 1) : 0;

  return (
    <section
      className={cn(
        "rounded-2xl border overflow-hidden",
        cfg.borderClass,
        cfg.bgClass,
        className,
      )}
      aria-label={`Tu tier: ${cfg.label}`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={cn(
              "inline-flex h-14 w-14 items-center justify-center rounded-full border-2 bg-[var(--surface-raised)]",
              cfg.borderClass,
            )}
          >
            <Icon className={cn("h-7 w-7", cfg.textClass)} strokeWidth={1.5} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Tu tier
            </p>
            <h3 className={cn("text-2xl font-extrabold tracking-tight", cfg.textClass)}>
              Socio {cfg.label}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Gastado: {fmt(totalSpent)}
            </p>
          </div>
        </div>

        {/* Escalera de tiers — progresión visual Bronce → Diamante */}
        <div className="mb-5">
          <div className="relative flex items-start justify-between">
            {/* Riel base + progreso */}
            <div aria-hidden className="absolute inset-x-5 top-5 h-0.5 rounded-full bg-[var(--rule-base)]" />
            <div
              aria-hidden
              className="absolute left-5 top-5 h-0.5 rounded-full bg-[var(--accent)] transition-all duration-700"
              style={{ width: `calc((100% - 2.5rem) * ${ladderPct})` }}
            />
            {TIER_ORDER.map((t, i) => {
              const tc = TIER_CONFIG[t];
              const TIcon = tc.icon;
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <div key={t} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-full border-2 transition-all",
                      active
                        ? cn(tc.borderClass, tc.bgClass, "scale-110 shadow-sm")
                        : done
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
                    )}
                  >
                    {done ? (
                      <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
                    ) : (
                      <TIcon className={cn("h-5 w-5", active && tc.textClass)} strokeWidth={1.75} aria-hidden />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-black uppercase tracking-[0.12em]",
                      active ? tc.textClass : done ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {tc.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {nextCfg && (
          <div className="mb-4">
            <div className="flex items-baseline justify-between mb-1.5 text-xs">
              <span className="font-bold text-[var(--text-secondary)]">
                Faltan {fmt(remainingToNext)} para {nextCfg.label}
              </span>
              <span className={cn("font-extrabold tabular-nums", cfg.textClass)}>
                {progressPct}%
              </span>
            </div>
            <div
              aria-hidden
              className="h-2 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden"
            >
              <div
                className={cn("h-full rounded-full transition-all duration-700", cfg.bgClass)}
                style={{ width: `${progressPct}%`, backgroundColor: "currentColor" }}
              />
            </div>
          </div>
        )}

        <div className="border-t border-[var(--rule-soft)] pt-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Tus beneficios
          </p>
          <ul className="space-y-1.5">
            {cfg.benefits.map((benefit) => (
              <li key={benefit} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                <span className={cn("mt-2 h-1 w-1 shrink-0 rounded-full", cfg.textClass)} aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
