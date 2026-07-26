"use client";

/**
 * StoreTierControls — control + previsualización del nivel de visibilidad de
 * una tienda en /tiendas (beneficio por plan, gestionado por superadmin).
 *
 *   - TierLegend:   3 mini-mockups que muestran CÓMO se verá cada nivel en
 *                   /tiendas (la "previsualización" que pidió Brandon).
 *   - TierSelector: control segmentado por fila (Estándar/Destacada/Premium).
 */

import { Star } from "@buleje/design-system/icons";

export type DisplayTier = "standard" | "featured" | "premium";

export const TIER_OPTS: { key: DisplayTier; label: string; desc: string }[] = [
  { key: "standard", label: "Estándar", desc: "Card normal en la grilla." },
  { key: "featured", label: "Destacada", desc: "Card más grande + badge + sube en el orden." },
  { key: "premium", label: "Premium", desc: "Fila completa + preview de productos + tope." },
];

/* ── Mini-mockups (previsualización) ──────────────────────────────────────── */

function MockStandard() {
  return (
    <div className="w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
      <div className="aspect-[4/3] w-full rounded-md bg-[var(--surface-sunken)]" />
      <div className="mt-1.5 h-2 w-3/4 rounded-full bg-[var(--text-tertiary)]/30" />
      <div className="mt-1 h-1.5 w-1/2 rounded-full bg-[var(--text-tertiary)]/20" />
    </div>
  );
}

function MockFeatured() {
  return (
    <div className="relative w-full rounded-lg border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-2 shadow-[0_4px_16px_-6px_var(--accent)]">
      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
        <Star className="h-2 w-2 fill-current" aria-hidden /> Dest.
      </span>
      <div className="aspect-[4/3] w-full rounded-md bg-primary/10" />
      <div className="mt-1.5 h-2 w-3/4 rounded-full bg-[var(--text-tertiary)]/40" />
      <div className="mt-1 h-1.5 w-1/2 rounded-full bg-[var(--text-tertiary)]/25" />
    </div>
  );
}

function MockPremium() {
  return (
    <div className="relative w-full rounded-lg border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-2 shadow-[0_6px_20px_-6px_var(--accent)]">
      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
        <Star className="h-2 w-2 fill-current" aria-hidden /> Premium
      </span>
      <div className="flex gap-2">
        <div className="h-12 w-12 shrink-0 rounded-lg bg-primary/10" />
        <div className="min-w-0 flex-1">
          <div className="h-2 w-2/3 rounded-full bg-[var(--text-tertiary)]/40" />
          <div className="mt-1 h-1.5 w-1/3 rounded-full bg-[var(--text-tertiary)]/25" />
          {/* preview de productos */}
          <div className="mt-1.5 flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-6 rounded bg-[var(--surface-sunken)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCKS: Record<DisplayTier, () => React.JSX.Element> = {
  standard: MockStandard,
  featured: MockFeatured,
  premium: MockPremium,
};

/** Leyenda con los 3 mockups — "así se verá en /tiendas". */
export function TierLegend() {
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
      <p className="text-sm font-extrabold text-[var(--text-primary)]">
        Niveles de visibilidad en <span className="text-[var(--accent)]">/tiendas</span>
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
        Así se verá la tienda según el nivel que le asignes. Ideal para premiar planes más altos.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {TIER_OPTS.map((t) => {
          const Mock = MOCKS[t.key];
          return (
            <div key={t.key} className="min-w-0">
              <Mock />
              <p className="mt-2 text-xs font-bold text-[var(--text-primary)]">{t.label}</p>
              <p className="text-xs leading-tight text-[var(--text-tertiary)]">{t.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Selector segmentado por fila. */
export function TierSelector({
  value,
  onChange,
  busy = false,
  size = "sm",
}: {
  value: DisplayTier;
  onChange: (tier: DisplayTier) => void;
  busy?: boolean;
  size?: "sm" | "md";
}) {
  const pad = size === "md" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-xs";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
      {TIER_OPTS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!busy && !active) onChange(t.key);
            }}
            disabled={busy}
            title={t.desc}
            className={`rounded-lg font-bold transition-colors disabled:opacity-40 ${pad} ${
              active
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-primary/10"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
