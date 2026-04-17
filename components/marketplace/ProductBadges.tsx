import {
  Flame,
  Sparkles,
  AlertTriangle,
  BadgeCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface BadgeDetails {
  lowStock?: number;
}

interface ProductBadgesProps {
  badges: string[];
  details?: BadgeDetails;
}

type BadgeIntent = "accent" | "muted" | "warning" | "success" | "neutral";

const INTENT_CLS: Record<BadgeIntent, string> = {
  accent:
    "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white",
  muted:
    "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800",
  warning:
    "bg-white dark:bg-gray-900 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  success:
    "bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  neutral:
    "bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800",
};

const BADGE_MAP: Record<string, { label: string; Icon: LucideIcon; intent: BadgeIntent }> = {
  "best-seller": { label: "Más vendido", Icon: Flame, intent: "accent" },
  new: { label: "Nuevo", Icon: Sparkles, intent: "muted" },
  "low-stock": { label: "Solo {count}", Icon: AlertTriangle, intent: "warning" },
  verified: { label: "Verificado", Icon: BadgeCheck, intent: "success" },
  "fast-shipping": { label: "Envío rápido", Icon: Truck, intent: "neutral" },
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
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-bold border ${INTENT_CLS[config.intent]}`}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </div>
  );
}
