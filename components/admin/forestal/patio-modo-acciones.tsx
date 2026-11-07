"use client";

/**
 * Un botón grande del modo patio que abre una pantalla entera («Contar el
 * patio», «Medir escaneando», «Armar lotes escaneando»): ícono, qué hace y
 * una línea con el detalle. Los tres eran el mismo bloque copiado.
 */

import { ChevronRight, type LucideIcon } from "@buleje/design-system/icons";

export default function AccionDelPatio({
  icono: Icono,
  titulo,
  detalle,
  onClick,
  ...data
}: {
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  onClick: () => void;
} & { [k: `data-${string}`]: boolean | string | undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
      {...data}
    >
      <Icono className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-[var(--text-primary)]">{titulo}</span>
        <span className="block text-base text-[var(--text-secondary)]">{detalle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
    </button>
  );
}
