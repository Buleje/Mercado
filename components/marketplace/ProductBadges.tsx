interface BadgeDetails {
  lowStock?: number;
}

interface ProductBadgesProps {
  badges: string[];
  details?: BadgeDetails;
}

const BADGE_MAP: Record<string, { label: string; icon: string; colorClass: string }> = {
  "best-seller": {
    label: "Mas vendido",
    icon: "🔥",
    colorClass: "bg-orange-500 text-white",
  },
  new: {
    label: "Nuevo",
    icon: "✨",
    colorClass: "bg-blue-500 text-white",
  },
  "low-stock": {
    label: "Solo {count}",
    icon: "⚠️",
    colorClass: "bg-red-500 text-white",
  },
  verified: {
    label: "Verificado",
    icon: "✓",
    colorClass: "bg-green-500 text-white",
  },
  "fast-shipping": {
    label: "Envio rapido",
    icon: "🚚",
    colorClass: "bg-purple-500 text-white",
  },
};

export default function ProductBadges({ badges, details }: ProductBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => {
        const config = BADGE_MAP[badge];
        if (!config) return null;

        const label =
          badge === "low-stock"
            ? config.label.replace("{count}", String(details?.lowStock ?? "pocos"))
            : config.label;

        return (
          <span
            key={badge}
            title={label}
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${config.colorClass}`}
          >
            <span aria-hidden="true">{config.icon}</span>
            {label}
          </span>
        );
      })}
    </div>
  );
}
