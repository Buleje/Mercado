import { FileText } from "@buleje/design-system/icons";
import type { PurchaseStatus } from "@/lib/jsondb";
import { ESTADO_OC_LABELS } from "@/lib/compras/estados-oc";
import { cn } from "@/lib/utils";

/** Constantes y piezas chicas de Órdenes de compra (antes arriba de PurchaseOrdersTab). */
// Labels y transiciones salen de lib/compras/estados-oc.ts — la misma tabla
// que valida el endpoint. Antes este select ofrecía "Auto-generado", que el
// servidor rechaza con 400.
export const STATUS_LABELS = ESTADO_OC_LABELS as Record<PurchaseStatus, string>;
export const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] border-[var(--data-warning-500)]/30",
  recibido: "bg-primary/10 dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] border-[var(--data-success-500)]/30",
  parcial: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] border-[var(--data-warning-500)]/30",
  cancelado: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] border-[var(--data-error-500)]/30",
  auto_generated: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
};

// ── Mejora 13: Progress bar visual de status OC ─────────────────────────────
export const STATUS_STEP: Record<string, number> = {
  pendiente: 1,
  parcial: 2,
  cancelado: 1,
  recibido: 4,
};
export function OCProgressBar({ status }: { status: string }) {
  const currentStep = STATUS_STEP[status] ?? 1;
  const isCancelled = status === "cancelado";
  const labels = ["Borr.", "Env.", "Conf.", "Rec."];
  return (
    <div className="flex flex-col gap-0.5 w-[160px]" title={STATUS_LABELS[status as PurchaseStatus] ?? status}>
      <div className="flex items-center gap-0">
        {[1, 2, 3, 4].map((step, idx) => {
          const completed = !isCancelled && step <= currentStep;
          return (
            <div key={step} className="flex items-center" style={{ flex: idx < 3 ? 1 : 0 }}>
              <div className={cn(
                "w-3.5 h-3.5 rounded-full shrink-0 transition-colors",
                isCancelled ? "bg-[var(--data-error-500)]" : completed ? "bg-primary" : "bg-[var(--rule-base)] "
              )} />
              {idx < 3 && (
                <div className={cn(
                  "h-1 flex-1 transition-colors",
                  isCancelled ? "bg-[var(--data-error-500)]" : (!isCancelled && step < currentStep) ? "bg-primary" : "bg-[var(--rule-base)] "
                )} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-0">
        {labels.map((label, idx) => (
          <span key={idx} className={cn("text-xs font-medium", !isCancelled && (idx + 1) <= currentStep ? "text-primary dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")} style={{ width: idx < 3 ? undefined : "auto" }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type ItemDraft = { productId: number; name: string; quantity: number; unitCost: number; unit: string };

/** Clave de un intento de creación: dos clicks al mismo botón comparten clave. */
export function nuevaIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `oc-${Math.random().toString(36).slice(2)}`;
}

// ── KPI Card (audit 2026-05-17): card compacta con ícono tinted box ──
export type KPIAccent = "danger" | "warning" | "success" | "neutral";
export function KPICardOC({
  label,
  value,
  sub,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof FileText;
  accent?: KPIAccent;
}) {
  const cfg = {
    danger:  { text: "text-[var(--data-error-500)]",   iconBg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15",     border: "border-[var(--data-error-500)]/30" },
    warning: { text: "text-[var(--data-warning-ink)]", iconBg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15", border: "border-[var(--data-warning-500)]/30" },
    success: { text: "text-[var(--data-success-500)]", iconBg: "bg-[var(--data-success-100)] dark:bg-[var(--data-success-500)]/15",               border: "border-[var(--data-success-500)]/30" },
    neutral: { text: "text-[var(--text-primary)]",     iconBg: "bg-[var(--surface-sunken)]",                                        border: "border-[var(--rule-base)]" },
  }[accent];
  return (
    <div className={cn(
      "bg-[var(--surface-raised)] border-2 rounded-2xl p-4 flex items-center gap-3 min-w-0 transition-shadow hover:shadow-sm",
      cfg.border,
    )}>
      <span className={cn("inline-flex items-center justify-center h-11 w-11 rounded-xl shrink-0", cfg.iconBg)}>
        <Icon className={cn("h-5 w-5", cfg.text)} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
        <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1 truncate", cfg.text)}>{value}</p>
        {sub && <p className="text-xs text-[var(--text-secondary)] mt-1 truncate font-medium">{sub}</p>}
      </div>
    </div>
  );
}
