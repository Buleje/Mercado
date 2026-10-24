/**
 * Tipos y formatos compartidos de Activos (movidos de `ActivosModule.tsx`, 11-10).
 */
import { Construction, Truck } from "@buleje/design-system/icons";

export interface AssetStats {
  id: string; name: string; type: string; plate: string | null; imageUrl: string | null;
  purchaseValue: number | null; status: string; hourlyRate: number | null; rateUnit: string;
  capacityPerDay: number | null; currentHours: number | null; fuelTargetPerUnit: number | null;
  notes: string | null; active: boolean;
  totalIncome: number; totalExpense: number; profit: number; incomeCount: number; expenseCount: number;
  unitsWorked: number; units30d: number;
  costPerUnit: number | null; incomePerUnit: number | null; marginPerUnit: number | null;
  utilizationPct: number | null;
  pendingAmount: number; fuelPerUnit: number | null; fuelAlert: boolean;
  maintenanceDue: number; maintenanceSoon: number;
  publishedProductId: number | null;
}

export const fmt = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export const TYPES = [
  { v: "cargador", label: "Cargador" }, { v: "oruga", label: "Oruga" }, { v: "camion", label: "Camión" },
  { v: "excavadora", label: "Excavadora" }, { v: "tractor", label: "Tractor" }, { v: "otro", label: "Otro" },
];

export const STATUS_META: Record<string, { label: string; chip: string }> = {
  operativo:     { label: "Operativo",     chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  mantenimiento: { label: "Mantenimiento", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" },
  parado:        { label: "Parado",        chip: "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" },
};

export function typeIcon(type: string) { return type === "camion" ? Truck : Construction; }
export function typeLabel(type: string) { return TYPES.find(t => t.v === type)?.label ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : type); }
