/**
 * ctp-shared — tipos, etiquetas y formatters compartidos por las vistas del
 * Libro de Operaciones CTP (shell · ingresos · detalle · secciones).
 * Single source: los labels de origen/producto/estado se leen desde acá, no se
 * re-tipean por vista (si no, la tabla y el detalle terminan diciendo distinto).
 */

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, AlertTriangle, BarChart3, Check, CheckCircle2, ChevronDown, Clock, Columns3, Copy, ExternalLink, X as XIcon } from "@buleje/design-system/icons";
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, parseCitesPermiso } from "@/lib/forestal/ctp-compliance";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

// Re-exportados: single source vive en lib/forestal/ctp-compliance.ts (lo
// consume también lib/forestal/ctp-export.ts, que no puede importar de acá).
export { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, parseCitesPermiso };

/**
 * MesaPartesBanner — "dónde presentarlo" una vez impreso y firmado, con botón
 * de copiar el link. Single source entre `TramiteFormulario` (SERFOR/OSINFOR
 * nacional vía `AUTORIDADES`, ARFFS regional vía `arffsMesaPartes`) y
 * `PlantacionPasoRevision` (RNPF, siempre SERFOR) — mismo look en los dos,
 * sin duplicar el JSX ni la lógica de copiado (Brandon 2026-08-26/27).
 */
export function MesaPartesBanner({ url, label }: { url: string; label: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <p className="mt-2 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-info-500)] bg-[var(--data-info-50)] p-3 text-sm text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]">
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">
        Ya impreso y firmado, se presenta en la{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
          {label}
        </a>{" "}
        — portal oficial, disponible 24/7.
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1600);
          });
        }}
        title="Copiar el link de la mesa de partes"
        aria-label="Copiar el link de la mesa de partes"
        className="shrink-0 rounded-lg p-1 text-[var(--data-info-700)] transition hover:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]"
      >
        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </p>
  );
}

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

/** Cómo se lee el casillero (20) del formato en pantalla. */
export const COMPROBANTE_LABEL: Record<string, string> = {
  ninguno: "No aplica",
  factura: "Factura",
  boleta: "Boleta de venta",
  guia_remision: "Guía de remisión",
  otro: "Otro",
};

