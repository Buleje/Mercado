
import { Package, ShoppingBag, Sparkles } from "@buleje/design-system/icons";

/**
 * Elegant empty state for store sections without content.
 * Shows styled placeholder cards that match the marketplace card format.
 *
 * Variants:
 * - `admin` (default): hint orientado al dueno (ej: "Crea combos desde Mi Tienda").
 * - `public`: copy simple y directo para visitantes de la tienda
 *   ("No hay productos agregados todavía").
 */
export default function SectionPlaceholder({
  title,
  hint,
  cols = 4,
  icon: Icon = Package,
  variant = "admin",
  publicTitle,
}: {
  title: string;
  hint: string;
  cols?: number;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "admin" | "public";
  /** Optional override for the heading shown in public variant. */
  publicTitle?: string;
}) {
  const resolvedTitle = variant === "public" ? (publicTitle ?? title) : title;
  const resolvedHint =
    variant === "public"
      ? "No hay productos agregados todavía"
      : hint;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Section header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-3">
          <Icon className="w-3.5 h-3.5" />
          {resolvedTitle}
        </div>
        <p className="text-sm text-muted-foreground">{resolvedHint}</p>
      </div>

      {/* Placeholder cards grid — styled like marketplace cards */}
      <div
        className={`grid gap-3 sm:gap-4 ${
          cols >= 6
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        }`}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="group relative rounded-2xl bg-card border border-border/50 overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-md)]"
          >
            {/* Image placeholder */}
            <div className="relative aspect-square bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 opacity-40">
                <ShoppingBag className="h-8 w-8 text-gray-400" />
                {i === 0 && (
                  <Sparkles className="h-4 w-4 text-primary/50 absolute top-3 right-3" />
                )}
              </div>
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]" />
            </div>

            {/* Content placeholder */}
            <div className="p-3 sm:p-4 space-y-2.5">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-4/5" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/5" />
              <div className="flex items-center justify-between pt-1">
                <div className="h-5 bg-primary/10 rounded-lg w-20" />
                <div className="h-8 w-8 bg-primary/10 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
