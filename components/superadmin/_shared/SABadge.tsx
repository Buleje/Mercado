"use client";

// ─── PlanBadge ────────────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "business" | "enterprise";

const PLAN_STYLES: Record<PlanId, string> = {
  free:       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  pro:        "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  business:   "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  enterprise: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
};

const PLAN_LABEL: Record<PlanId, string> = {
  free:       "Free",
  pro:        "Pro",
  business:   "Business",
  enterprise: "Enterprise",
};

export function PlanBadge({ plan }: { plan: PlanId }) {
  const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free;
  const label = PLAN_LABEL[plan] ?? plan;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

// Alias used by older code
export { PlanBadge as SAPlanBadge };

// ─── StatusBadge ──────────────────────────────────────────────────────────────

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
        active
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
      ].join(" ")}
    >
      <span
        className={["w-1.5 h-1.5 rounded-full", active ? "bg-green-500" : "bg-red-500"].join(" ")}
      />
      {active ? "Activo" : "Suspendido"}
    </span>
  );
}

// Extended status badge kept for backward compat
type StatusVariant = "active" | "inactive" | "trial" | "pending" | "settled" | "cancelled";

const STATUS_STYLES: Record<StatusVariant, string> = {
  active:    "bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/40 dark:text-[var(--data-success)]",
  inactive:  "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/40 dark:text-[var(--data-error)]",
  trial:     "bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/40 dark:text-[var(--data-success)]",
  pending:   "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
  settled:   "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function SAStatusBadge({
  status,
  label,
}: {
  status: StatusVariant | string;
  label?: string;
}) {
  const style = STATUS_STYLES[status as StatusVariant] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label ?? status}
    </span>
  );
}
