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
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, parseCitesPermiso } from "@/lib/forestal/ctp-compliance";

// Re-exportados: single source vive en lib/forestal/ctp-compliance.ts (lo
// consume también lib/forestal/ctp-export.ts, que no puede importar de acá).
export { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, parseCitesPermiso };

/**
 * Puente inverso monte→planta (rec #9 QA, lado Títulos Habilitantes):
 * cuando el Libro de Títulos Habilitantes manda "Ingresar al CTP", deja el N°
 * de GTF en sessionStorage y navega al módulo CTP con `admin:navigate`. El
 * shell del CTP lo levanta (al montar y al re-activarse el tab) y abre Ingresos
 * pre-llenado. sessionStorage y no el `detail` del evento porque el módulo CTP
 * es lazy: puede no estar montado cuando el evento se dispara — la key persiste.
 */
export const CTP_INGRESAR_GTF_KEY = "ctp-ingresar-gtf";
export const CTP_MODULE_TAB_ID = "ctp-libro-operaciones";

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
  /** Ingresos registrados fuera del plazo SERFOR (>2 días hábiles op→registro). */
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

/** Chip de estado del ingreso — single source (tabla desktop + card mobile). */
export function StatusBadge({ status }: { status: WoodEntryStatus }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  const cls =
    meta.tone === "success"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
      : meta.tone === "warning"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : meta.tone === "danger"
          ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
          : meta.tone === "info"
            ? "bg-[var(--data-info-100)] text-[var(--data-info-700)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

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

// ── Botón estándar del módulo forestal ──────────────────────────────────────
// Single source para que TODOS los botones de acción (modales, toolbars) tengan
// el mismo alto/radio/estados en vez de reescribir clases sueltas por lugar.
// Variantes: primary (verde, registrar/guardar) · dark (brand-ink, acción oficial) ·
// secondary (borde) · ghost (texto) · danger (rojo suave). Tamaños: md (h-11) · sm (h-9).
export type BtnVariant = "primary" | "dark" | "secondary" | "ghost" | "danger";
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const BTN_SIZE: Record<"md" | "sm", string> = {
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
};
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-[var(--data-success-700)] text-white shadow-sm hover:opacity-90",
  dark: "bg-[var(--brand-ink)] text-white shadow-sm hover:opacity-90",
  secondary: "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]",
  ghost: "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  danger: "border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]",
};

export function Btn({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: { variant?: BtnVariant; size?: "md" | "sm" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${className}`} {...props} />;
}

// ── Esqueletos de carga ─────────────────────────────────────────────────────
// Un spinner centrado con "Cargando registros…" no dice nada mientras se
// espera; una silueta de la tabla que viene sí: el ojo ya sabe dónde va a
// aparecer cada dato y la vista no salta cuando llega.
export function TablaSkeleton({ filas = 5, columnas = 6 }: { filas?: number; columnas?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando registros"
      className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex gap-4 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        {Array.from({ length: columnas }, (_, i) => (
          <span key={i} className="h-3 flex-1 animate-pulse rounded bg-[var(--rule-base)]" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex gap-4 border-b border-[var(--rule-soft)] px-4 py-3.5 last:border-0">
          {Array.from({ length: columnas }, (_, c) => (
            <span
              key={c}
              className="h-3.5 flex-1 animate-pulse rounded bg-[var(--surface-sunken)]"
              // Escalonado: la fila entera latiendo al unísono parece un error.
              style={{ animationDelay: `${(f * columnas + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Silueta de un panel con KPIs + cuerpo (Rentabilidad, Saldos, Cumplimiento). */
export function PanelSkeleton({ kpis = 3 }: { kpis?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${kpis}, minmax(0, 1fr))` }}>
        {Array.from({ length: kpis }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" style={{ animationDelay: "240ms" }} />
    </div>
  );
}

// ── Cabecera de vista ───────────────────────────────────────────────────────
// Cada pestaña abría con un párrafo de tres líneas explicando qué es la vista
// («Existencias del Libro (LO-CTP) en mayo de 2026 — julio de 2026: materia
// prima que entra vs. producto que sale. Es el saldo que se declara ante
// SERFOR…»). Se lee una vez y estorba siempre: acá queda el qué + el cuándo en
// una línea, y el porqué en el tooltip, que es donde se busca cuando hace falta.
export function VistaHeader({
  titulo,
  meta,
  hint,
  children,
}: {
  titulo: string;
  /** Contexto corto: período, conteo. En mono, alineado al título. */
  meta?: string;
  /** La explicación larga: tooltip, no pantalla. */
  hint?: string;
  /** Acciones de la vista, a la derecha. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2" title={hint}>
        <strong className="text-sm font-bold text-[var(--text-primary)]">{titulo}</strong>
        {meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
      </p>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

// ── Acción de fila (tablas del libro) ───────────────────────────────────────
// Cuatro botones con texto por fila ("Cadena", "Enviar a inventario",
// "Anexo 04", "Anular") medían más que las siete columnas de datos juntas y
// mandaban la tabla al scroll horizontal. Acá el ícono manda y el texto vive en
// el tooltip + `aria-label` — la card de móvil sigue mostrando las palabras.
export type IconActionTone = "success" | "info" | "accent" | "danger" | "muted";

const ICON_ACTION_TONE: Record<IconActionTone, string> = {
  success:
    "border-[var(--data-success-500)]/50 bg-[var(--data-success-50)] text-[var(--data-success-700)] hover:border-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  info: "border-[var(--data-info-500)]/50 bg-[var(--data-info-50)] text-[var(--data-info-700)] hover:border-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  accent: "border-[var(--accent)] bg-primary/10 text-primary",
  danger:
    "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  muted:
    "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
};

export function IconAction({
  icon: Icon,
  label,
  tone = "muted",
  done,
  busy,
  className = "",
  ...props
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Qué hace, en palabras: va al tooltip y al lector de pantalla. */
  label: string;
  tone?: IconActionTone;
  /** Marca de "ya hecho" (ej. anexo emitido) — punto en la esquina. */
  done?: boolean;
  busy?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${ICON_ACTION_TONE[tone]} ${className}`}
      {...props}
    >
      <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {done && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-raised)] bg-[var(--data-success-500)]"
        />
      )}
    </button>
  );
}
