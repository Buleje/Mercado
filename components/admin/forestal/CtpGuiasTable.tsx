"use client";

/**
 * CtpGuiasTable — la bandeja de Ingresos, una fila por GUÍA (ADR-346).
 *
 * En el libro, una GTF con dos especies son dos asientos (ADR-312). En la
 * bandeja eso se veía como dos guías iguales —mismo papel, mismo proveedor,
 * misma fecha— que había que validar y recepcionar dos veces. Acá el documento
 * es la fila: sus especies se resumen y sus asientos viven adentro, a un click.
 *
 * Las acciones de la fila valen para **toda la guía**; las de cada asiento
 * (rechazar con motivo, duplicar, editar, cadena) siguen estando en el detalle,
 * que es donde se ve a cuál se le aplican.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCheck,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Coins,
  Share2,
  ThumbsDown,
  TreePine,
} from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CtpSort, CtpSortField } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { faltaRecibirMadera, loQueFaltaRecibir } from "@/lib/forestal/recepcion-guias";
import { tieneCosto } from "@/lib/forestal/costo-sugerido";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { type FacetaOpcion } from "./ctp-filtros-panel";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import CtpEntryActions from "./CtpEntryActions";
import CtpGuiaCardMobile from "./CtpGuiaCardMobile";
import EspecieFoto from "./EspecieFoto";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import {
  PLAZO_REGISTRO_DIAS,
  StatusBadge,
  DescuadreChip,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  TablaSkeleton,
  type WoodEntry,
  type WoodEntryStatus,
} from "./ctp-shared";
import { UNIT_LABELS } from "./ctp-section-shared";
import { formatNumber } from "@/lib/format";

/** Un autofiltro en la cabecera de su columna (estilo Excel). Lo arma la vista. */
/**
 * Las columnas de la tabla que se pueden apagar (ADR-400).
 *
 * Fijas quedan las que IDENTIFICAN la fila —N° de libro, fecha, especies,
 * cantidad y acciones—: esconderlas dejaría filas que no se pueden reconocer.
 */
export type ColGuiaOpcional =
  | "documento" | "proveedor" | "permiso" | "estado"
  | "tipoDoc" | "fechaGuia" | "sniffs" | "origen" | "recepcion" | "producto"
  | "piezas" | "trozas" | "unidad" | "costo" | "registro";
export type ColsGuiasVisibles = Record<ColGuiaOpcional, boolean>;

/**
 * Las quince columnas elegibles (Brandon, 2026-09-18: «quiero más opciones para
 * escoger»). Las cuatro de siempre arrancan prendidas y las once nuevas
 * apagadas: quien ya tenía su tabla armada no se la encuentra cambiada.
 *
 * El `grupo` es lo que hace usable un menú de quince: sin él es una lista de
 * casillas donde no se distingue «Recepción» (operación) de «Valorizado»
 * (plata). Cada dato sale de la guía o de su primer asiento — ninguna columna
 * inventa un cálculo que la fila no tenga.
 */
export const COLUMNAS_GUIAS_OPCIONALES: readonly {
  key: ColGuiaOpcional;
  label: string;
  porDefecto?: boolean;
  grupo?: string;
}[] = [
  // El papel
  { key: "documento", label: "Documento (GTF)", grupo: "El papel" },
  { key: "tipoDoc", label: "Tipo de documento", porDefecto: false, grupo: "El papel" },
  { key: "fechaGuia", label: "Fecha del documento", porDefecto: false, grupo: "El papel" },
  { key: "sniffs", label: "N° SNIFFS", porDefecto: false, grupo: "El papel" },
  // De dónde viene
  { key: "proveedor", label: "Proveedor", grupo: "De dónde viene" },
  { key: "permiso", label: "N° Permiso", grupo: "De dónde viene" },
  { key: "origen", label: "Origen (región/distrito)", porDefecto: false, grupo: "De dónde viene" },
  // Qué trae
  { key: "producto", label: "Producto", porDefecto: false, grupo: "Qué trae" },
  { key: "piezas", label: "Piezas", porDefecto: false, grupo: "Qué trae" },
  { key: "trozas", label: "Trozas cargadas", porDefecto: false, grupo: "Qué trae" },
  { key: "unidad", label: "Unidad declarada", porDefecto: false, grupo: "Qué trae" },
  // Cómo va
  { key: "recepcion", label: "Recepción en planta", porDefecto: false, grupo: "Cómo va" },
  { key: "estado", label: "Estado", grupo: "Cómo va" },
  { key: "costo", label: "Valorizado (S/)", porDefecto: false, grupo: "Cómo va" },
  { key: "registro", label: "Registró", porDefecto: false, grupo: "Cómo va" },
];

const COLS_GUIAS_DEFECTO: ColsGuiasVisibles = Object.fromEntries(
  COLUMNAS_GUIAS_OPCIONALES.map((c) => [c.key, c.porDefecto ?? true]),
) as ColsGuiasVisibles;

/** Las opcionales que van ANTES de «Especies», en el orden en que se pintan.
 *  El pie de la tabla las cuenta para su colSpan: con un número fijo, apagar
 *  una corría el total una celda y el m³ caía bajo otra columna. */