/** Espejo del `WoodEntry` de Prisma tal como lo serializa la API. */
export interface WoodEntry {
  /**
   * La ficha oficial que devolvió SERFOR al consultar la guía, casillero por
   * casillero. `unknown` porque llega como JSON: el que la usa la valida (ver
   * `ctp-gtf-desde-serfor.ts`). Sin ella no hay guía que reimprimir.
   */
  serforGtf?: unknown;
  /**
   * El cuerpo del documento: propietario del producto (13-21), destinatario
   * (22-28) y transportista (29-34) — ADR-336. `unknown` porque llega como JSON;
   * se lee con `leerGtfDatos()`, que nunca tira.
   */
  gtfDatos?: unknown;
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
  /**
   * La lista de trozas del ingreso, resumida por el listado (ADR-320): cuántas
   * piezas MADRE tiene y cuántos m³ suman. Sirve para avisar en la tabla que un
   * ingreso no cuadra con su propio detalle, que antes sólo se veía abriéndolos
   * de a uno. `trozasM3` es `null` cuando ninguna pieza trae volumen —"no sé"
   * no es "cero"— y `trozasCount` 0 cuando el ingreso no tiene lista.
   */
  trozasCount?: number;
  trozasM3?: number | null;
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

/**
 * `Date` además de string: el listado agrupado por guía (ADR-346) arma su
 * resumen con lo que devuelve Prisma, y en el servidor eso es un `Date`. La
 * misma función para los dos lados o la fecha se formatea de dos maneras.
 */
export function formatDate(iso: string | Date | null): string {
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
    return String(iso);
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
  noAplica,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  casillero?: number;
  span?: CampoSpan;
  /**
   * Por qué este casillero NO corresponde llenarlo en ESTA guía.
   *
   * Un casillero que no aplica y uno que falta se ven igual —los dos vacíos— y
   * eso hace leer el formulario como si estuviera a medias. Peor: empuja a
   * llenarlo con cualquier cosa para que «no quede nada vacío», y un dato
   * inventado en una guía que pasa por un puesto de control se lee como
   * declaración falsa. Con el motivo a la vista, el vacío es una respuesta.
   *
   * Sólo para lo que de verdad no corresponde (el DNI de quien declara RUC, el
   * permiso CITES de una especie que no es protegida). Lo que falta cargar va
   * como faltante, no como esto.
   *
   * Marca, no bloquea: el casillero sigue siendo editable.
   */
  noAplica?: string;
  children: React.ReactNode;
}) {
  const base = useId();
  const idCampo = `${base}-campo`;
  const idAyuda = hint ? `${base}-ayuda` : undefined;
  const idNoAplica = `${base}-noaplica`;

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
            [(unico.props as { "aria-describedby"?: string })["aria-describedby"], idAyuda, noAplica ? idNoAplica : undefined]
              .filter(Boolean)
              .join(" ") || undefined,
          ...(required ? { "aria-required": true } : {}),
          /* Se marca, NO se bloquea. Tipear en la casilla de DNI es lo que
             cambia el tipo de documento declarado, así que deshabilitarla
             sacaría esa vía; y en un formulario de cumplimiento el operador
             tiene que poder corregir cualquier casillero si la realidad no
             coincide con lo que el sistema dedujo. */
          ...(noAplica ? { placeholder: "no aplica" } : {}),
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
        className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]"
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
      {noAplica ? (
        /* El motivo ocupa el lugar de la ayuda: quien mira el formulario no
           necesita las dos cosas, necesita saber por qué ese casillero se
           queda así. */
        <span id={idNoAplica} className="mt-1 flex items-start gap-1 text-xs leading-snug text-[var(--text-tertiary)]">
          <Check className="mt-px h-3 w-3 shrink-0 text-[var(--data-success-600)]" aria-hidden />
          <span>No aplica: {noAplica}</span>
        </span>
      ) : (
        hint && (
          <span id={idAyuda} className="mt-1 block text-xs leading-snug text-[var(--text-tertiary)]">
            {hint}
          </span>
        )
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
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-12 ${className}`}>{children}</div>;
}

// ── Cuerpo y pie estándar de los modales del Libro ──────────────────────────
// El wrapper `AdminModal` no pone padding (a propósito: hay modales de mapa y
// de tabla que lo quieren a sangre), así que cada modal decidía el suyo — y
// tres de ellos NO decidían ninguno: los campos del directorio, del vehículo y
// del flete tocaban el borde del panel y las ayudas de sección se cortaban
// contra el filo derecho. `ModalBody` es el único lugar donde se decide.

/**
 * Padding del cuerpo de un modal del Libro. Se exporta suelto para los modales
 * cuyo cuerpo ya es otro elemento (un `<form>`, un contenedor con su propio
 * layout) y no pueden envolverse en `ModalBody` sin sumar un div.
 */
export const MODAL_BODY = "px-5 py-5 sm:px-6";

/** Cuerpo de un modal del Libro: padding uniforme (el mismo en los 20). */
export function ModalBody({
  children,
  className = "",
  ref,
}: {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={`${MODAL_BODY} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Pie de acciones. Se pasa a la prop `footer` de `AdminModal`, que lo deja
 * FUERA del área scrolleable: el botón «Guardar» de un formulario largo no
 * tiene que ganarse con scroll (el del directorio quedaba a 1228px en una
 * pantalla de 900). Por lo mismo el error viaja acá y no al final del
 * formulario, donde el modal scrolleado lo escondía justo cuando hacía falta.
 */
export function ModalFooter({
  error,
  aviso,
  nota,
  atajo,
  children,
}: {
  error?: string | null;
  /** Confirmación efímera (verde), p. ej. "Datos traídos de SUNAT". */
  aviso?: React.ReactNode;
  /** Contexto neutro a la izquierda (conteos, totales, qué falta). */
  nota?: React.ReactNode;
  /** Muestra "Ctrl + Enter guarda" cuando no hay nada más que decir. */
  atajo?: boolean;
  children: React.ReactNode;
}) {
  // `div`, no `p`: el aviso y la nota reciben ReactNode de quien llama, y ya
  // hubo quien mandó un `<details>` con su `<ul>` adentro. Un `<p>` no admite
  // contenido de bloque — el HTML se auto-cierra al parsear y React tira error
  // de hidratación. El `div` acepta cualquier cosa y `role="alert"` sigue
  // anunciando el error igual.
  const mensaje = error ? (
    <div role="alert" className="min-w-0 flex-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
      {error}
    </div>
  ) : aviso ? (
    <div className="min-w-0 flex-1 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</div>
  ) : nota ? (
    <div className="min-w-0 flex-1 text-sm text-[var(--text-tertiary)]">{nota}</div>
  ) : atajo ? (
    <div className="hidden min-w-0 flex-1 text-xs text-[var(--text-tertiary)] sm:block">
      <kbd className="rounded border border-[var(--rule-base)] px-1 py-0.5 font-mono text-[length:var(--ts-2xs,11px)]">Ctrl</kbd>
      {" + "}
      <kbd className="rounded border border-[var(--rule-base)] px-1 py-0.5 font-mono text-[length:var(--ts-2xs,11px)]">Enter</kbd>
      {" guarda"}
    </div>
  ) : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-5 py-3.5 sm:px-6">
      {mensaje}
      {children}
    </div>
  );
}

/**
 * Ctrl/⌘ + Enter guarda, en todos los modales de alta por igual.
 *
 * Devuelve el ref que va en el `ModalBody`: con él el atajo sabe en qué diálogo
 * vive y **sólo responde el de más arriba** — si un formulario abre otro modal
 * encima (importar trozas sobre el alta de ingreso), Ctrl+Enter guarda el de
 * arriba, no los dos.
 */
/**
 * Cerrar un formulario a medio llenar pide confirmación.
 *
 * Escape y el click fuera son gestos baratos —y Radix los atiende a los dos— así
 * que un roce cerraba seis secciones de directorio ya tipeadas sin una palabra.
 * Sólo pregunta si de verdad hay algo que perder: sin cambios cierra derecho,
 * como siempre. (El alta de ingreso NO lo usa: ésa guarda borrador solo.)
 */
export function useCierreSeguro(hayCambios: boolean, onClose: () => void) {
  return useCallback(() => {
    if (hayCambios && !window.confirm("Hay cambios sin guardar. ¿Cerrar y perderlos?")) return;
    onClose();
  }, [hayCambios, onClose]);
}

/**
 * ¿Cambió algo desde que se abrió? Compara contra la foto del montaje, así que
 * volver un campo a su valor original cuenta como "sin cambios" — que es lo que
 * el operador entiende por no haber tocado nada.
 */
export function useHayCambios(valor: unknown): boolean {
  const inicial = useRef<string>(undefined as unknown as string);
  const actual = JSON.stringify(valor ?? null);
  if (inicial.current === undefined) inicial.current = actual;
  return inicial.current !== actual;
}

export function useAtajoGuardar<T extends HTMLElement = HTMLDivElement>(guardar: () => void, activo = true) {
  // Genérico: el ref se cuelga del `ModalBody` (div) o del `<form>` del alta.
  const ref = useRef<T>(null);
  const cb = useRef(guardar);
  cb.current = guardar;
  useEffect(() => {
    if (!activo) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const mio = ref.current?.closest('[role="dialog"]');
      const abiertos = Array.from(document.querySelectorAll('[role="dialog"]'));
      if (mio && abiertos.length > 0 && abiertos[abiertos.length - 1] !== mio) return;
      ev.preventDefault();
      cb.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activo]);
  return ref;
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
    <section className={`break-inside-avoid border-t border-[var(--rule-base)] pt-4 mt-4 first:mt-0 first:border-t-0 first:pt-0 ${className}`}>
      <div className="mb-2.5 flex items-baseline gap-2">
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

/**
 * El ingreso no cuadra con su propia lista de piezas.
 *
 * Antes esto sólo se veía abriendo el ingreso, de a uno: un libro de doscientas
 * filas con tres descuadradas no tenía forma de mostrarlas. Es exactamente el
 * cruce que hace un fiscalizador —volumen declarado contra el detalle que lo
 * ampara— así que va en la fila, pegado al volumen que contradice.
 *
 * Silencioso cuando no hay lista de trozas: la mayoría de los ingresos viejos
 * no la tienen y no están mal por eso (ver `cuadreDeIngreso`).
 */
export function DescuadreChip({ entry }: { entry: WoodEntry }) {
  const cuadre = cuadreDeIngreso(Number(entry.volumeM3), entry.trozasM3, entry.trozasCount ?? 0);
  if (!descuadra(cuadre)) return null;
  return (
    <div
      title={`El ingreso declara ${fmtM3(Number(entry.volumeM3))} m³ y sus ${entry.trozasCount} piezas suman ${fmtM3(entry.trozasM3 ?? 0)} m³. Abrilo para cargar las que faltan o corregir el volumen.`}
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {cuadre.aviso}
    </div>
  );
}

/**
 * La fila de KPIs de una vista, con lo secundario plegado.
 *
 * Brandon, 2026-09-02: «en los KPI, la segunda fila que se oculte por defecto y
 * verlo con un botón para desplegarlo». Cinco tarjetas caen a dos filas apenas
 * la ventana baja de 1280 px, y esa segunda fila empuja la tabla —que es a lo
 * que se entra— fuera de la pantalla.
 *
 * `principales` = los que se ven siempre (los dos primeros: cuánto hay y cuánto
 * mide). El resto entra tras el botón, y la preferencia se recuerda por vista:
 * quien los quiere abiertos los abre una vez.
 *
 * El grid es `auto-fit` y no un número fijo de columnas a propósito: plegado
 * son dos tarjetas y desplegado cinco, y con `xl:grid-cols-5` las dos visibles
 * dejaban tres huecos en blanco del alto de una tarjeta.
 */
export function CtpKpisPlegables({
  claveMemoria,
  tarjetas,
  resumen,
}: {
  claveMemoria: string;
  tarjetas: ReactNode[];
  /**
   * El titular en una línea, al lado del botón cerrado.
   *
   * Sin esto el botón es una caja ciega: nadie abre un panel que no sabe qué
   * tiene adentro, y las cifras dejarían de mirarse del todo. Va corto —dos o
   * tres números— y sale de las MISMAS cuentas que las tarjetas.
   */
  resumen?: string;
}) {
  /* Arranca CERRADO (Brandon, 2026-09-03: «que los KPIs estén ocultos y que
     haya un botón para mostrarlos»). Ocho tarjetas empujaban la tabla —que es
     el trabajo— media pantalla abajo en cada carga de cada pestaña.

     Clave `v2`: la v1 guardaba «¿está abierta la SEGUNDA fila?», que es otra
     pregunta. Reusarla habría abierto el panel entero a quien sólo había
     pedido ver dos tarjetas más. */
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    try { setAbierto(localStorage.getItem(`ctp-kpis-v2:${claveMemoria}`) === "1"); } catch { /* modo privado */ }
  }, [claveMemoria]);
  const alternar = () => {
    setAbierto((v) => {
      const next = !v;
      try { localStorage.setItem(`ctp-kpis-v2:${claveMemoria}`, next ? "1" : "0"); } catch { /* quota */ }
      return next;
    });
  };
  if (tarjetas.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          title={abierto ? "Ocultar los indicadores del período" : "Ver los indicadores del período"}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-sm font-bold transition-colors print:hidden ${
            abierto
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          Indicadores
          <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-xs tabular-nums text-[var(--text-tertiary)]">
            {tarjetas.length}
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {/* El titular sólo mientras están escondidas: con el panel abierto, las
            tarjetas ya lo dicen mejor y repetirlo es ruido. */}
        {!abierto && resumen && (
          <p className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums text-[var(--text-secondary)]">{resumen}</p>
        )}
      </div>
      {abierto && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
          {tarjetas.map((k, i) => <Fragment key={i}>{k}</Fragment>)}
        </div>
      )}
    </div>
  );
}

