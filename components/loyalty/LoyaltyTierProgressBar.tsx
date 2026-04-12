"use client";

/**
 * ROADMAP ITEM #70 — Progress bar loyalty tier.
 *
 * Barra visual que muestra al cliente cuánto le falta para el próximo tier
 * (Bronce → Plata → Oro → Diamante). Se alimenta del balance de puntos.
 * No depende de ningún contexto — recibe todo por props.
 */

type Tier = "Bronce" | "Plata" | "Oro" | "Diamante";

const TIER_THRESHOLDS: Record<Tier, number> = {
  Bronce: 0,
  Plata: 100,
  Oro: 500,
  Diamante: 2000,
};

const TIER_COLORS: Record<Tier, { bg: string; text: string; bar: string }> = {
  Bronce: { bg: "bg-orange-100", text: "text-orange-900", bar: "bg-orange-500" },
  Plata: { bg: "bg-slate-100", text: "text-slate-900", bar: "bg-slate-500" },
  Oro: { bg: "bg-amber-100", text: "text-amber-900", bar: "bg-amber-500" },
  Diamante: { bg: "bg-sky-100", text: "text-sky-900", bar: "bg-sky-500" },
};

const ORDER: Tier[] = ["Bronce", "Plata", "Oro", "Diamante"];

function computeTier(points: number): { current: Tier; next: Tier | null; pctToNext: number } {
  let current: Tier = "Bronce";
  for (const t of ORDER) {
    if (points >= TIER_THRESHOLDS[t]) current = t;
  }
  const idx = ORDER.indexOf(current);
  const next = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  if (!next) return { current, next: null, pctToNext: 100 };
  const floor = TIER_THRESHOLDS[current];
  const ceil = TIER_THRESHOLDS[next];
  const pct = Math.min(100, Math.max(0, ((points - floor) / (ceil - floor)) * 100));
  return { current, next, pctToNext: pct };
}

interface Props {
  points: number;
  compact?: boolean;
}

export default function LoyaltyTierProgressBar({ points, compact = false }: Props) {
  const { current, next, pctToNext } = computeTier(points);
  const colors = TIER_COLORS[current];
  const missing = next ? TIER_THRESHOLDS[next] - points : 0;

  return (
    <div className={`rounded-xl ${colors.bg} p-4 ${compact ? "text-sm" : ""}`}>
      <div className={`mb-2 flex items-center justify-between ${colors.text}`}>
        <div className="font-semibold">
          Nivel <span className="uppercase">{current}</span>
        </div>
        <div className="text-xs opacity-80">{points.toLocaleString("es-PE")} pts</div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full ${colors.bar} transition-all duration-500`}
          style={{ width: `${pctToNext}%` }}
          aria-label={`Progreso al siguiente nivel ${pctToNext.toFixed(0)}%`}
        />
      </div>

      {next ? (
        <div className={`mt-2 text-xs ${colors.text} opacity-80`}>
          Te faltan <strong>{missing.toLocaleString("es-PE")} pts</strong> para ser{" "}
          <span className="uppercase">{next}</span>.
        </div>
      ) : (
        <div className={`mt-2 text-xs ${colors.text} opacity-80`}>
          Nivel máximo alcanzado 🎉
        </div>
      )}
    </div>
  );
}