const COLS_IZQUIERDA: readonly ColGuiaOpcional[] = [
  "tipoDoc", "documento", "fechaGuia", "sniffs", "proveedor", "permiso", "origen", "recepcion", "producto",
];
/** Las opcionales que van DESPUÉS de «Cantidad» (antes de «Acciones»). */
const COLS_DERECHA: readonly ColGuiaOpcional[] = ["piezas", "trozas", "unidad", "costo", "registro", "estado"];
const cuantas = (claves: readonly ColGuiaOpcional[], cols: ColsGuiasVisibles) =>
  claves.reduce((n, k) => n + (cols[k] ? 1 : 0), 0);

/**
 * El autofiltro de una columna de la bandeja de Ingresos.
 *
 * Admite VARIOS valores como el resto de las tablas (2026-09-10): acá el filtro
 * viaja al servidor —`?species=A&species=B`— y la consulta los cruza con OR
 * adentro del campo. Las opciones de cada columna se calculan SIN su propio
 * filtro, o elegir la primera especie escondería la segunda.
 */
export interface FiltroColumnaGuias {
  value: string | readonly string[] | undefined;
  options: FacetaOpcion[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  etiqueta?: (v: string) => string;
}

/**
 * De `FiltroColumnaGuias` (forestal, pesa en `volumeM3`) a las props del
 * autofiltro COMPARTIDO (`@/components/admin/shared/filtros-columna`, pesa en
 * `peso`) — se traduce una sola vez acá, no en cada lugar que arma las
 * opciones desde `stats.providers/species/permisos`.
 */
function propsDeFiltroColumna(f: FiltroColumnaGuias) {
  return {
    value: Array.isArray(f.value) ? f.value : f.value ? [f.value] : undefined,
    options: f.options.map((o) => ({ value: o.value, count: o.count, peso: o.volumeM3 })),
    onChange: f.onChange,
    etiqueta: f.etiqueta,
    placeholder: f.placeholder,
  };
}

export interface CtpGuiasTableProps {
  guias: GuiaIngreso<WoodEntry>[];
  loading: boolean;
  period: CtpPeriod;
  /**
   * Especie y Proveedor se filtran desde su cabecera (Brandon, 2026-09-03).
   * Mismo estado `facetas` que el panel «Filtros»: dos lugares, un filtro.
   */
  filtrosColumna?: {
    species?: FiltroColumnaGuias;
    provider?: FiltroColumnaGuias;
    /** El título habilitante (ADR-400). Sus opciones se etiquetan con el
     *  proveedor y la resolución: el código solo no le dice nada a nadie. */
    permiso?: FiltroColumnaGuias & { etiqueta?: (v: string) => string };
  };
  /** Qué columnas opcionales se ven. Sin esto, todas (el estado de siempre). */
  cols?: ColsGuiasVisibles;
  /** Hay algún filtro activo → el vacío significa "no coincide", no "no hay". */
  filtered: boolean;
  /** Qué filtros están puestos, para nombrarlos en el vacío (ADR-352). */
  filtrosActivos?: string[];
  /** Saca todos los filtros. Sin esto, el vacío es un callejón sin salida. */
  onLimpiarFiltros?: () => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  /** Ids de asientos pendientes en la página — los que se pueden marcar. */
  pendingIds: string[];
  busy: string | null;
  rejectingId: string | null;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onStartReject: (id: string) => void;
  onCancelReject: () => void;
  onConfirmReject: (id: string) => void;
  onValidate: (id: string) => void;
  /** Valida TODOS los asientos pendientes de la guía, de una. */
  onValidarGuia: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Recepciona la guía entera: fecha sus piezas, la fecha y la valida. */
  onRecepcionarGuia: (guia: GuiaIngreso<WoodEntry>) => void;
  onDetail: (entry: WoodEntry) => void;
  onChain: (entry: WoodEntry) => void;
  onDuplicate: (entry: WoodEntry) => void;
  onEdit: (entry: WoodEntry) => void;
  onVerGuia: (entry: WoodEntry) => void;
  /** Abre el papel de la guía —GTF + lista de trozas— en el visor. */
  onVerDocumento: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Abre la FICHA: los casilleros, los asientos, las piezas y el recepcionar. */
  onVerFicha: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Abre el cuadre: la guía declara un volumen y sus piezas suman otro (ADR-353). */
  onCuadrar: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Carga lo que se pagó por la guía, sin pasar por Rentabilidad (ADR-135). */
  onCostear: (guia: GuiaIngreso<WoodEntry>) => void;
  sort: CtpSort;
  onSort: (field: CtpSortField) => void;
}

export default function CtpGuiasTable(props: CtpGuiasTableProps) {
  /* Las columnas que el operador dejó prendidas. Sin el prop, todas. */
  const cols = props.cols ?? COLS_GUIAS_DEFECTO;

  const {
    guias,
    loading,
    period,
    filtered,
    filtrosActivos,
    onLimpiarFiltros,
    selectedIds,
    setSelectedIds,
    pendingIds,
    sort,
    onSort,
    onDetail,
  } = props;

  const { indice: fotosEspecie } = useEspeciesFotos();
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const actionProps = {
    busy: props.busy,
    rejectingId: props.rejectingId,
    rejectReason: props.rejectReason,
    setRejectReason: props.setRejectReason,
    onStartReject: props.onStartReject,
    onCancelReject: props.onCancelReject,
    onConfirmReject: props.onConfirmReject,
    onValidate: props.onValidate,
    onDetail,
    onChain: props.onChain,
    onDuplicate: props.onDuplicate,
    onEdit: props.onEdit,
  };

  /** Marcar la guía marca TODOS sus asientos pendientes: la acción en lote
   *  trabaja sobre asientos, pero el operador eligió un papel. */
  const pendientesDe = (g: GuiaIngreso<WoodEntry>) =>
    g.lineas.filter((l) => l.status === "pendiente").map((l) => l.id);
  const marcada = (g: GuiaIngreso<WoodEntry>) => {
    const ids = pendientesDe(g);
    return ids.length > 0 && ids.every((id) => selectedIds.includes(id));
  };
  const alternarGuia = (g: GuiaIngreso<WoodEntry>, checked: boolean) => {
    const ids = pendientesDe(g);
    setSelectedIds((prev) => (checked ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))));
  };
  const alternarDetalle = (clave: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const totalPagina = guias.reduce(
    (a, g) => ({ vol: a.vol + g.volumenM3, pz: a.pz + g.piezas, lineas: a.lineas + g.lineas.length }),
    { vol: 0, pz: 0, lineas: 0 },
  );

  return (
    <>
      <span id="ctp-select-all-label" className="sr-only">
        Seleccionar todos los ingresos pendientes de esta página
      </span>

      {/* ── Desktop (≥640px) ── */}
      <div className="relative hidden sm:block">
        <div
          className={`overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${
            guias.length > 12 ? "max-h-[75vh] overflow-y-auto" : ""
          }`}
        >
          <DataTable className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)] text-left">
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-labelledby="ctp-select-all-label"
                    disabled={pendingIds.length === 0}
                    checked={pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id))}
                    onChange={(e) => setSelectedIds(e.target.checked ? pendingIds : [])}
                    className="h-4 w-4 accent-[var(--brand-ink)]"
                  />
                </Th>
                <Th className="w-16">N° libro</Th>
                <ThSort field="entryDate" sort={sort} onSort={onSort}>Fecha</ThSort>
                {cols.tipoDoc && <Th>Tipo</Th>}
                {cols.documento && <Th>Documento</Th>}
                {cols.fechaGuia && <Th>Fecha del documento</Th>}
                {cols.sniffs && <Th>N° SNIFFS</Th>}
                {cols.proveedor && (
                  <ThSort field="providerName" sort={sort} onSort={onSort} filtro={props.filtrosColumna?.provider}>
                    Proveedor
                  </ThSort>
                )}
                {/* El permiso salió de la celda del proveedor y es columna
                    propia (Brandon, 2026-09-08): es el dato por el que se
                    filtra y se declara, no una nota al pie de otro. */}
                {cols.permiso && (
                  <Th>
                    N° Permiso
                    {props.filtrosColumna?.permiso && (
                      <FiltroColumnaMulti label="permiso" {...propsDeFiltroColumna(props.filtrosColumna.permiso)} />
                    )}
                  </Th>
                )}
                {cols.origen && <Th>Origen</Th>}
                {cols.recepcion && <Th>Recepción</Th>}
                {cols.producto && <Th>Producto</Th>}
                {/* Ya no es «la» especie: es la lista de lo que trae el papel. */}
                <ThSort field="speciesCommonName" sort={sort} onSort={onSort} filtro={props.filtrosColumna?.species}>Especies de la guía</ThSort>
                <ThSort field="volumeM3" sort={sort} onSort={onSort} align="right">Cantidad</ThSort>
                {cols.piezas && <Th className="text-right">Piezas</Th>}
                {cols.trozas && <Th className="text-right">Trozas</Th>}
                {cols.unidad && <Th>Unidad</Th>}
                {cols.costo && <Th className="text-right">Valorizado</Th>}
                {cols.registro && <Th>Registró</Th>}
                {cols.estado && <Th>Estado</Th>}
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {guias.map((g) => {
                const tarde = g.lineas.some((l) => estaFueraDePlazo(l));
                const abierta = abiertas.has(g.clave);
                const pendientes = pendientesDe(g);
                const unaSola = g.lineas.length === 1;
                const primera = g.lineas[0];
                return (
                  <FilaGuia
                    key={g.clave}
                    guia={g}
                    abierta={abierta}
                    tarde={tarde}
                    marcada={marcada(g)}
                    pendientes={pendientes}
                    unaSola={unaSola}
                    primera={primera}
                    cols={cols}
                    fotosEspecie={fotosEspecie}
                    actionProps={actionProps}
                    onVerGuia={props.onVerGuia}
                    onVerDocumento={props.onVerDocumento}
                    onVerFicha={props.onVerFicha}
                    onCuadrar={props.onCuadrar}
                    onValidarGuia={props.onValidarGuia}
                    onRecepcionarGuia={props.onRecepcionarGuia}
                    onCostear={props.onCostear}
                    onAlternarDetalle={() => alternarDetalle(g.clave)}
                    onAlternarMarca={(v) => alternarGuia(g, v)}
                    onDetail={onDetail}
                  />
                );
              })}
            </tbody>
            {guias.length > 0 && (
              <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <tr>
                  {/* El colSpan cuenta las columnas VIVAS: con una apagada, un
                      número fijo corría el total una celda y el m³ caía bajo
                      «Estado». */}
                  {/* Las CUATRO fijas de la izquierda —casilla, N° de libro, fecha
                      y especies— más las opcionales que estén prendidas. Con 3
                      el total caía una celda a la izquierda y el m³ terminaba
                      bajo «Estado» (visto en pantalla, no por el tipo). */}
                  <td colSpan={4 + cuantas(COLS_IZQUIERDA, cols)} className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                    {guias.length} guía{guias.length === 1 ? "" : "s"} en pantalla · {totalPagina.lineas} asiento
                    {totalPagina.lineas === 1 ? "" : "s"} del libro
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtM3(totalPagina.vol)}{" "}
                      <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                    </div>
                    <div className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {totalPagina.pz} piezas
                    </div>
                  </td>
                  <td colSpan={1 + cuantas(COLS_DERECHA, cols)} />
                </tr>
              </tfoot>
            )}
          </DataTable>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-2xl bg-linear-to-l from-[var(--surface-raised)] to-transparent"
        />
      </div>

      {/* ── Mobile (<640px) ── */}
      {guias.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {guias.map((g) => (
            <CtpGuiaCardMobile
              key={g.clave}
              guia={g}
              fotosEspecie={fotosEspecie}
              marcada={marcada(g)}
              onAlternarMarca={(v) => alternarGuia(g, v)}
              onDetail={onDetail}
              onValidarGuia={props.onValidarGuia}
              onRecepcionarGuia={props.onRecepcionarGuia}
              busy={props.busy}
            />
          ))}
          <p className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
            {guias.length} guías · {fmtM3(totalPagina.vol)} m³ · {totalPagina.pz} piezas
          </p>
        </div>
      )}

      {!loading && guias.length === 0 && (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">
            {filtered ? "Ninguna guía coincide con el filtro." : `Sin ingresos en ${period.label}.`}
          </p>
          {/* Con filtro puesto, el vacío NOMBRA lo que está filtrando y da el
              botón para sacarlo (ADR-352): sin eso, el operador que acaba de
              recepcionar una guía cree que no se guardó. */}
          {filtered ? (
            <>
              {filtrosActivos && filtrosActivos.length > 0 && (
                <p className="mt-1 text-sm">
                  Filtrando por <b className="text-[var(--text-secondary)]">{filtrosActivos.join(" · ")}</b>.
                </p>
              )}
              {onLimpiarFiltros && (
                <button
                  type="button"
                  onClick={onLimpiarFiltros}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                >
                  Quitar los filtros y ver todo
                </button>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm">
              {period.from
                ? 'Puede haber registros fuera de este período: elige "Todo el histórico" arriba, o registra uno con "Nuevo ingreso".'
                : 'Haz click en "Nuevo ingreso" para registrar el primer movimiento de madera.'}
            </p>
          )}
        </div>
      )}

      {loading && <TablaSkeleton filas={5} columnas={8} />}
    </>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────

type ActionProps = React.ComponentProps<typeof CtpEntryActions> extends infer P
  ? P extends { entry: unknown }
    ? Omit<P, "entry" | "onVerGuia">
    : never
  : never;

function FilaGuia({
  guia,
  abierta,
  tarde,
  marcada,
  pendientes,
  unaSola,
  primera,
  cols,
  fotosEspecie,
  actionProps,
  onVerGuia,
  onVerDocumento,
  onVerFicha,
  onCuadrar,
  onValidarGuia,
  onRecepcionarGuia,
  onCostear,
  onAlternarDetalle,
  onAlternarMarca,
  onDetail,
}: {
  guia: GuiaIngreso<WoodEntry>;
  abierta: boolean;
  tarde: boolean;
  marcada: boolean;
  pendientes: string[];
  unaSola: boolean;
  primera: WoodEntry;
  cols: ColsGuiasVisibles;
  fotosEspecie: ReturnType<typeof useEspeciesFotos>["indice"];
  actionProps: ActionProps;
  onVerGuia: (e: WoodEntry) => void;
  onVerDocumento: (g: GuiaIngreso<WoodEntry>) => void;
  onVerFicha: (g: GuiaIngreso<WoodEntry>) => void;
  onCuadrar: (g: GuiaIngreso<WoodEntry>) => void;
  onValidarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  onRecepcionarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  onCostear: (g: GuiaIngreso<WoodEntry>) => void;
  onAlternarDetalle: () => void;
  onAlternarMarca: (v: boolean) => void;
  onDetail: (e: WoodEntry) => void;
}) {
  /* Rechazar/anular pide un motivo en la misma celda: mientras se escribe, la
     fila cede el lugar a ese formulario (es el flujo de `CtpEntryActions`). */
  const enRechazo = actionProps.rejectingId === primera.id;

  /**
   * ¿Queda madera de este papel por recibir? Lo contesta la GUÍA y no la
   * pestaña en la que se la esté mirando (2026-09-15).
   *
   * Antes el botón salía sólo con `modoBandeja` —la bandeja con el chip «Por
   * recepcionar» puesto—, así que la misma guía tenía o no tenía «Recepcionar»
   * según desde dónde se llegara: no lo tenía en «GTF ingresadas», ni con el
   * chip «Todas las del período», ni al saltar desde un aviso de Cumplimiento
   * (ese salto limpia el chip a propósito). Y como VALIDAR alcanza para salir
   * de la bandeja (ADR-339) pero no fecha nada, una guía validada a mano se iba
   * al archivo con sus trozas sin fechar y ya no había pantalla donde
   * recibirla — las trozas sin fecha no se pueden llevar a la sierra.
   */
  const faltaRecibir = faltaRecibirMadera(guia);
  const queFalta = loQueFaltaRecibir(guia);
  const sinCosto = !guia.lineas.some(tieneCosto);

  /**
   * Lo que NO se hace en cada guía. Sale del mismo tipo `MenuAccion` que la
   * barra de la vista: una sola forma de listar acciones en todo el módulo.
   */
  const masAcciones: MenuAccion[] = [
    {
      id: "documento",
      label: "Documento del expediente",
      hint: "El papel de la guía tal como se archiva (ADR-348)",
      icon: FileText,
      onSelect: () => onVerDocumento(guia),
    },
    ...(primera.serforGtf
      ? [{
          id: "gtf",
          label: "Ver la GTF de SERFOR",
          hint: "La ficha oficial con su lista de trozas — imprimir o descargar",
          icon: FileText,
          onSelect: () => onVerGuia(primera),
        } satisfies MenuAccion]
      : []),
    {
      /* El costo, en la fila de la guía (ADR-135). Vivía sólo detrás de
         recepcionar y dentro de Rentabilidad: medido el 2026-09-15, **24 de 24
         asientos sin costo** y 197,65 m³ sin valorizar. */
      id: "costo",
      label: sinCosto ? "Cargar lo que costó" : "Corregir lo que costó",
      hint: sinCosto
        ? "Sin costo, esta madera no puede mostrar margen"
        : "Reescribe el costo de los asientos de la guía",
      icon: Coins,
      onSelect: () => onCostear(guia),
    },
    ...(!unaSola
      ? [{
          id: "asientos",
          label: abierta ? "Ocultar los asientos" : `Ver los ${guia.lineas.length} asientos`,
          hint: "Esta guía entró al libro en varias líneas",
          icon: ChevronRight,
          onSelect: onAlternarDetalle,
        } satisfies MenuAccion]
      : []),
    ...(unaSola && actionProps.onChain && (primera.status === "validado" || primera.status === "procesado")
      ? [{
          id: "cadena",
          label: "Cadena de custodia",
          hint: "A dónde fue esta madera: corridas y despachos",
          icon: Share2,
          onSelect: () => actionProps.onChain?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && actionProps.onDuplicate
      ? [{
          id: "duplicar",
          label: "Nuevo ingreso con estos datos",
          hint: "Mismo proveedor, origen y especie",
          icon: Copy,
          onSelect: () => actionProps.onDuplicate?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && actionProps.onEdit && primera.status === "pendiente"
      ? [{
          id: "editar",
          label: "Corregir los datos",
          icon: Pencil,
          onSelect: () => actionProps.onEdit?.(primera),
        } satisfies MenuAccion]
      : []),
    ...(unaSola && (primera.status === "pendiente" || primera.status === "validado")
      ? [{
          id: "rechazar",
          label: primera.status === "validado" ? "Anular el ingreso" : "Rechazar el ingreso",
          hint: "Pide un motivo: queda en el historial",
          icon: ThumbsDown,
          tone: "danger" as const,
          onSelect: () => actionProps.onStartReject(primera.id),
        } satisfies MenuAccion]
      : []),
  ];

  return (
    <>
      <tr
        className={`border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-canvas)]/40 ${
          marcada ? "bg-primary/5" : ""
        }`}
      >
        <Td>
          {pendientes.length > 0 && (
            <input
              type="checkbox"
              aria-label={`Seleccionar la guía ${guia.gtfNumber}`}
              checked={marcada}
              onChange={(ev) => onAlternarMarca(ev.target.checked)}
              className="h-4 w-4 accent-[var(--brand-ink)]"
            />
          )}
        </Td>
        <Td>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {guia.libroDesde == null
              ? "—"
              : guia.libroHasta != null && guia.libroHasta !== guia.libroDesde
                ? `${guia.libroDesde}–${guia.libroHasta}`
                : guia.libroDesde}
          </span>
          {!unaSola && (
            <div className="mt-0.5 whitespace-nowrap text-xs text-[var(--text-tertiary)]">
              {guia.lineas.length} asientos
            </div>
          )}
        </Td>
        <Td>
          <div className="whitespace-nowrap font-bold text-[var(--text-primary)]">{formatDate(guia.entryDate)}</div>
          {tarde && (
            <div
              title={`Registrada ${diasDeRegistro(primera)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS} días hábiles)`}
              className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            >
              fuera de plazo
            </div>
          )}
        </Td>
        {cols.tipoDoc && (
          <Td>
            <span className="whitespace-nowrap rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              {guia.docType || "GTF"}
            </span>
            {guia.gtfSeries && (
              <div className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">Serie {guia.gtfSeries}</div>
            )}
          </Td>
        )}
        {cols.documento && (
          <Td>
            <button
              type="button"
              onClick={() => onDetail(primera)}
              title={guia.gtfNumber}
              className="block max-w-32 truncate text-left font-mono text-sm font-bold text-[var(--brand-ink)] underline-offset-2 hover:underline dark:text-[var(--text-primary)]"
            >
              {guia.gtfNumber}
            </button>
            <div className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {guia.docType || "GTF"}
              {guia.gtfSeries ? ` · ${guia.gtfSeries}` : ""}
            </div>
            {guia.gtfDate && <div className="text-sm text-[var(--text-tertiary)]">{formatDate(guia.gtfDate)}</div>}
          </Td>
        )}
        {cols.fechaGuia && (
          <Td>
            {guia.gtfDate ? (
              <span className="whitespace-nowrap font-medium text-[var(--text-primary)]">{formatDate(guia.gtfDate)}</span>
            ) : (
              <span className="text-sm text-[var(--text-tertiary)]">—</span>
            )}
          </Td>
        )}
        {/* El N° de constancia del SNIFFS: con él se vuelve a la guía en la base
            de SERFOR, y es lo que pide una fiscalización que quiere contrastar. */}
        {cols.sniffs && (
          <Td>
            {primera.serforNumeroRegistro ? (
              <span className="font-mono text-sm text-[var(--text-primary)]">{primera.serforNumeroRegistro}</span>
            ) : (
              <span className="text-sm text-[var(--text-tertiary)]">—</span>
            )}
          </Td>
        )}
        {/* Sólo el proveedor (Brandon, 2026-09-08): el contrato y la resolución
            se mudaron a la columna «N° Permiso», que es donde se filtran. Tres
            datos apilados en una celda hacían leer el permiso como parte del
            nombre de la empresa. */}
        {cols.proveedor && (
          <Td>
            <div title={guia.providerName} className="max-w-36 truncate font-medium text-[var(--text-primary)]">
              {guia.providerName}
            </div>
            {/* La guía importada como existencia de apertura no trae proveedor:
                el importador escribe siempre este texto (`ctp-serfor-a-libro.ts`),
                así que alcanza para distinguirla de una GTF recepcionada de verdad. */}
            {guia.providerName === PROVEEDOR_INVENTARIO_APERTURA ? (
              <span
                title="Existencia de apertura: entró por el importador del libro, no es una GTF recepcionada"
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
              >
                <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
              </span>
            ) : (
              <div className="text-sm text-[var(--text-tertiary)]">{originLabel(primera.originType)}</div>
            )}
          </Td>
        )}
        {/* Contrato (9) y N° de Resolución (5) del formato LO-CTP Sección 1, en
            su propia columna: es lo que ampara la madera y por lo que pregunta
            un fiscalizador. */}
        {cols.permiso && (
          <Td>
            {guia.originCode ? (
              <div className="max-w-40 truncate font-mono text-sm font-bold text-[var(--text-primary)]" title={guia.originCode}>
                {guia.originCode}
              </div>
            ) : (
              <span className="text-sm text-[var(--text-tertiary)]">—</span>
            )}
            {guia.originSourceNumber && (
              <div className="truncate font-mono text-xs text-[var(--text-tertiary)]" title={`Resolución ${guia.originSourceNumber}`}>
                Res. {guia.originSourceNumber}
              </div>
            )}
          </Td>
        )}
        {/* De dónde salió la madera. `originLabel` traduce el tipo (concesión,
            predio, plantación); región y distrito vienen del asiento. */}
        {cols.origen && (
          <Td>
            <div className="whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">
              {primera.originRegion || primera.originDistrict ? (
                [primera.originRegion, primera.originDistrict].filter(Boolean).join(" · ")
              ) : (
                <span className="text-[var(--text-tertiary)]">—</span>
              )}
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">{originLabel(primera.originType)}</div>
          </Td>
        )}
        {/* Cuándo LLEGÓ la madera a planta (ADR-335) — distinta de la fecha del
            asiento y de la del papel. Si falta algo por recibir, lo dice acá
            mismo en vez de esperar a que se abra la guía. */}
        {cols.recepcion && (
          <Td>
            {primera.fechaRecepcion ? (
              <div className="whitespace-nowrap font-medium text-[var(--text-primary)]">
                {formatDate(primera.fechaRecepcion)}
              </div>
            ) : (
              <span className="text-sm text-[var(--text-tertiary)]">sin recepcionar</span>
            )}
            {faltaRecibirMadera(guia) && (
              <div
                title={loQueFaltaRecibir(guia).join(" · ")}
                className="mt-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                falta recibir
              </div>
            )}
          </Td>
        )}
        {cols.producto && (
          <Td>
            <span className="whitespace-nowrap rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
              {[...new Set(guia.lineas.map((l) => productLabel(l.productType)))].join(" · ") || "—"}
            </span>
          </Td>
        )}
        <Td>
          {/* Todas las especies del papel, con su volumen: es lo que el operador
              chequea contra la pila. Con una sola, se lee como antes. */}
          <button
            type="button"
            onClick={onAlternarDetalle}
            aria-expanded={abierta}
            className="flex w-full items-start gap-2 text-left"
            title={unaSola ? "Ver el asiento del libro" : `Ver los ${guia.lineas.length} asientos del libro`}
          >
            <ChevronRight
              className={`mt-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "rotate-90" : ""}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {guia.especies.slice(0, 3).map((e) => (
                <span key={e.comun} className="mr-2 inline-flex items-center gap-1.5 whitespace-nowrap">
                  <EspecieFoto especie={e.comun} indice={fotosEspecie} />
                  <span className="font-medium text-[var(--text-primary)]">{e.comun}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {fmtM3(e.volumenM3)} m³
                  </span>
                  {e.cites && (
                    <span
                      title="Especie protegida CITES"
                      className="rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"
                    >
                      CITES
                    </span>
                  )}
                </span>
              ))}
              {guia.especies.length > 3 && (
                <span className="text-xs font-bold text-[var(--text-tertiary)]">
                  +{guia.especies.length - 3} especies más
                </span>
              )}
              <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">
                {guia.especies.length === 1
                  ? productLabel(primera.productType)
                  : `${guia.especies.length} especies · ${[...new Set(guia.lineas.map((l) => productLabel(l.productType)))].join(" · ")}`}
              </span>
            </span>
          </button>
        </Td>
        <Td className="text-right">
          <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
            {fmtM3(guia.volumenM3)} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
          </div>
          <div className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
            {guia.trozasCount > 0
              ? `${guia.trozasCount} ${guia.trozasCount === 1 ? "troza" : "trozas"}`
              : guia.piezas > 0
                ? `${guia.piezas} ${guia.piezas === 1 ? "pieza" : "piezas"}`
                : "sin detalle de piezas"}
          </div>
          {/* El descuadre de la GUÍA entera (ADR-353): con varios asientos, el
              chip por línea no se veía y el problema aparecía recién al
              consumir —«esta guía sólo tiene 4.161 m³ sin consumir»—.
              Y es un BOTÓN: el aviso que no lleva a ningún lado se lee como
              «tienes un problema y arreglate». */}
          {(() => {
            const c = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
            if (!descuadra(c)) return null;
            const cuantos = unaSola ? "" : ` entre sus ${guia.lineas.length} asientos`;
            return (
              <button
                type="button"
                onClick={() => onCuadrar(guia)}
                title={`La guía declara ${fmtM3(guia.volumenM3)} m³${cuantos} y sus ${guia.trozasCount} piezas suman ${fmtM3(guia.trozasM3 ?? 0)} m³. Abre el cuadre para ver los dos lados del documento.`}
                className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] underline-offset-2 hover:underline dark:text-[var(--data-warning-500)]"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                {c.aviso} · cuadrar
              </button>
            );
          })()}
        </Td>
        {cols.piezas && (
          <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
            {guia.piezas > 0 ? guia.piezas : <span className="text-[var(--text-tertiary)]">—</span>}
          </Td>
        )}
        {/* Lo CARGADO en el detalle, que puede no coincidir con lo que declara
            el papel — el descuadre ya se avisa en «Cantidad»; acá se ve el dato
            crudo de los dos lados. */}
        {cols.trozas && (
          <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
            {guia.trozasCount > 0 ? (
              <>
                {guia.trozasCount}
                {guia.trozasM3 != null && (
                  <div className="text-xs text-[var(--text-tertiary)]">{fmtM3(guia.trozasM3)} m³</div>
                )}
              </>
            ) : (
              <span className="text-[var(--text-tertiary)]">—</span>
            )}
          </Td>
        )}
        {cols.unidad && (
          <Td className="text-sm text-[var(--text-secondary)]">
            {primera.unit ? (UNIT_LABELS[primera.unit] ?? primera.unit) : <span className="text-[var(--text-tertiary)]">—</span>}
          </Td>
        )}
        {/* Lo que se pagó por esta madera (ADR-135). Suma los asientos de la
            guía: valorizar una línea y no la otra dejaba media guía sin precio
            y no se notaba desde la bandeja. */}
        {cols.costo && (
          <Td className="text-right font-mono tabular-nums">
            {(() => {
              const conCosto = guia.lineas.filter((l) => tieneCosto(l));
              if (conCosto.length === 0) return <span className="text-sm text-[var(--text-tertiary)]">sin valorizar</span>;
              const total = conCosto.reduce((n, l) => n + Number(l.costoTotal ?? 0), 0);
              const moneda = conCosto[0]?.moneda === "USD" ? "US$" : "S/";
              return (
                <>
                  <div className="whitespace-nowrap font-bold text-[var(--text-primary)]">
                    {moneda} {formatNumber(total, 2)}
                  </div>
                  {conCosto.length < guia.lineas.length && (
                    <div className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      {conCosto.length} de {guia.lineas.length} asientos
                    </div>
                  )}
                </>
              );
            })()}
          </Td>
        )}
        {cols.registro && (
          <Td className="text-sm text-[var(--text-secondary)]">
            <div className="max-w-28 truncate" title={primera.createdBy}>{primera.createdBy || "—"}</div>
            {primera.validatedBy && (
              <div className="truncate text-xs text-[var(--text-tertiary)]" title={`Validó ${primera.validatedBy}`}>
                validó {primera.validatedBy}
              </div>
            )}
          </Td>
        )}
        {cols.estado && (
          <Td>
            {guia.statusMixto ? (
              /* Un estado por asiento: decir «validada» porque la primera lo está
                 esconde justo la línea que hay que mirar. */
              <div className="flex flex-wrap gap-1">
                {Object.entries(guia.porEstado).map(([estado, n]) => (
                  <span key={estado} className="whitespace-nowrap">
                    <StatusBadge status={estado as WoodEntryStatus} />
                    <span className="ml-1 text-xs text-[var(--text-tertiary)]">×{n}</span>
                  </span>
                ))}
              </div>
            ) : (
              <StatusBadge status={guia.status as WoodEntryStatus} />
            )}
            {guia.trozasCount > 0 && (
              <div className="mt-1 whitespace-nowrap text-xs text-[var(--text-tertiary)]">
                {guia.trozasDecididas}/{guia.trozasCount} piezas recibidas
              </div>
            )}
          </Td>
        )}
        <Td className="text-right">
          {/* Una sola línea (2026-08).
              Las acciones envolvían a DOS filas —tres botones con texto arriba,
              cinco íconos y el «Validar» abajo— y con eso cada guía medía 121px:
              en una pantalla de portátil entraban cinco. Ahora queda a la vista
              lo que se hace en cada guía (abrir su ficha y el acto que toca
              ahora) y el resto entra al mismo menú «⋯» que ya ordena la barra de
              la vista. El flujo no cambia: cambia cuántas guías se ven de una. */}
          {enRechazo ? (
            <CtpEntryActions
              entry={primera}
              {...actionProps}
              onVerGuia={primera.serforGtf ? onVerGuia : undefined}
            />
          ) : (
            <div className="flex items-center justify-end gap-1">
              {/* La FICHA es donde se revisa y se recibe (ADR-350): queda visible. */}
              <BotonGuia icon={Eye} texto="Ficha" onClick={() => onVerFicha(guia)} />
              {faltaRecibir ? (
                <BotonGuia
                  icon={PackageCheck}
                  tono="accion"
                  texto={unaSola ? "Recepcionar" : "Recepcionar guía"}
                  title={`Fecha la guía y sus piezas el día que bajó del camión${queFalta.length > 0 ? ` — hoy le falta: ${queFalta.join(", ")}` : ""}. Sin eso la madera no aparece en Consumos.`}
                  onClick={() => onRecepcionarGuia(guia)}
                  disabled={Boolean(actionProps.busy)}
                />
              ) : pendientes.length > 0 ? (
                <BotonGuia
                  icon={CheckCheck}
                  tono="accion"
                  texto={unaSola ? "Validar" : `Validar ${pendientes.length}`}
                  onClick={() => (unaSola ? actionProps.onValidate(primera.id) : onValidarGuia(guia))}
                  disabled={Boolean(actionProps.busy)}
                />
              ) : null}
              <ActionMenu
                label="Más"
                title="Documento, cadena y el resto de las acciones de esta guía"
                icon={MoreHorizontal}
                size="xs"
                actions={masAcciones}
                compactoEnMovil
              />
            </div>
          )}
        </Td>
      </tr>

      {abierta &&
        guia.lineas.map((l) => (
          <tr key={l.id} className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60">
            <Td />
            <Td>
              <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">{l.libroNro ?? "—"}</span>
            </Td>
            <Td className="text-sm text-[var(--text-tertiary)]">{formatDate(l.entryDate)}</Td>
            <Td className="text-sm text-[var(--text-tertiary)]">asiento del libro</Td>
            <Td className="text-sm text-[var(--text-tertiary)]">{l.originCode ?? "—"}</Td>
            <Td>
              <span className="font-medium text-[var(--text-primary)]">{l.speciesCommonName}</span>
              {l.speciesScientificName && (
                <span className="ml-2 text-xs italic text-[var(--text-tertiary)]">{l.speciesScientificName}</span>
              )}
              <span className="ml-2 rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                {productLabel(l.productType)}
              </span>
            </Td>
            <Td className="text-right">
              <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(Number(l.volumeM3))} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
              </div>
              <DescuadreChip entry={l} />
            </Td>
            <Td>
              <StatusBadge status={l.status} />
            </Td>
            <Td className="text-right">
              <CtpEntryActions entry={l} {...actionProps} onVerGuia={l.serforGtf ? onVerGuia : undefined} />
            </Td>
          </tr>
        ))}
    </>
  );
}

/**
 * Botón de la fila. `h-8` para que la altura de la guía la mande el DATO y no el
 * control; `tono="accion"` marca el acto que toca ahora (validar, recepcionar),
 * que es el único que se distingue del resto.
 */
function BotonGuia({
  icon: Icon,
  texto,
  onClick,
  disabled,
  tono = "neutro",
  title,
}: {
  icon: typeof PackageCheck;
  texto: string;
  onClick: () => void;
  disabled?: boolean;
  tono?: "neutro" | "accion";
  /** Qué hace de verdad, cuando el texto del botón no alcanza para decirlo. */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? texto}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2 text-xs font-bold transition-colors disabled:opacity-40 ${
        tono === "accion"
          ? "border-[var(--data-success-600)] bg-[var(--data-success-600)] text-white hover:opacity-90"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {texto}
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}

function ThSort({
  field,
  sort,
  onSort,
  align = "left",
  children,
  /** El autofiltro debajo del título: se ordena Y se acota desde la misma cabecera. */
  filtro,
}: {
  field: CtpSortField;
  sort: CtpSort;
  onSort: (f: CtpSortField) => void;
  align?: "left" | "right";
  children: React.ReactNode;
  filtro?: FiltroColumnaGuias;
}) {
  const activo = sort.by === field;
  const Icono = !activo ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={activo ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 align-top font-bold text-[var(--text-primary)] ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        title={`Ordenar por ${String(children)}`}
        className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 font-bold transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
          align === "right" ? "flex-row-reverse" : ""
        } ${activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
      >
        {children}
        <Icono className={`h-3.5 w-3.5 ${activo ? "" : "opacity-40"}`} aria-hidden="true" />
      </button>
      {/* Título arriba, autofiltro debajo — igual que en las otras tablas del libro. */}
      {filtro && <FiltroColumnaMulti label={String(children)} {...propsDeFiltroColumna(filtro)} />}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