/**
 * Columnas opcionales de una tabla, elegibles por el operador y persistidas
 * por dispositivo (mismo patrón que Documentos, ADR del 2026-08-30: sólo unas
 * pocas columnas de detalle se pueden ocultar, las que identifican la fila
 * quedan siempre fijas — no hay opción de "ocultar Especie").
 */
export function useColumnasVisibles<K extends string>(
  storageKey: string,
  columnas: readonly { key: K; label: string; porDefecto?: boolean }[],
) {
  const [visibles, setVisibles] = useState<Record<K, boolean>>(() => {
    const defaults = Object.fromEntries(columnas.map((c) => [c.key, c.porDefecto ?? true])) as Record<K, boolean>;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Record<K, boolean>>) } : defaults;
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibles));
    } catch {
      /* cuota llena o storage bloqueado: la preferencia no persiste, pero la
         pantalla sigue andando con lo que ya se eligió en esta sesión. */
    }
  }, [storageKey, visibles]);
  return [visibles, setVisibles] as const;
}

/** El botón "Columnas" + su desplegable de checkboxes. */
export function ColumnasMenu<K extends string>({
  columnas,
  visibles,
  onChange,
  className,
}: {
  columnas: readonly { key: K; label: string }[];
  visibles: Record<K, boolean>;
  onChange: (v: Record<K, boolean>) => void;
  /** Alto/redondeo del botón, para que entre en barras que no usan la altura
   *  de filtro (`h-12`) — por ejemplo la cabecera de Resúmenes, que va en `h-9`. */
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, [abierto]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 border-2 px-3 text-sm font-bold transition-colors ${className ?? "h-12 rounded-2xl"} ${
          abierto
            ? "border-primary bg-primary/5 text-primary"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary hover:text-primary"
        }`}
        title="Elegir columnas visibles"
        aria-label="Elegir columnas visibles"
        aria-expanded={abierto}
      >
        <Columns3 className="h-4 w-4" aria-hidden />
        <span className="max-sm:sr-only">Columnas</span>
      </button>
      {abierto && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Columnas
          </p>
          {columnas.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <input
                type="checkbox"
                checked={visibles[c.key]}
                onChange={(e) => onChange({ ...visibles, [c.key]: e.target.checked })}
                className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)]"
              />
              {c.label}
            </label>
          ))}
          {/* Con una tabla de catorce columnas, volver al estado inicial
              tildando de a una es tedioso — y dejarla vacía sin salida sería
              una trampa. Estos dos atajos son la vuelta atrás. */}
          <div className="mt-1 flex gap-1 border-t border-[var(--rule-soft)] pt-1">
            <button
              type="button"
              onClick={() => onChange(Object.fromEntries(columnas.map((c) => [c.key, true])) as Record<K, boolean>)}
              className="flex-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => onChange(Object.fromEntries(columnas.map((c) => [c.key, false])) as Record<K, boolean>)}
              className="flex-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              Ninguna
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
