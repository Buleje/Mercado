"use client";

/**
 * CtpEntriesTabla — las filas de Producción/Despacho, desktop y mobile.
 *
 * Sale de `CtpEntriesView`, que pasaba de 740 líneas contra el ~300 que pide el
 * repo. El corte es por responsabilidad, no por cantidad: la vista se queda con
 * el estado, los KPIs, los filtros y los modales; acá vive **cómo se ve una
 * línea**, que es lo que cambia cuando se agrega una columna o un aviso.
 *
 * Dual-render: la <table> sólo a ≥640px (`hidden sm:block`) y cards a medida
 * debajo. El `hidden` gana sobre la conversión genérica table→card del shell
 * admin, así que la tabla NO se auto-convierte y no compite con las cards.
 *
 * Todo el estado vive arriba: acá no hay `useState`. Una fila que no puede
 * decidir nada por su cuenta es una fila que no se desincroniza de los KPIs.
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, AlertCircle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Boxes, Download, FileText, Link2, MoreHorizontal, PackagePlus, Paperclip, Truck, X as XIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import CtpSeccionCardMobile from "./CtpSeccionCardMobile";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import { atribucionDeDespacho, faltaAtribuir, origenDeCorrida } from "@/lib/forestal/atribucion-despacho";
import {
  type ColsProduccionVisibles,
  type CtpEntry,
  type CtpSection,
  Th,
  Td,
  estadoSalida,
  UNIT_LABELS,
} from "./ctp-section-shared";
import { IconAction } from "./ctp-shared";
import { FiltroColumna, FiltroColumnaRango, type FacetaOpcion } from "./ctp-filtros-panel";
import { estadoDeGuia } from "@/lib/forestal/gtf-estado";
import { CAMPO_RANGO_META, type CampoRango, type RangoNumerico } from "@/lib/forestal/ctp-secciones-filtro";
import type { totalesDeSeccion } from "@/lib/forestal/ctp-secciones-filtro";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esInventarioDeApertura } from "@/lib/forestal/lotes-aserrio";

/** Por qué columna se puede ordenar. Lo resuelve la vista; acá sólo se dibuja. */
export type SortKey = "fecha" | "cantidad" | "rend";
export type OrdenCtp = { by: SortKey | null; dir: "asc" | "desc" };

/**
 * Un filtro que vive en la cabecera de SU columna (autofiltro estilo Excel).
 *
 * Lo arma la vista con las mismas facetas del panel: acá no se calcula nada, se
 * dibuja donde el ojo ya está mirando.
 */
export interface FiltroDeColumna {
  /** Uno o VARIOS valores: la columna se filtra por más de una opción a la vez. */
  value: string | readonly string[] | undefined;
  options: FacetaOpcion[];
  onChange: (v: string[]) => void;
  etiqueta?: (v: string) => string;
  placeholder?: string;
}

/** «Mayor que» / «entre X e Y» en una columna de números. */
export interface RangoDeColumna {
  valor: RangoNumerico | undefined;
  onChange: (r: RangoNumerico) => void;
}

/** Qué columnas traen autofiltro. Sin la clave, la columna va como siempre. */
export interface FiltrosDeColumna {
  species?: FiltroDeColumna;
  product?: FiltroDeColumna;
  salida?: FiltroDeColumna;
  permiso?: FiltroDeColumna;
  destino?: FiltroDeColumna;
  /** Por columna numérica; la unidad y el paso salen de `CAMPO_RANGO_META`. */
  rangos?: Partial<Record<CampoRango, RangoDeColumna>>;
}

// timeZone UTC: entryDate es date-only guardada a medianoche UTC — en hora Lima
// se corría un día.
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
/** `v` en m³ salvo que `unit` diga otra cosa (kg, pt, unidad): esas quedan tal cual. */
const n4 = (v: string | null, unit?: string | null) =>
  v == null ? "—" : !unit || unit === "m3" ? fmtM3(Number(v)) : Number(v).toFixed(4);

