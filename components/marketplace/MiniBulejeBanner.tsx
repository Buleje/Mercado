"use client";

/**
 * MiniBulejeBanner — placeholder visual para cards de tienda sin banner/logo.
 *
 * Rediseño 2026-05-26 (editorial limpio):
 *   - Fondo neutro var(--surface-sunken) — sin gradiente teal saturado.
 *   - Inicial grande centrada en texto primario.
 *   - Icono Store pequeño arriba-izquierda como wordmark discreto.
 *   - Sin imágenes externas — 100% CSS inline. Carga instantánea.
 */

import { Store } from "@buleje/design-system/icons";

export default function MiniBulejeBanner({
  storeName,
  category: _category,
}: {
  storeName: string;
  category?: string | null;
}) {
  const initial = storeName.trim().charAt(0).toUpperCase();

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center"
      aria-hidden
    >
      {/* Icono discreto arriba-izquierda */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Store className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[0.28em] opacity-70">
          Tienda
        </span>
      </div>

      {/* Inicial centrada */}
      <span
        className="text-7xl font-black tracking-[-0.04em] text-[var(--text-tertiary)] opacity-20 select-none"
        aria-hidden
      >
        {initial}
      </span>
    </div>
  );
}
