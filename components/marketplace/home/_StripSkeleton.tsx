/**
 * StripSkeleton — placeholder visual mientras una sección below-the-fold
 * carga vía `next/dynamic`. Replica el aspect ratio de las strips reales
 * (header + carrusel horizontal de cards) para evitar layout shift.
 *
 * Convención Buleje:
 *   - bg-[var(--surface-raised)] match con BodegasSectionBox
 *   - shimmer sutil con bg-gradient + animate-pulse
 *   - aria-hidden (no anuncia al lector)
 *   - sin texto literal "Cargando..." (UX silenciosa)
 */

interface StripSkeletonProps {
  /** Altura aproximada de la strip real para que no haya CLS */
  height?: "sm" | "md" | "lg";
  /** Si la strip tiene grid de cards (ofertas, productos) o un hero (banner) */
  variant?: "carousel" | "grid" | "hero";
  /** Cantidad de cards a placeholder cuando variant=carousel|grid */
  cards?: number;
}

const HEIGHT_MAP = {
  sm: "h-[200px]",
  md: "h-[320px]",
  lg: "h-[460px]",
};

export function StripSkeleton({
  height = "md",
  variant = "carousel",
  cards = 4,
}: StripSkeletonProps) {
  if (variant === "hero") {
    return (
      <div
        aria-hidden="true"
        className={`${HEIGHT_MAP[height]} w-full rounded-2xl bg-gradient-to-br from-[var(--surface-sunken)] via-[var(--surface-raised)] to-[var(--surface-sunken)] animate-pulse`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="w-full rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5"
    >
      {/* Header skeleton: title + see-all link */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
          <div className="h-6 w-48 rounded-md bg-[var(--surface-sunken)] animate-pulse" />
        </div>
        <div className="h-4 w-20 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
      </div>

      {/* Cards row */}
      <div
        className={
          variant === "grid"
            ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            : "flex gap-3 overflow-hidden"
        }
      >
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className={
              (variant === "grid" ? "" : "min-w-[160px] flex-shrink-0 ") +
              `${HEIGHT_MAP[height]} rounded-xl bg-[var(--surface-sunken)] animate-pulse`
            }
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default StripSkeleton;
