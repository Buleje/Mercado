import Link from "next/link";
import { ShoppingBag, ArrowRight } from "@buleje/design-system/icons";

interface Props {
  /** Optional eyebrow shown above the title */
  eyebrow?: string;
  /** Title — defaults to a friendly catch-all */
  title?: string;
  /** Body — defaults to a Pucallpa-flavored fallback */
  description?: string;
  /** Optional CTA. Defaults to /marketplace/explorar */
  cta?: { label: string; href: string };
  /** Compact variant for sections that already have a header */
  compact?: boolean;
}

/**
 * Empty state for marketplace home sections that have no data to render
 * (no products in the category yet, fetch failed, etc.). Replaces the
 * silent `return null` that left skeletons spinning forever.
 *
 * Used by MarketplaceTopToday, MarketplaceJungleProducts, CatalogSections,
 * OfertasFlashSection. Designed to feel intentional, not broken.
 */
export default function MarketplaceEmptyState({
  eyebrow,
  title = "Aún estamos cargando esta sección",
  description = "Mientras tanto, podés explorar el catálogo completo del marketplace.",
  cta = { label: "Explorar marketplace", href: "/marketplace/explorar" },
  compact = false,
}: Props) {
  return (
    <div
      className={[
        "rounded-2xl border-2 border-dashed border-[var(--rule-soft)] bg-[var(--surface-canvas)]",
        compact ? "px-5 py-6" : "px-6 py-10",
        "flex flex-col items-center text-center gap-3",
      ].join(" ")}
    >
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
        <ShoppingBag className="h-6 w-6" strokeWidth={1.75} />
      </div>

      {eyebrow && (
        <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {eyebrow}
        </p>
      )}

      <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] max-w-sm">
        {title}
      </h3>

      <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
        {description}
      </p>

      <Link
        href={cta.href}
        className="mt-1 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        {cta.label}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </div>
  );
}
