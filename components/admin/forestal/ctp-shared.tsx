/**
 * ctp-shared — tipos, etiquetas y formatters compartidos por las vistas del
 * Libro de Operaciones CTP (shell · ingresos · detalle · secciones).
 * Single source: los labels de origen/producto/estado se leen desde acá, no se
 * re-tipean por vista (si no, la tabla y el detalle terminan diciendo distinto).
 */

import { Children, cloneElement, isValidElement, useId, type ReactElement } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Check, CheckCircle2, Clock, X as XIcon } from "@buleje/design-system/icons";
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

/**
 * Filtro con el que otra pestaña deja preparada la de Ingresos. Un aviso que
 * dice "2 ingresos fuera de plazo" y aterriza en la lista completa obliga a
 * buscar los 2 a ojo; con esto el destino ya muestra exactamente esos.
 */
export type CtpIngresosFiltroRapido = "pendiente" | "fuera-de-plazo" | "cites" | "sin-origen";

/** El filtro + un contador: repetir el mismo salto tiene que volver a aplicarlo
 *  (si no, la segunda vez el efecto no cambia de valor y no pasa nada). */
export interface CtpFiltroRapido {
  tipo: CtpIngresosFiltroRapido;
  n: number;
}

export type WoodEntryStatus =
  | "pendiente"
  | "validado"
  | "rechazado"
  | "procesado"
  | "anulado";

