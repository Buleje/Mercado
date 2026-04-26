import { CheckCircle, ShoppingBag, Calendar, Clock } from "@buleje/design-system/icons";

export interface VendorTrustBadgesProps {
  verified?: boolean;
  totalSales?: number | null;
  createdYear?: number | null;
  avgResponseMinutes?: number | null;
}

interface BadgeChipProps {
  icon: React.ReactNode;
  label: string;
}

function BadgeChip({ icon, label }: BadgeChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)]">
      {icon}
      {label}
    </span>
  );
}

/**
 * VendorTrustBadges — fila de chips de confianza para el hero de tienda.
 *
 * Renderiza solo los badges con datos disponibles. Si no hay ningún dato
 * conocido el componente retorna null (sin espacio vacío).
 *
 * Se ubica debajo del hero principal de la landing `/t/[slug]`.
 */
export default function VendorTrustBadges({
  verified = true,
  totalSales,
  createdYear,
  avgResponseMinutes,
}: VendorTrustBadgesProps) {
  const badges: React.ReactNode[] = [];

  if (verified) {
    badges.push(
      <BadgeChip
        key="verified"
        icon={
          <CheckCircle
            className="h-3.5 w-3.5 text-[var(--accent-primary,#2d6a4f)]"
            aria-hidden="true"
          />
        }
        label="Verificado"
      />,
    );
  }

  if (typeof totalSales === "number" && totalSales > 0) {
    const formatted =
      totalSales >= 1000
        ? `+${Math.floor(totalSales / 1000)}k ventas`
        : `+${totalSales} ventas`;
    badges.push(
      <BadgeChip
        key="sales"
        icon={
          <ShoppingBag
            className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        }
        label={formatted}
      />,
    );
  }

  if (typeof createdYear === "number" && createdYear > 0) {
    badges.push(
      <BadgeChip
        key="year"
        icon={
          <Calendar
            className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        }
        label={`Desde ${createdYear}`}
      />,
    );
  }

  if (typeof avgResponseMinutes === "number" && avgResponseMinutes > 0) {
    const label =
      avgResponseMinutes < 60
        ? `Responde en ${avgResponseMinutes} min`
        : `Responde en ${Math.round(avgResponseMinutes / 60)} h`;
    badges.push(
      <BadgeChip
        key="response"
        icon={
          <Clock
            className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        }
        label={label}
      />,
    );
  }

  if (badges.length === 0) return null;

  return (
    <div
      className="max-w-3xl mx-auto px-4 py-4 flex flex-wrap justify-center gap-2"
      aria-label="Credenciales del vendedor"
    >
      {badges}
    </div>
  );
}