export interface CtpEntriesTablaProps {
  section: CtpSection;
  /** Las filas YA filtradas y ordenadas por la vista. */
  visible: CtpEntry[];
  sort: OrdenCtp;
  onSort: (by: SortKey) => void;
  /** Despachos que ya tienen su ANEXO N° 04 emitido. */
  conAnexo: Set<string>;
  /** Línea cuyo "enviar a inventario" está en curso. */
  toProductId: string | null;
  onChain: (e: CtpEntry) => void;
  onAnexo: (e: CtpEntry) => void;
  onSendInventory: (id: string) => void;
  onAnnul: (id: string) => void;
  /**
   * Corridas que todavía admiten producción sobre la misma materia prima
   * (ADR-365). Lo decide la vista con `corridasAMedioDeclarar`: la fila no
   * calcula topes, sólo dibuja el atajo cuando lo hay.
   */
  ampliables?: Set<string>;
  onAmpliar?: (id: string) => void;
  /** Adjuntar los papeles que viajan con el despacho (ADR-371). */
  onPapeles?: (e: CtpEntry) => void;
  /** Abrir la guía de transporte de esa línea (borrador editable o emitida). */
  onGuia?: (e: CtpEntry) => void;
  /** Totales de lo que se está viendo — los calcula la vista, para que el pie de
   *  la tabla y los KPIs de arriba no puedan decir números distintos. */
  totalesVista: ReturnType<typeof totalesDeSeccion>;
  /** Qué columnas opcionales de Producción se ven (sólo aplica a esa sección). */
  colsProduccion?: ColsProduccionVisibles;
  /** Autofiltros en la cabecera (Brandon, 2026-09-03). Sin esto, la tabla queda igual. */
  filtrosColumna?: FiltrosDeColumna;
}

const COLS_PRODUCCION_DEFECTO: ColsProduccionVisibles = {
  consumido: true, piezas: true, rend: true, salida: true, permiso: false,
};


/**
 * ¿Cuánto de este despacho salió SIN corrida de origen declarada?
 *
 * La atribución parcial está permitida a propósito (invariante I4: `≤`, nunca
 * `==` — exigir el 100% para poder guardar empuja a inventar un origen). Lo que
 * no puede pasar es que sea invisible: hasta ahora el faltante sólo se veía
 * abriendo la ficha de cadena de custodia, de a un despacho por vez, y es lo
 * primero que cruza un fiscalizador.
 *
 * Silencioso cuando está completo o cuando el despacho no declara cantidad.
 */
function AtribucionBadge({ entry }: { entry: CtpEntry }) {
  const estado = atribucionDeDespacho(
    entry.quantity == null ? null : Number(entry.quantity),
    entry.atribuidoQty,
    UNIT_LABELS[entry.unit ?? "m3"] ?? entry.unit ?? "",
  );
  if (!faltaAtribuir(estado)) return null;
  return (
    <div
      title="Este volumen salió de la planta sin corrida de producción atribuida. Abrí la cadena de custodia para completarlo: sin origen no se puede certificar."
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {estado.aviso}
    </div>
  );
}

/**
 * ¿De qué ingreso salió la materia prima de esta corrida?
 *
 * Una corrida sin origen atribuido es producto que apareció de la nada. La
 * pestaña de Consumos ya lo contaba, pero había que ir a buscarlo; acá se ve en
 * la fila, que es donde se miran las corridas. Mismo criterio que el aviso de
 * despacho: el faltante se declara, no se bloquea el guardado.
 */
