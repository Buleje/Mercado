/**
 * ctp-shared — tipos, etiquetas y formatters compartidos por las vistas del
 * Libro de Operaciones CTP (shell · ingresos · detalle · secciones).
 * Single source: los labels de origen/producto/estado se leen desde acá, no se
 * re-tipean por vista (si no, la tabla y el detalle terminan diciendo distinto).
 */

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  X as XIcon,
} from "@buleje/design-system/icons";
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo } from "@/lib/forestal/ctp-compliance";

// Re-exportados: single source vive en lib/forestal/ctp-compliance.ts (lo
// consume también lib/forestal/ctp-export.ts, que no puede importar de acá).
export { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo };

export type WoodEntryStatus =
  | "pendiente"
  | "validado"
  | "rechazado"
  | "procesado"
  | "anulado";

/** Espejo del `WoodEntry` de Prisma tal como lo serializa la API. */
export interface WoodEntry {
  id: string;
  entryDate: string;
  gtfNumber: string;
  gtfDate: string | null;
  gtfSeries: string | null;
  providerName: string;
  providerDocument: string | null;
  providerDocumentType: string | null;
  originType: string;
  originCode: string | null;
  originRegion: string | null;
  originDistrict: string | null;
  speciesCommonName: string;
  speciesScientificName: string | null;
  speciesCites: boolean;
  productType: string;
  volumeM3: string;
  pieces: number;
  avgLengthM: string | null;
  avgDiameterCm: string | null;
  humidityPct: string | null;
  defectsNotes: string | null;
  notes: string | null;
  photos: string[] | null;
  status: WoodEntryStatus;
  validatedBy: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface WoodEntryStats {
  totalCount: number;
  totalVolumeM3: number;
  totalPieces: number;
  speciesCount: number;
  citesCount: number;
  citesVolumeM3: number;
  /** Ingresos registrados fuera del plazo SERFOR (createdAt - entryDate > 15 días). */
  lateCount: number;
  byStatus: Record<WoodEntryStatus, number>;
}

export const STATUS_META: Record<
  WoodEntryStatus,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "muted"; Icon: typeof CheckCircle2 }
> = {
  pendiente: { label: "Pendiente", tone: "warning", Icon: Clock },
  validado: { label: "Validado", tone: "success", Icon: CheckCircle2 },
  procesado: { label: "Procesado", tone: "info", Icon: CheckCircle2 },
  rechazado: { label: "Rechazado", tone: "danger", Icon: AlertCircle },
  anulado: { label: "Anulado", tone: "muted", Icon: XIcon },
};

const ORIGIN_LABELS: Record<string, string> = {
  concesion: "Concesión forestal",
  predio_privado: "Predio privado",
  comunidad_nativa: "Comunidad nativa",
  reforestacion: "Reforestación",
  retroaserradero: "Re-entrada CTP",
  otro: "Otro",
};

const PRODUCT_LABELS: Record<string, string> = {
  rolliza: "Rolliza",
  aserrada: "Aserrada",
  tablones: "Tablones",
  listones: "Listones",
  durmientes: "Durmientes",
  pulgada: "Pulgada",
  carbon: "Carbón",
  lena: "Leña",
  otro: "Otro",
};

export const originLabel = (type: string): string => ORIGIN_LABELS[type] ?? type;
export const productLabel = (type: string): string => PRODUCT_LABELS[type] ?? type;

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      // Fechas DATE-ONLY (entryDate/gtfDate) se guardan como medianoche UTC:
      // renderizarlas en hora Lima (UTC-5) las corría un día hacia atrás. El
      // operador registró "29" y el libro decía "28" — off-by-one en un
      // registro fiscalizable. Para fecha+hora usá formatDateTime (local).
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Form primitives (CtpEntryForm + CtpConsumosPicker) ──────────────────────
// Single source: viven acá (no en CtpEntryForm.tsx) para que el picker pueda
// importarlas sin crear un import circular entre los dos componentes.
export const I = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]";

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{label}{required && <span className="text-[var(--data-error-600)]">*</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}