/** Espejo del `WoodEntry` de Prisma tal como lo serializa la API. */
export interface WoodEntry {
  /**
   * La ficha oficial que devolvió SERFOR al consultar la guía, casillero por
   * casillero. `unknown` porque llega como JSON: el que la usa la valida (ver
   * `ctp-gtf-desde-serfor.ts`). Sin ella no hay guía que reimprimir.
   */
  serforGtf?: unknown;
  id: string;
  /** (1) N° de registro del libro de operaciones — el folio (ADR-311). */
  libroNro: number | null;
  entryDate: string;
  /** (3) Tipo de documento: GTF | GRR. */
  docType: string | null;
  /** N° de constancia del SNIFFS: con él se vuelve a la guía en la base de SERFOR. */
  serforNumeroRegistro: string | null;
  gtfNumber: string;
  gtfDate: string | null;
  gtfSeries: string | null;
  providerName: string;
  providerDocument: string | null;
  providerDocumentType: string | null;
  originType: string;
  originCode: string | null;
  /** (5) N° Fuente de origen/procedencia. */
  originSourceNumber: string | null;
  /** (9) Código de CTP de procedencia (si vino de otro centro). */
  ctpProductCode: string | null;
  originRegion: string | null;
  originDistrict: string | null;
  speciesCommonName: string;
  speciesScientificName: string | null;
  speciesCites: boolean;
  productType: string;
  /** (10) Unidad de medida declarada en el documento. */
  unit: string | null;
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

/** Valor presente en el período + su peso — llena un selector de filtro con lo
 *  que realmente hay (espejo de `WoodEntryFacet` en la DB class). */
export interface WoodEntryFacet {
  value: string;
  count: number;
  volumeM3: number;
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
  /** Ingresos vigentes sin código de origen — sin eso la pestaña EUDR queda inerte. */
  sinOrigenCount: number;
  byStatus: Record<WoodEntryStatus, number>;
  /** Especies / proveedores / productos del período (top 30 por volumen). */
  species: WoodEntryFacet[];
  providers: WoodEntryFacet[];
  products: WoodEntryFacet[];
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

// ── Primitivos de formulario de los modales del Libro ───────────────────────
// Single source de TODOS los modales del módulo (alta de ingreso, corrida,
// despacho, lote, liquidación…). Viven acá —y no en cada modal— porque cuando
// cada uno tenía sus clases sueltas terminaban con alturas y focus distintos:
// el mismo formulario se veía de tres maneras según por dónde se abriera.
//
// Rediseño 2026-07-30: los campos pasaron a h-11 (toque cómodo, misma altura que
// `Btn` md, así un input y el botón de al lado quedan alineados), radio `xl` y
// foco en el TURQUESA de la marca — antes era un verde `data-success` que no es
// color de marca y competía con el estado "guardado con éxito".
export const I =
  "w-full h-11 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-tertiary)] placeholder:text-[var(--text-tertiary)]";

/** Cuántas de las 12 columnas ocupa un campo en `CampoGrid`. */
export type CampoSpan = 2 | 3 | 4 | 6 | 8 | 12;

const SPAN_CLASS: Record<CampoSpan, string> = {
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
  8: "sm:col-span-8",
  12: "sm:col-span-12",
};

/**
 * Un campo del formulario.
 *
 * `casillero` es el número del campo en el formato oficial del LO-CTP: va como
 * un chip discreto al lado de la etiqueta en vez de un párrafo gris debajo
 * ("Casillero (3) del Libro de Operaciones"). Con seis campos así, esos párrafos
 * eran más texto que el formulario y empujaban todo hacia abajo.
 */
export function Field({
  label,
  required,
  hint,
  casillero,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  casillero?: number;
  span?: CampoSpan;
  children: React.ReactNode;
}) {
  const base = useId();
  const idCampo = `${base}-campo`;
  const idAyuda = hint ? `${base}-ayuda` : undefined;

  /**
   * El control se ASOCIA por `htmlFor`, no se envuelve.
   *
   * Envolviéndolo, el nombre accesible del campo se comía todo lo que hubiera
   * adentro: el de «N° GTF» incluía los botones «Cargar guía» y «Ver guías», y
   * el de «Código de origen» arrastraba el número de casillero y la ayuda
   * entera. Un lector de pantalla anunciaba un párrafo donde tenía que decir dos
   * palabras. Además, un `<button>` dentro de un `<label>` activa el campo al
   * pulsarlo, que no es lo que espera nadie.
   *
   * Sólo se le pone el `id` a un elemento del DOM (input/select/textarea): a un
   * componente propio se le pasaría una prop que no espera, así que ese caso se
   * resuelve marcando el grupo con `aria-labelledby`.
   */
  // Tolerante a propósito: hay campos con DOS controles (un input y su botón,
  // un select con su chip) y `Children.only` los hacía explotar. Sólo se
  // asocia por `htmlFor` cuando hay exactamente un elemento nativo; el resto
  // se resuelve como grupo etiquetado, que también anuncia bien.
  const hijos = Children.toArray(children);
  const unico = hijos.length === 1 && isValidElement(hijos[0]) ? (hijos[0] as ReactElement) : null;
  // Sólo un CONTROL de verdad puede recibir el `htmlFor`. Cuando el campo
  // envuelve su input en un `<div>` —el de «N° GTF» lo hace, para meter los
  // botones de cargar y escanear al lado— el id caía en el div y el input se
  // quedaba sin nombre: ahí se etiqueta el grupo entero.
  const esControl =
    Boolean(unico) && ["input", "select", "textarea"].includes(String(unico?.type));

  const control =
    esControl && unico
      ? cloneElement(unico as ReactElement<Record<string, unknown>>, {
          id: (unico.props as { id?: string }).id ?? idCampo,
          "aria-describedby":
            [(unico.props as { "aria-describedby"?: string })["aria-describedby"], idAyuda]
              .filter(Boolean)
              .join(" ") || undefined,
          ...(required ? { "aria-required": true } : {}),
        })
      : children;

  return (
    // Sin `span` NO se pone clase: los formularios que envuelven en un grid de 2
    // columnas (no de 12) heredan su propio ancho. Un `col-span-12` por defecto
    // le hacía crear 12 columnas implícitas al grid padre y sus bloques hermanos
    // caían a 1/12 de ancho — el modal de Producción quedó con el texto partido
    // letra por letra hasta que se detectó en el screenshot.
    <div
      className={`block min-w-0 ${span ? SPAN_CLASS[span] : ""}`}
      {...(esControl ? {} : { role: "group", "aria-labelledby": `${base}-rotulo` })}
    >
      <label
        id={`${base}-rotulo`}
        {...(esControl ? { htmlFor: idCampo } : {})}
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]"
      >
        <span className="truncate">{label}</span>
        {required && <span className="text-[var(--data-error-600)]" aria-hidden="true">*</span>}
        {casillero != null && (
          <span
            title={`Casillero (${casillero}) del formato oficial LO-CTP`}
            // Fuera del nombre accesible: el número es una ayuda visual para
            // cruzar con el papel, no parte de cómo se llama el campo.
            aria-hidden="true"
            className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold tabular-nums text-[var(--text-tertiary)]"
          >
            {casillero}
          </span>
        )}
      </label>
      {control}
      {hint && (
        <span id={idAyuda} className="mt-1 block text-xs leading-snug text-[var(--text-tertiary)]">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Grilla de 12 columnas para los campos de una sección.
 *
 * Antes cada bloque armaba su propio `grid-cols-2` o `grid-cols-3`, así que dos
 * campos hermanos podían medir 210px y 300px sin motivo y el formulario se veía
 * dentado. Con 12 columnas, "mitad" es siempre `span={6}` y "tercio" `span={4}`.
 * En celular todo cae a una columna.
 */
export function CampoGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-12 ${className}`}>{children}</div>;
}

/**
 * Sección de un modal: número + título, SIN caja.
 *
 * Cada sección era una tarjeta con borde: seis tarjetas dentro del marco del
 * modal, más el panel lateral, daban ocho bordes compitiendo en la misma
 * pantalla. Un encabezado con una línea fina separa igual de bien y deja que el
 * ojo siga los campos, que es lo que se viene a llenar.
 */
export function Seccion({
  numero,
  title,
  hint,
  estado,
  children,
  className = "",
}: {
  numero?: number;
  title: string;
  hint?: string;
  /** Marca si la sección ya tiene lo que necesita. `undefined` = no se evalúa. */
  estado?: "ok" | "pendiente";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`break-inside-avoid border-t border-[var(--rule-base)] pt-5 mt-5 first:mt-0 first:border-t-0 first:pt-0 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2">
        {numero != null && (
          <span className="text-[length:var(--ts-2xs,11px)] font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {String(numero).padStart(2, "0")}
          </span>
        )}
        <CardTitle as="h3" className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {title}
        </CardTitle>
        {/* El estado por sección evita recorrer el formulario entero buscando
            qué falta: se ve de un vistazo cuál quedó a medias. */}
        {estado === "ok" && (
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" title="Completa">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
        {estado === "pendiente" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-warning-500)]" title="Falta completar" />
        )}
        {hint && <span className="ml-auto truncate text-xs text-[var(--text-tertiary)]">{hint}</span>}
      </div>
      {/* La sección ES la grilla: así dos campos hermanos miden lo mismo sin que
          cada bloque arme su propio grid. Lo que no es un campo (avisos, listas)
          se marca con `sm:col-span-12` para ocupar la fila entera. */}
      <CampoGrid>{children}</CampoGrid>
    </section>
  );
}

/**
 * Columna lateral de resumen (la vista previa de lo que se va a registrar).
 * `sticky` para que no se pierda al scrollear el formulario largo.
 */
export function PanelResumen({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 flex h-fit flex-col gap-3 rounded-2xl bg-[var(--surface-sunken)] p-4">
      <CardTitle as="h3" className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {title}
      </CardTitle>
      {children}
      {footer}
    </aside>
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

// Mudados a `admin/shared/module-primitives` cuando el Acopio de Cacao los
// necesitó (un módulo agrícola no importa de `admin/forestal/`). Se re-exportan
// para que los imports existentes del Libro CTP sigan valiendo.
export {
  TablaSkeleton,
  PanelSkeleton,
  VistaHeader,
  IconAction,
  type IconActionTone,
} from "@/components/admin/shared/module-primitives";
