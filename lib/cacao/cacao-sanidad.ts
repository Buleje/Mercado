/**
 * cacao-sanidad.ts — catálogo client-safe de plagas/enfermedades del cacao y
 * su severidad/estado, para el monitoreo fitosanitario del campo. Fuente única
 * de labels, íconos y colores (tokens del DS). Las plagas relevantes en selva
 * peruana; la monilia sola puede comerse 30-40% de la cosecha.
 */
import {
  ShieldX, Flower2, CloudRain, Activity, Leaf, AlertTriangle,
  ShieldCheck, ShieldAlert, type LucideIcon,
} from "@buleje/design-system/icons";

export type CacaoPlaga = "monilia" | "escoba_bruja" | "phytophthora" | "mazorquero" | "chinche" | "otros";
export type SanidadSeveridad = "baja" | "media" | "alta";
export type SanidadEstado = "activo" | "controlado" | "resuelto";

export const CACAO_PLAGAS: { tipo: CacaoPlaga; label: string; cientifico: string; icon: LucideIcon; tip: string }[] = [
  { tipo: "monilia", label: "Monilia", cientifico: "Moniliophthora roreri", icon: ShieldX, tip: "Moho de la mazorca. Cosecha sanitaria semanal: retirá y enterrá las mazorcas enfermas antes de que esporulen." },
  { tipo: "escoba_bruja", label: "Escoba de bruja", cientifico: "Moniliophthora perniciosa", icon: Flower2, tip: "Poda y quema de escobas; retirá los cojines florales y ramas infectadas." },
  { tipo: "phytophthora", label: "Mazorca negra", cientifico: "Phytophthora spp.", icon: CloudRain, tip: "Mejorá drenaje y ventilación (poda); fungicida cúprico en época lluviosa." },
  { tipo: "mazorquero", label: "Mazorquero / barrenador", cientifico: "Carmenta / barrenadores", icon: Activity, tip: "Recojo frecuente de mazorcas; trampas y control focalizado." },
  { tipo: "chinche", label: "Chinche / mirídeos", cientifico: "Monalonion spp.", icon: Leaf, tip: "Monitoreá brotes tiernos; control biológico o químico si supera el umbral." },
  { tipo: "otros", label: "Otros", cientifico: "", icon: AlertTriangle, tip: "Describí el problema en las notas." },
];

export const PLAGA_LABEL: Record<CacaoPlaga, string> = Object.fromEntries(
  CACAO_PLAGAS.map((p) => [p.tipo, p.label]),
) as Record<CacaoPlaga, string>;

/** Severidad del foco: color por token del DS (ámbar → rojo). */
export const SANIDAD_SEVERIDAD: Record<SanidadSeveridad, { label: string; bg: string; fg: string; ring: string; icon: LucideIcon; rank: number }> = {
  baja: { label: "Baja", bg: "var(--data-warning-50)", fg: "var(--data-warning-800)", ring: "var(--data-warning-500)", icon: ShieldCheck, rank: 1 },
  media: { label: "Media", bg: "var(--data-warning-100)", fg: "var(--data-warning-900)", ring: "var(--data-warning-600)", icon: ShieldAlert, rank: 2 },
  alta: { label: "Alta", bg: "var(--data-error-50)", fg: "var(--data-error-700)", ring: "var(--data-error-500)", icon: ShieldX, rank: 3 },
};

/** Estado del foco: activo (rojo) → en control (ámbar) → resuelto (verde). */
export const SANIDAD_ESTADO: Record<SanidadEstado, { label: string; bg: string; fg: string }> = {
  activo: { label: "Foco activo", bg: "var(--data-error-50)", fg: "var(--data-error-700)" },
  controlado: { label: "En control", bg: "var(--data-warning-50)", fg: "var(--data-warning-800)" },
  resuelto: { label: "Resuelto", bg: "var(--data-success-50)", fg: "var(--data-success-700)" },
};