function OrigenBadge({ entry }: { entry: CtpEntry }) {
  /* El origen de una corrida puede venir por dos caminos: madera atada a un
     ingreso con GTF (`mpAtribuidaM3`) o producto que entró desde otra corrida
     por reproceso (`mpReprocesoM3`). Los dos son origen declarado, así que se
     suman antes de preguntar si falta. Cuando el reproceso no se puede
     expresar en m³, el segundo llega en 0 y abajo se explica con el chip. */
  const estado = origenDeCorrida(
    entry.volumeInputM3 == null ? null : Number(entry.volumeInputM3),
    (entry.mpAtribuidaM3 ?? 0) + (entry.mpReprocesoM3 ?? 0),
  );
  if (!faltaAtribuir(estado)) return null;

  /*
   * ROJO FALSO EN LOS REPROCESOS (medido 2026-09-06 sobre la L95053).
   *
   * `mpAtribuidaM3` suma `forestCtpConsumo`, que son consumos de madera de
   * INGRESOS con GTF. Una corrida nacida de un reproceso (ADR-316) no consume
   * una guía: consume otro producto del libro, y esa relación viaja por otra
   * tabla (`origenEntryId`/`destino`). Da 0, y la fila acusaba «sin origen
   * declarado» a una línea cuyo origen está perfectamente trazado —el producto
   * del que salió—. Un rojo falso enseña a ignorar la lista entera, que es
   * justo lo que no puede pasar en el libro que se declara ante SERFOR.
   *
   * Acá sólo se corrige lo que la fila DICE. El cálculo de fondo sigue igual
   * —contar la materia prima que entra por reproceso exige convertir unidades
   * (el reproceso mueve `quantity` en pt/kg/m³ y la atribución compara m³) y
   * eso se toca en la capa de datos, no en un badge.
   */
  if (entry.codigoRaiz) {
    /* Cuidado con no tapar un faltante de verdad: si la corrida además ató
       PARTE de su materia prima a ingresos con GTF, lo que quedó suelto sigue
       siendo un hueco y se dice igual. Sólo cuando no hay NADA atribuido el
       reproceso explica el total. */
    const soloReproceso = estado.estado === "sin-atribucion";
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span
          title={`El origen de esta corrida no es un ingreso con GTF sino otro producto del libro: salió de reprocesar ${entry.codigoRaiz}. La cadena se sigue por ahí.`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
        >
          <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
          origen: reproceso de {entry.codigoRaiz}
        </span>
        {!soloReproceso && (
          <span
            title="Parte de la materia prima sí está atada a ingresos con GTF y parte no. Lo que falta se declara igual: el reproceso explica el origen, no el faltante."
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            {estado.aviso}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      title="Esta corrida consumió madera que no está atada a ningún ingreso con GTF. Atribuila desde su ficha: sin origen no se puede certificar la cadena."
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {estado.aviso}
    </div>
  );
}

/**
 * ¿El paquete sigue en el patio o ya se lo llevaron?
 *
 * Es el reporte "estado de productos" del ERP forestal de referencia, pero en la
 * misma fila en vez de en una pantalla aparte: la pregunta aparece mirando la
 * lista de producción, no yendo a buscarla.
 */
function SalidaBadge({ entry }: { entry: CtpEntry }) {
  const est = estadoSalida(entry);
  if (!est) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  const tono =
    est.tono === "salido"
      ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]"
      : est.tono === "parcial"
        ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${tono}`}>
      {est.label}
    </span>
  );
}

/**
 * ¿Esta línea vino del importador del libro, como existencia de apertura?
 *
 * `aCuerpoDelLibro` escribe la misma marca en los dos casos —corrida e ingreso
 * importado (`ctp-serfor-a-libro.ts`)—, así que no hace falta una columna nueva:
 * alcanza con leer lo que el import ya deja escrito. Sin este aviso, un
 * paquete importado se ve IGUAL a uno que salió de la sierra hoy, y son datos
 * de calidad distinta: uno lo midió el aserradero, el otro lo declaró un
 * archivo.
 */
function ImportadoBadge({ entry }: { entry: CtpEntry }) {
  // El predicado vive en `lotes-aserrio.ts`: la cadena estaba copiada en tres
  // componentes, y tres copias de un literal se desincronizan sin avisar.
  if (!esInventarioDeApertura(entry.observations)) return null;
  return (
    <span
      title="Existencia de apertura: entró por el importador del libro, no es una corrida registrada acá"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
    >
      <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
    </span>
  );
}

function RendimientoCell({ productType, rendimientoPct }: { productType: string | null; rendimientoPct: string | null }) {
  const pct = rendimientoPct != null ? Number(rendimientoPct) : null;
  const { estado, ref } = evaluarRendimiento(productType, pct);
  const alto = estado === "alto";
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {alto && (
        <AlertCircle
          className="h-3.5 w-3.5 text-[var(--data-warning-600)]"
          aria-label={`Rendimiento sobre el referencial SERFOR (${ref}%): revisá que no haya sobre-declaración`}
        />
      )}
      <span className={`font-mono text-xs font-bold tabular-nums ${alto ? "text-[var(--data-warning-700)]" : "text-[var(--data-info-700)]"}`}>
        {pct != null ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}

/**
 * Cabecera con su autofiltro debajo del título. Sin `filtro` es un `<Th>` común
 * —así una columna sin faceta (GTF salida) no cambia de forma— y con él, la
 * columna se acota desde donde se la está leyendo.
 */
function ThFiltro({ label, filtro, className }: {
  label: string; filtro?: FiltroDeColumna; className?: string;
}) {
  return (
    <Th className={className}>
      <span className="block">{label}</span>
      {filtro && <FiltroColumna label={label} {...filtro} />}
    </Th>
  );
}

/** Cabecera de columna numérica con su rango debajo del título. */
function ThRango({ campo, rango, className }: {
  campo: CampoRango; rango?: RangoDeColumna; className?: string;
}) {
  const meta = CAMPO_RANGO_META[campo];
  const etiqueta = campo === "consumido" ? "Consumido (m³)" : meta.label;
  return (
    <Th className={className}>
      <span className="block">{etiqueta}</span>
      {rango && (
        <FiltroColumnaRango
          label={meta.label}
          unidad={meta.unidad}
          paso={meta.paso}
          valor={rango.valor}
          onChange={rango.onChange}
        />
      )}
    </Th>
  );
}

function SortTh({ label, by, sort, onSort, className, campoRango, rango }: {
  label: string; by: SortKey; sort: { by: SortKey | null; dir: "asc" | "desc" }; onSort: (by: SortKey) => void; className?: string;
  /** Se ordena Y se acota desde la misma cabecera (Rend.). */
  campoRango?: CampoRango; rango?: RangoDeColumna;
}) {
  const active = sort.by === by;
  const Ico = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const right = className?.includes("text-right");
  const meta = campoRango ? CAMPO_RANGO_META[campoRango] : null;
  return (
    <th className={`px-4 py-3 font-bold ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(by)}
        className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""} ${active ? "text-[var(--accent)]" : "text-[var(--text-primary)] hover:text-[var(--accent)]"}`}
      >
        {label} <Ico className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
      {meta && rango && (
        <FiltroColumnaRango
          label={meta.label}
          unidad={meta.unidad}
          paso={meta.paso}
          valor={rango.valor}
          onChange={rango.onChange}
        />
      )}
    </th>
  );
}

/**
 * Una acción frecuente de la fila, con su nombre a la vista.
 *
 * El ícono solo obliga a pasar el mouse por seis botones para encontrar el que
 * hace falta; con el rótulo, «Anexo 04» se lee de una — que es justo lo que la
 * barra de deuda de arriba está pidiendo emitir. El punto verde marca lo ya
 * hecho, para distinguir «emitir» de «volver a imprimir» sin abrir nada.
 */
function BotonAccion({
  icon: Icono,
  hecho,
  onClick,
  title,
  children,
}: {
  icon: typeof Truck;
  hecho?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-bold transition-colors ${
        hecho
          ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
      {hecho && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-success-500)]" aria-hidden />}
    </button>
  );
}

export default function CtpEntriesTabla({
  section,
  visible,
  sort,
  onSort,
  conAnexo,
  toProductId,
  onChain,
  onAnexo,
  onSendInventory,
  onAnnul,
  ampliables,
  onAmpliar,
  onPapeles,
  onGuia,
  totalesVista,
  colsProduccion = COLS_PRODUCCION_DEFECTO,
  filtrosColumna,
}: CtpEntriesTablaProps) {
  const cv = colsProduccion;
  const fc = filtrosColumna ?? {};

  /**
   * Lo que se hace de vez en cuando, plegado — y lo que borra, separado.
   *
   * Sale de un helper y no del JSX de la fila porque son las MISMAS cuatro
   * acciones para las ocho filas: escritas adentro del `map` se releen ocho
   * veces y se desincronizan a la primera que cambie.
   */
  const accionesDeLinea = (e: CtpEntry): MenuAccion[] => {
    const lista: MenuAccion[] = [
      {
        id: "cadena",
        label: section === "despacho" ? "Cadena de custodia" : "Ver la corrida",
        hint: section === "despacho"
          ? "De qué corrida salió esta madera, su costo y su certificado"
          : "Materia prima consumida, costo y congelado",
        icon: Link2,
        onSelect: () => onChain(e),
      },
      {
        id: "producto",
        label: toProductId === e.id ? "Creando el producto…" : "Crear producto de esta línea",
        hint: "Queda oculto en el catálogo hasta que lo actives",
        icon: PackagePlus,
        busy: toProductId === e.id,
        disabled: toProductId === e.id,
        onSelect: () => onSendInventory(e.id),
      },
    ];
    if (section === "despacho" && onPapeles) {
      lista.push({
        id: "papeles",
        label: "Papeles del despacho",
        hint: "Subir GTF, factura y guías de origen, archivadas con su etiqueta",
        icon: Paperclip,
        onSelect: () => onPapeles(e),
      });
    }
    /* Última y en rojo: borra una línea del libro. Estaba en el riel, del mismo
       tamaño y a un centímetro de «ver la guía». */
    lista.push({
      id: "anular",
      label: "Anular la línea",
      hint: "Se va del libro con su motivo. No se puede deshacer.",
      icon: XIcon,
      tone: "danger",
      onSelect: () => onAnnul(e.id),
    });
    return lista;
  };

  return (
    <>
      {/* ── Desktop: tabla (≥640px). El `hidden` a <640px gana sobre la
             auto-conversión genérica del shell, dejando lugar a las cards. ── */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block">
        <DataTable className="w-full text-sm">
          {/* `align-top`: con el autofiltro debajo del título, las cabeceras sin
              filtro tienen que quedar arriba y no centradas contra los selects. */}
          <thead className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              <Th className="w-12 text-right">#</Th>
              <SortTh label="Fecha" by="fecha" sort={sort} onSort={onSort} />
              <ThFiltro label="Especie" filtro={fc.species} />
              <ThFiltro label="Producto" filtro={fc.product} />
              {section === "produccion" ? (
                <>
                  {cv.consumido && <ThRango campo="consumido" rango={fc.rangos?.consumido} className="text-right" />}
                  {/* «Producido» no lleva rango: su unidad cambia por línea
                      (m³/pt/kg) y un «entre 10 y 20» mezclaría magnitudes. */}
                  <SortTh label="Producido" by="cantidad" sort={sort} onSort={onSort} className="text-right" />
                  {cv.piezas && <ThRango campo="piezas" rango={fc.rangos?.piezas} className="text-right" />}
                  {cv.rend && <SortTh label="Rend." by="rend" sort={sort} onSort={onSort} className="text-right" campoRango="rend" rango={fc.rangos?.rend} />}
                  {cv.salida && <ThFiltro label="Salida" filtro={fc.salida} />}
                  {cv.permiso && <ThFiltro label="N° Permiso" filtro={fc.permiso} />}
                </>
              ) : (<><SortTh label="Cantidad" by="cantidad" sort={sort} onSort={onSort} className="text-right" /><Th className="text-right">Piezas</Th><Th>GTF salida</Th><ThFiltro label="Destino" filtro={fc.destino} /></>)}
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className={`border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${e.status === "anulado" ? "opacity-50" : ""}`}>
                <Td className="text-right font-mono text-xs text-[var(--text-tertiary)]">{e.lineNo}</Td>
                <Td className="font-medium text-[var(--text-primary)]">{fmtDate(e.entryDate)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon ?? "—"}</span>
                    {e.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                  </div>
                  {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{e.productType ?? "—"}</span>
                    <ImportadoBadge entry={e} />
                  </div>
                  {e.codigoProducto && (
                    <div className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{e.codigoProducto}</div>
                  )}
                  {/* Una línea nacida de un reproceso (ADR-316) se veía idéntica
                      a una producción nueva: sin esto, el volumen re-aserrado
                      parece madera que apareció de la nada. */}
                  {e.codigoRaiz && (
                    <div
                      className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                      title={`Esta línea salió de reprocesar ${e.codigoRaiz}`}
                    >
                      ↻ viene de {e.codigoRaiz}
                    </div>
                  )}
                </Td>
                {section === "produccion" ? (
                  <>
                    {cv.consumido && (
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {n4(e.volumeInputM3)}
                        <OrigenBadge entry={e} />
                      </Td>
                    )}
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(e.quantity, e.unit)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span></Td>
                    {cv.piezas && (
                      <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{e.pieces ?? "—"}</Td>
                    )}
                    {cv.rend && (
                      <Td className="text-right"><RendimientoCell productType={e.productType} rendimientoPct={e.rendimientoPct} /></Td>
                    )}
                    {cv.salida && <Td><SalidaBadge entry={e} /></Td>}
                    {cv.permiso && (
                      <Td className="font-mono text-xs text-[var(--text-secondary)]">
                        {e.permisoOrigen?.length ? e.permisoOrigen.join(" · ") : "—"}
                      </Td>
                    )}
                  </>
                ) : (
                  <>
                    <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {n4(e.quantity, e.unit)} <span className="text-xs font-normal text-[var(--text-tertiary)]">{e.unit}</span>
                      <AtribucionBadge entry={e} />
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{e.pieces ?? "—"}</Td>
                    <Td className="font-mono text-xs font-bold text-[var(--text-primary)]">{e.gtfNumber ?? "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{e.destino ?? "—"}</Td>
                  </>
                )}
                <Td>{e.status === "anulado"
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"><XIcon className="h-3 w-3" />Anulado</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">Registrado</span>}
                  {e.annulledReason && <div className="mt-1 text-xs text-[var(--data-error-700)]">{e.annulledReason}</div>}
                </Td>
                <Td className="text-right">
                  {e.status === "registrado" ? (
                    /**
                     * Dos acciones con NOMBRE y el resto en un menú.
                     *
                     * Eran seis iconos sin etiqueta, distinguibles sólo por
                     * tooltip: con ocho despachos en pantalla son 48 botones
                     * anónimos. Y la barra de arriba pide «8 sin anexo 04»
                     * mientras la acción que lo resuelve era uno de esos
                     * iconos, imposible de encontrar sin pasar el mouse por
                     * cada uno.
                     *
                     * «Anular» sale del riel a propósito: destruye una línea
                     * del libro y estaba pegada —mismo tamaño, mismo gesto— a
                     * «ver la guía». En el menú va con `tone: "danger"`, que la
                     * pinta distinta y la separa del resto.
                     */
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {section === "despacho" && onGuia && (
                        <BotonAccion
                          icon={Truck}
                          hecho={estadoDeGuia(e.gtfNumber) === "emitida"}
                          onClick={() => onGuia(e)}
                          title={
                            estadoDeGuia(e.gtfNumber) === "emitida"
                              ? `Guía ${e.gtfNumber} emitida — abrir para verla o imprimirla`
                              : "Guía de transporte: borrador — abrir para completarla y emitirla"
                          }
                        >
                          Guía
                        </BotonAccion>
                      )}
                      {section === "despacho" && (
                        <BotonAccion
                          icon={FileText}
                          hecho={conAnexo.has(e.id)}
                          onClick={() => onAnexo(e)}
                          title={conAnexo.has(e.id)
                            ? "ANEXO N° 04 emitido — abrir para re-imprimir o corregir"
                            : "Emitir el ANEXO N° 04 de esta GTF"}
                        >
                          Anexo 04
                        </BotonAccion>
                      )}
                      {/* Producción conserva su atajo propio: sumar a la corrida
                          (ADR-365) es el gesto de todos los días de esa vista. */}
                      {onAmpliar && ampliables?.has(e.id) && (
                        <IconAction
                          icon={Boxes}
                          tone="accent"
                          onClick={() => onAmpliar(e.id)}
                          label="Agregar producción a esta corrida (salió más de la misma materia prima)"
                        />
                      )}
                      <ActionMenu
                        label=""
                        title="Más acciones de esta línea"
                        icon={MoreHorizontal}
                        variant="outline"
                        size="sm"
                        actions={accionesDeLinea(e)}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                  {totalesVista.lineas} {totalesVista.lineas === 1 ? "línea vigente" : "líneas vigentes"} en pantalla
                </td>
                {section === "produccion" ? (
                  <>
                    {cv.consumido && (
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(totalesVista.consumido)}</td>
                    )}
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    {cv.piezas && (
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.piezas}</td>
                    )}
                    {cv.rend && <td />}
                    {cv.salida && <td />}
                    {cv.permiso && <td />}
                    <td colSpan={2} />
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.cantidad.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalesVista.piezas}</td>
                    <td colSpan={4} />
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>

      {/* ── Mobile: cards a medida (<640px) ── */}
      {visible.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {visible.map((e) => (
            <CtpSeccionCardMobile
              key={e.id}
              entry={e}
              section={section}
              toProductId={toProductId}
              onChain={onChain}
              onAnexo={section === "despacho" ? onAnexo : undefined}
              anexoEmitido={conAnexo.has(e.id)}
              onSendInventory={onSendInventory}
              onAnnul={onAnnul}
              ampliable={ampliables?.has(e.id)}
              onAmpliar={onAmpliar}
              onPapeles={section === "despacho" ? onPapeles : undefined}
              onGuia={section === "despacho" ? onGuia : undefined}
            />
          ))}
        </div>
      )}

    </>
  );
}
