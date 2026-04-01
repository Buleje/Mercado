"use client";

// ─── PlanBadge ────────────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "business" | "enterprise";

const PLAN_STYLES: Record<PlanId, string> = {
  free:       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  pro:        "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  business:   "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
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
  active:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  inactive:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  trial:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
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
