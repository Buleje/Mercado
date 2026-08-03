import type { LucideIcon } from "@buleje/design-system/icons";
import { AlertTriangle } from "lucide-react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

type HeroTone = "positive" | "neutral" | "warning";
type HeroEmphasis = "default" | "positive" | "warning" | "danger";

export interface BusinessOverviewMetric {
  label: string;
  value: string;
  detail: string;
  emphasis?: HeroEmphasis;
}

export interface BusinessOverviewAction {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  emphasis?: HeroEmphasis;
}

interface BusinessOverviewHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: HeroTone;
  metrics: BusinessOverviewMetric[];
  highlights?: BusinessOverviewMetric[];
  actionsTitle: string;
  actionsDescription: string;
  actions: BusinessOverviewAction[];
  emptyActionTitle: string;
  emptyActionDescription: string;
}

function getToneClasses(tone: HeroTone): string {
  if (tone === "positive") {
    return "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15";
  }
  if (tone === "warning") {
    return "border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/10";
  }
  return "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15";
}

function getEmphasisClasses(emphasis: HeroEmphasis): string {
  if (emphasis === "positive") {
    return "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]";
  }
  if (emphasis === "warning") {
    return "border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 text-[var(--data-warning-700)] dark:text-amber-300";
  }
  if (emphasis === "danger") {
    return "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 text-[var(--data-error-700)] dark:text-red-300";
  }
  return "border-white/70 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 text-[var(--text-primary)] dark:text-zinc-100";
}

export function BusinessOverviewHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = "neutral",
  metrics,
  highlights = [],
  actionsTitle,
  actionsDescription,
  actions,
  emptyActionTitle,
  emptyActionDescription,
}: BusinessOverviewHeroProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.35fr,0.95fr] gap-4">
      <div className={cn("rounded-xl border p-5 ", getToneClasses(tone))}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-400">{eyebrow}</p>
            <SectionTitle className="text-xl font-extrabold mt-1">{title}</SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-zinc-300 mt-1 max-w-2xl">{description}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-white/80 dark:bg-zinc-900/60 border border-white/70 dark:border-zinc-800 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={cn("rounded-xl border p-4", getEmphasisClasses(metric.emphasis ?? "default"))}
            >
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-zinc-400">{metric.label}</p>
              <p className="text-2xl font-extrabold font-mono mt-1">{metric.value}</p>
              <p className="text-xs mt-1 text-[var(--text-secondary)] dark:text-zinc-400">{metric.detail}</p>
            </div>
          ))}
        </div>

        {highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {highlights.map((highlight) => (
              <div
                key={highlight.label}
                className={cn("rounded-xl border p-4", getEmphasisClasses(highlight.emphasis ?? "default"))}
              >
                <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-zinc-400">{highlight.label}</p>
                <p className="text-sm font-bold mt-1">{highlight.value}</p>
                <p className="text-xs mt-1 text-[var(--text-secondary)] dark:text-zinc-400">{highlight.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900/70 p-5 ">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-400">Foco inmediato</p>
            <CardTitle className="text-lg font-extrabold mt-1">{actionsTitle}</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-zinc-400 mt-1">{actionsDescription}</p>
          </div>
          <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0" />
        </div>

        {actions.length === 0 ? (
          <div className="rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15 p-4">
            <p className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{emptyActionTitle}</p>
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{emptyActionDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <div
                  key={action.label}
                  className={cn("rounded-xl border p-4", getEmphasisClasses(action.emphasis ?? "default"))}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/70 dark:bg-zinc-950/30 flex items-center justify-center shrink-0">
                      <ActionIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-bold truncate">{action.label}</p>
                        <span className="text-lg font-extrabold font-mono shrink-0">{action.value}</span>
                      </div>
                      <p className="text-xs mt-1 opacity-80">{action.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}