import {
  Flame,
  Sparkles,
  AlertTriangle,
  BadgeCheck,
  Truck,
  Star,
  type LucideIcon,
} from "lucide-react";

interface BadgeDetails {
  lowStock?: number;
}

interface ProductBadgesProps {
  badges: string[];
  details?: BadgeDetails;
}

type BadgeIntent = "discount" | "trending" | "new" | "urgency" | "shipping" | "verified" | "neutral";

/**
 * Tokens semánticos contrastados (definidos en globals.css).
 * Cada intent usa un par bg/text consistente — alto contraste para llamar
 * la atención sin saturar.
 */
const INTENT_CLS: Record<BadgeIntent, string> = {
  discount:
    "bg-[var(--badge-discount-bg)] text-[var(--badge-discount-text)] border-transparent",
  trending:
    "bg-[var(--badge-trending-bg)] text-[var(--badge-trending-text)] border-transparent",
  new:
    "bg-[var(--badge-new-bg)] text-[var(--badge-new-text)] border-transparent",
  urgency:
    "bg-[var(--badge-urgency-bg)] text-[var(--badge-urgency-text)] border-transparent",
  shipping:
    "bg-[var(--badge-shipping-bg)] text-[var(--badge-shipping-text)] border-transparent",
  verified:
    "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent",
  neutral:
    "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-soft)]",
};

const BADGE_MAP: Record<string, { label: string; Icon: LucideIcon; intent: BadgeIntent }> = {
  "best-seller": { label: "Más vendido", Icon: Flame, intent: "trending" },
  new: { label: "Nuevo", Icon: Sparkles, intent: "new" },
  "low-stock": { label: "Solo {count}", Icon: AlertTriangle, intent: "urgency" },
  verified: { label: "Verificado", Icon: BadgeCheck, intent: "verified" },
  "fast-shipping": { label: "Envío rápido", Icon: Truck, intent: "shipping" },
  featured: { label: "Destacado", Icon: Star, intent: "trending" },
};

export default function ProductBadges({ badges, details }: ProductBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => {
        const config = BADGE_MAP[badge];
        if (!config) return null;

        const label =
          badge === "low-stock"
            ? config.label.replace("{count}", String(details?.lowStock ?? "pocos"))
            : config.label;

        const Icon = config.Icon;

        return (
          <span
            key={badge}
            title={label}
            className={`inline-flex items-center gap-1 text-[length:var(--ts-2xs)] uppercase tracking-wide px-2 py-0.5 rounded-full font-bold border ${INTENT_CLS[config.intent]}`}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </div>
  );
}
