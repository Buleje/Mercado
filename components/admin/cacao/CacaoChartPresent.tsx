"use client";

/**
 * CacaoChartPresent — botón "vista completa" para los charts del módulo cacao.
 * Aparece al hover del card (el contenedor necesita `group`). El modal de
 * presentación compartido vive en CacaoNoticiero, que navega entre los 3
 * charts de la vista Mercado (flechas ← → / modo TV, como el dashboard inicio).
 */
import { Maximize2 } from "@buleje/design-system/icons";

export default function CacaoChartPresent({
  title,
  onClick,
  className = "",
}: {
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver "${title}" en vista completa`}
      title="Vista completa (presentación)"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-0 transition-all hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100 ${className}`}
    >
      <Maximize2 className="h-4 w-4" />
    </button>
  );
}
