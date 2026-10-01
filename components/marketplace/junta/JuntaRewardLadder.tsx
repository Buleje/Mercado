import { JUNTA_REWARD_TIERS } from "@/lib/junta/constants";

/**
 * JuntaRewardLadder — escalera visual "más vecinos, más ahorro" (single source
 * para landing y hub). Cada peldaño = % grande + meta. `activeTarget` resalta
 * el peldaño de la junta actual. Presentational puro → server-compatible.
 */
export default function JuntaRewardLadder({
  activeTarget,
  size = "md",
  className = "",
}: {
  activeTarget?: number;
  size?: "md" | "lg";
  className?: string;
}) {
  const pct = size === "lg" ? "text-3xl" : "text-2xl";
  return (
    <div
      aria-label="Mientras más vecinos, más ahorro"
      className={`grid gap-px border border-[var(--rule-base)] bg-[var(--rule-soft)] sm:grid-cols-3 ${className}`}
    >
      {JUNTA_REWARD_TIERS.map((tier) => {
        const active = tier.members === activeTarget;
        return (
          <div
            key={tier.members}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-5 ${
              active ? "bg-primary/10" : "bg-[var(--surface-raised)]"
            }`}
          >
            <span
              className={`${pct} font-black tabular-nums text-[var(--accent)]`}
            >
              {tier.percent}%
            </span>
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              {tier.members} vecinos
            </span>
            {active && (
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
                Esta junta
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
