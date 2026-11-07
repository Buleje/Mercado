export type SubStatus = "active" | "paused" | "cancelled";
export type SubFrequency = "weekly" | "biweekly" | "monthly" | "bimonthly";
export type Accion = "pausar" | "reanudar" | "cancelar";

export interface Subscription {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  frequency: SubFrequency;
  status: SubStatus;
  startDate: string;
  nextBilling: string;
  monthlyAmount: number;
}

export interface SubscriptionStats {
  active: number;
  paused: number;
  cancelled: number;
  mrrEstimated: number;
}

export const FREQUENCY_LABELS: Record<SubFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  bimonthly: "Bimestral",
};

export const STATUS_STYLES: Record<SubStatus, string> = {
  active: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  paused: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  cancelled: "bg-[var(--rule-soft)] text-[var(--text-secondary)]",
};

export const STATUS_LABELS: Record<SubStatus, string> = { active: "Activa", paused: "Pausada", cancelled: "Cancelada" };
