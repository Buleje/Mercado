/**
 * cacao-labores.ts — config client-safe de las labores agrícolas y estados de
 * sección del manejo de campo. Fuente única para grilla + drawer (sin importar
 * la DB class, que arrastra prisma). Los tipos deben coincidir con
 * CACAO_LABOR_TIPOS de lib/db/cacao-campo.db.ts.
 */
import {
  Scissors, Flower2, Leaf, ShieldCheck, Droplets, PackageCheck,
  CheckCircle2, Clock, AlertTriangle, CircleDot,
  type LucideIcon,
} from "@buleje/design-system/icons";

export type CacaoLaborTipo = "poda" | "fertilizacion" | "deshierbe" | "fitosanitario" | "riego" | "cosecha";
export type CacaoParcelaStatus = "al_dia" | "pendiente" | "vencido" | "sin_labores";

export const CACAO_LABORES: { tipo: CacaoLaborTipo; label: string; icon: LucideIcon }[] = [
  { tipo: "poda", label: "Poda", icon: Scissors },
  { tipo: "fertilizacion", label: "Fertilización", icon: Flower2 },
  { tipo: "deshierbe", label: "Deshierbe", icon: Leaf },
  { tipo: "fitosanitario", label: "Control fitosanitario", icon: ShieldCheck },
  { tipo: "riego", label: "Riego", icon: Droplets },
  { tipo: "cosecha", label: "Cosecha", icon: PackageCheck },
];
export const LABOR_LABEL: Record<CacaoLaborTipo, string> = Object.fromEntries(
  CACAO_LABORES.map((l) => [l.tipo, l.label]),
) as Record<CacaoLaborTipo, string>;

/** Unidades sugeridas por tipo de labor (select, no texto libre → datos limpios). */
export const LABOR_UNIDADES: Record<CacaoLaborTipo, string[]> = {
  poda: ["jornal", "plantas", "ha"],
  fertilizacion: ["kg", "sacos", "L", "jornal"],
  deshierbe: ["jornal", "ha", "L"],
  fitosanitario: ["L", "mL", "kg", "jornal"],
  riego: ["L", "m³", "horas"],
  cosecha: ["kg", "sacos", "quintales"],
};

/** Meta visual de cada estado de sección (color por token + icono + etiqueta). */
export const PARCELA_STATUS: Record<CacaoParcelaStatus, { label: string; icon: LucideIcon; bg: string; fg: string; ring: string }> = {
  al_dia: { label: "Al día", icon: CheckCircle2, bg: "var(--data-success-50)", fg: "var(--data-success-700)", ring: "var(--data-success-500)" },
  pendiente: { label: "Pendiente", icon: Clock, bg: "var(--data-warning-50)", fg: "var(--data-warning-800)", ring: "var(--data-warning-500)" },
  vencido: { label: "Vencido", icon: AlertTriangle, bg: "var(--data-error-50)", fg: "var(--data-error-700)", ring: "var(--data-error-500)" },
  sin_labores: { label: "Sin labores", icon: CircleDot, bg: "var(--surface-sunken)", fg: "var(--text-tertiary)", ring: "var(--rule-base)" },
};
