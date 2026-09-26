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
 *
 * La fila vive en `CtpGuiaFila.tsx`, la tarjeta del celular en
 * `CtpGuiaCardMobile.tsx`, el menú «Más» de las dos en `ctp-guia-acciones.ts` y
 * las columnas elegibles en `ctp-guias-columnas.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, TreePine } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CtpSort, CtpSortField } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { guiaTildada, tildeDeGuia } from "@/lib/forestal/recepcion-bloque";
import { type FacetaOpcion } from "./ctp-filtros-panel";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import CtpGuiaCardMobile from "./CtpGuiaCardMobile";
import FilaGuia from "./CtpGuiaFila";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { COLS_GUIAS_DEFECTO, ORDEN_GUIAS_DEFECTO, guiasVisiblesEnOrden, type ColGuia, type ColsGuiasVisibles } from "./ctp-guias-columnas";
import { EnOrden, type UseOrdenColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { TablaSkeleton, type WoodEntry } from "./ctp-shared";

/* Las columnas se definen en `ctp-guias-columnas.ts`; se re-exportan acá
   porque la vista las importaba de la tabla. */
export {
  COLUMNAS_GUIAS_OPCIONALES,
  type ColGuiaOpcional,
  type ColsGuiasVisibles,
} from "./ctp-guias-columnas";

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
  /** Qué columnas opcionales se ven. Sin esto, las de por defecto. */
  cols?: ColsGuiasVisibles;
  /**
   * El orden que dejó el operador arrastrando los títulos (2026-09-26). Sin
   * esto, el de fábrica y sin arrastre.
   */
  ordenCols?: Pick<UseOrdenColumnasResult, "orden" | "refCabecera">;
  /**
   * El autofiltro de cada columna que no es especie/proveedor/permiso: lo arma
   * la vista (`filtrosDeCabeceraGuias`), que es dueña de esos estados; la tabla
   * sólo lo pone bajo su título.
   */
  filtrosCabecera?: Partial<Record<ColGuia, React.ReactNode>>;
  /** Hay algún filtro activo → el vacío significa "no coincide", no "no hay". */
  filtered: boolean;
  /** Qué filtros están puestos, para nombrarlos en el vacío (ADR-352). */
  filtrosActivos?: string[];
  /** Saca todos los filtros. Sin esto, el vacío es un callejón sin salida. */
  onLimpiarFiltros?: () => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
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
  /** Corrige la fecha de llegada de una guía ya recibida (ADR-434). Sin esto, no hay entrada en el menú. */
  onCorregirRecepcion?: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Lleva cada troza a la fila de su especie, sólo en ESTA guía (ADR-435). */
  onAcomodar?: (guia: GuiaIngreso<WoodEntry>) => void;
  /** Etiquetas QR de las trozas de esta guía que siguen en el patio (ADR-436). */
  onImprimirEtiquetas?: (guia: GuiaIngreso<WoodEntry>) => void;
  sort: CtpSort;
  onSort: (field: CtpSortField) => void;
}

/**
 * ¿La tabla desborda a lo ancho? El degradé de la derecha avisa «hay más
 * columnas», y dibujado siempre tapaba el menú «Más» de cada fila aunque no
 * hubiera nada escondido.
 *
 * Se mide la caja de scroll PROPIA de `DataTable` (su `<div overflow-x-auto>`,
 * primer hijo de la caja de afuera): es la que desborda, no la de afuera.
 */
function useDesbordaAncho() {
  const [desborda, setDesborda] = useState(false);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    const caja = (el.firstElementChild as HTMLElement | null) ?? el;
    const medir = () => setDesborda(caja.scrollWidth > caja.clientWidth + 1);
    obs.current = new ResizeObserver(medir);
    obs.current.observe(caja);
    const tabla = caja.querySelector("table");
    if (tabla) obs.current.observe(tabla);
    medir();
  }, []);
  useEffect(() => () => obs.current?.disconnect(), []);
  return { ref, desborda };
}

export default function CtpGuiasTable(props: CtpGuiasTableProps) {
  /* Las columnas que el operador dejó prendidas. Sin el prop, las de defecto. */
  const cols = props.cols ?? COLS_GUIAS_DEFECTO;
  const orden = props.ordenCols?.orden ?? ORDEN_GUIAS_DEFECTO;
  const fc = props.filtrosCabecera ?? {};
  /* El pie pone el m³ bajo «Cantidad» esté donde esté: cuenta cuántas
     visibles quedan a cada lado en el MISMO orden que la cabecera. */
  const visibles = guiasVisiblesEnOrden(orden, cols);
  const antesDeCantidad = visibles.indexOf("cantidad");
  const despuesDeCantidad = visibles.length - antesDeCantidad - 1;

  const {
    guias,
    loading,
    period,
    filtered,
    filtrosActivos,
    onLimpiarFiltros,
    selectedIds,
    setSelectedIds,
    sort,
    onSort,
    onDetail,
  } = props;

  const { indice: fotosEspecie } = useEspeciesFotos();
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const { ref: cajaRef, desborda } = useDesbordaAncho();

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

  /** Marcar la guía marca sus asientos: la acción en lote trabaja sobre
   *  asientos, pero el operador eligió un papel. UN tilde para recibir,
   *  validar y rechazar (`tildeDeGuia`, 2026-09-26): una guía validada a mano y
   *  sin recibir también se tilda. */
  const tildes = new Map(guias.map((g) => [g.clave, tildeDeGuia(g)]));
  const marcada = (g: GuiaIngreso<WoodEntry>) => guiaTildada(g, selectedIds);
  const alternarGuia = (g: GuiaIngreso<WoodEntry>, checked: boolean) => {
    const ids = tildes.get(g.clave)?.ids ?? [];
    setSelectedIds((prev) => (checked ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))));
  };
  const motivoSinTilde = (g: GuiaIngreso<WoodEntry>) => tildes.get(g.clave)?.motivo ?? null;
  /* «Todas» = las tildables EN PANTALLA; las demás no se tocan. */
  const tildables = guias.filter((g) => (tildes.get(g.clave)?.ids.length ?? 0) > 0);
  const tildadas = tildables.filter(marcada).length;
  const todas = tildables.length > 0 && tildadas === tildables.length;
  const alternarTodas = (checked: boolean) => {
    const ids = tildables.flatMap((g) => tildes.get(g.clave)?.ids ?? []);
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

  const leyendaPie = (
    <>
      {guias.length} guía{guias.length === 1 ? "" : "s"} en pantalla · {totalPagina.lineas} asiento
      {totalPagina.lineas === 1 ? "" : "s"} del libro
    </>
  );

  /* Lo mismo que necesitan la fila y la tarjeta: una lista, dos superficies. */
  const manejadores = {
    onVerGuia: props.onVerGuia,
    onVerDocumento: props.onVerDocumento,
    onVerFicha: props.onVerFicha,
    onCuadrar: props.onCuadrar,
    onValidarGuia: props.onValidarGuia,
    onRecepcionarGuia: props.onRecepcionarGuia,
    onCostear: props.onCostear,
    onCorregirRecepcion: props.onCorregirRecepcion,
    onAcomodar: props.onAcomodar,
    onImprimirEtiquetas: props.onImprimirEtiquetas,
  };

  return (
    <>
      <span id="ctp-select-all-label" className="sr-only">
        Seleccionar las {tildables.length} guías de esta página que se pueden recibir, validar o rechazar
      </span>

      {/* ── Desktop (≥640px) ── */}
      <div className="relative hidden sm:block">
        <div
          ref={cajaRef}
          className={`overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${
            guias.length > 12 ? "max-h-[75vh] overflow-y-auto" : ""
          }`}
        >
          <DataTable className="w-full text-sm">
            <thead ref={props.ordenCols?.refCabecera} className="sticky top-0 z-10 bg-[var(--surface-sunken)] text-left align-top">
              <tr>
                <Th className="w-8">
                  <input
                    type="checkbox"
                    aria-labelledby="ctp-select-all-label"
                    disabled={tildables.length === 0}
                    checked={todas}
                    ref={(el) => {
                      if (el) el.indeterminate = tildadas > 0 && !todas;
                    }}
                    onChange={(e) => alternarTodas(e.target.checked)}
                    className="h-5 w-5 accent-[var(--brand-ink)]"
                  />
                </Th>
                {/* Las movibles, en el orden que dejó el operador (se arrastran
                    del título; Alt+←/→ con el teclado). Cada una con SU
                    autofiltro debajo (Brandon, 2026-09-26). */}
                <EnOrden
                  orden={orden}
                  celdas={{
                    /* La celda trae también el N° de libro, rotulado («N° 96»). */
                    fecha: (
                      <ThSort col="fecha" field="entryDate" sort={sort} onSort={onSort} extra={fc.fecha}>
                        Fecha
                      </ThSort>
                    ),
                    tipoDoc: cols.tipoDoc && <Th col="tipoDoc" titulo="Tipo" filtro={fc.tipoDoc} />,
                    documento: cols.documento && <Th col="documento" titulo="Documento" filtro={fc.documento} />,
                    fechaGuia: cols.fechaGuia && <Th col="fechaGuia" titulo="Fecha del documento" filtro={fc.fechaGuia} />,
                    sniffs: cols.sniffs && <Th col="sniffs" titulo="N° SNIFFS" filtro={fc.sniffs} />,
                    /* Proveedor y permiso, cada uno en su columna con SU
                       autofiltro (2026-09-26; antes compartían celda). */
                    proveedor: cols.proveedor && (
                      <th
                        data-col="proveedor"
                        aria-sort={sort.by !== "providerName" ? "none" : sort.dir === "asc" ? "ascending" : "descending"}
                        className={`${TH_CLS} align-top`}
                      >
                        <BotonOrden field="providerName" sort={sort} onSort={onSort}>
                          Proveedor
                        </BotonOrden>
                        {props.filtrosColumna?.provider && (
                          <FiltroColumnaMulti label="Proveedor" {...propsDeFiltroColumna(props.filtrosColumna.provider)} />
                        )}
                      </th>
                    ),
                    permiso: cols.permiso && (
                      <Th col="permiso" titulo="N° Permiso">
                        {props.filtrosColumna?.permiso && (
                          <FiltroColumnaMulti label="permiso" {...propsDeFiltroColumna(props.filtrosColumna.permiso)} />
                        )}
                      </Th>
                    ),
                    origen: cols.origen && <Th col="origen" titulo="Origen" filtro={fc.origen} />,
                    recepcion: cols.recepcion && <Th col="recepcion" titulo="Recepción" filtro={fc.recepcion} />,
                    producto: cols.producto && <Th col="producto" titulo="Producto" filtro={fc.producto} />,
                    /* Ya no es «la» especie: es la lista de lo que trae el papel. */
                    especies: (
                      <ThSort col="especies" field="speciesCommonName" sort={sort} onSort={onSort} filtro={props.filtrosColumna?.species}>
                        Especies
                      </ThSort>
                    ),
                    cantidad: (
                      <ThSort col="cantidad" field="volumeM3" sort={sort} onSort={onSort} align="right" extra={fc.cantidad}>
                        Cantidad
                      </ThSort>
                    ),
                    piezas: cols.piezas && <Th col="piezas" titulo="Piezas" filtro={fc.piezas} className="text-right" />,
                    trozas: cols.trozas && <Th col="trozas" titulo="Trozas" filtro={fc.trozas} className="text-right" />,
                    unidad: cols.unidad && <Th col="unidad" titulo="Unidad" filtro={fc.unidad} />,
                    costo: cols.costo && <Th col="costo" titulo="Valorizado" filtro={fc.costo} className="text-right" />,
                    registro: cols.registro && <Th col="registro" titulo="Registró" filtro={fc.registro} />,
                    estado: cols.estado && <Th col="estado" titulo="Estado" filtro={fc.estado} />,
                  }}
                />
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {guias.map((g) => (
                <FilaGuia
                  key={g.clave}
                  guia={g}
                  abierta={abiertas.has(g.clave)}
                  marcada={marcada(g)}
                  motivoSinTilde={motivoSinTilde(g)}
                  cols={cols}
                  orden={orden}
                  fotosEspecie={fotosEspecie}
                  actionProps={actionProps}
                  {...manejadores}
                  onAlternarDetalle={() => alternarDetalle(g.clave)}
                  onAlternarMarca={(v) => alternarGuia(g, v)}
                />
              ))}
            </tbody>
            {guias.length > 0 && (
              <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <tr>
                  {/* El m³ cae bajo «Cantidad» esté donde esté (las columnas se
                      arrastran): lo de antes, en una celda; lo de después, en
                      otra. La leyenda va a la izquierda si hay lugar; con
                      «Cantidad» pegada al borde, a su derecha — en la casilla
                      de marcar sola no entra. */}
                  <td colSpan={1 + antesDeCantidad} className="px-2! py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                    {antesDeCantidad >= 2 && leyendaPie}
                  </td>
                  <td className="px-2! py-2.5 text-right">
                    <div className="whitespace-nowrap font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtM3(totalPagina.vol)}{" "}
                      <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                    </div>
                    <div className="whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]">
                      {totalPagina.pz} piezas
                    </div>
                  </td>
                  <td colSpan={1 + despuesDeCantidad} className="px-2! py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                    {antesDeCantidad < 2 && leyendaPie}
                  </td>
                </tr>
              </tfoot>
            )}
          </DataTable>
        </div>
        {desborda && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-2xl bg-linear-to-l from-[var(--surface-raised)] to-transparent"
          />
        )}
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
              motivoSinTilde={motivoSinTilde(g)}
              onAlternarMarca={(v) => alternarGuia(g, v)}
              actionProps={actionProps}
              {...manejadores}
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

// ─── Cabecera ──────────────────────────────────────────────────────────────

/** `px-2!`: `DataTable` fuerza `px-3` en `thead th` (ver `Td` en `CtpGuiaFila`). */
const TH_CLS = "px-2! py-2.5 font-bold text-[var(--text-primary)]";

/**
 * Un título de columna. Con `col`, la columna se arrastra (`data-col`, lo
 * escucha `useOrdenColumnas` en el `<thead>`); con `filtro`, lleva su
 * autofiltro debajo del título.
 */
function Th({
  children,
  className,
  col,
  titulo,
  filtro,
}: {
  children?: React.ReactNode;
  className?: string;
  col?: ColGuia;
  titulo?: string;
  filtro?: React.ReactNode;
}) {
  return (
    <th data-col={col} className={`${TH_CLS} ${col ? "align-top" : ""} ${className ?? ""}`}>
      {/* Mismo aspecto que los títulos que ordenan (un `<button>` no hereda
          las versalitas del `<thead>`): si no, «DOCUMENTO» gritaba al lado
          de «Fecha». */}
      {titulo && <span className="block px-1 py-0.5 normal-case tracking-normal">{titulo}</span>}
      {children}
      {filtro && <div className={className?.includes("text-right") ? "flex justify-end" : undefined}>{filtro}</div>}
    </th>
  );
}

/** El título que ordena. Separado del `<th>` para la celda compartida
 *  proveedor · permiso, que ordena por uno y filtra por los dos. */
function BotonOrden({
  field,
  sort,
  onSort,
  align = "left",
  children,
}: {
  field: CtpSortField;
  sort: CtpSort;
  onSort: (f: CtpSortField) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const activo = sort.by === field;
  const Icono = !activo ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      title={`Ordenar por ${String(children)}`}
      className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left font-bold transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
        align === "right" ? "flex-row-reverse" : ""
      } ${activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
    >
      {children}
      <Icono className={`h-3.5 w-3.5 ${activo ? "" : "opacity-40"}`} aria-hidden="true" />
    </button>
  );
}

function ThSort({
  field,
  sort,
  onSort,
  align = "left",
  children,
  /** El autofiltro debajo del título: se ordena Y se acota desde la misma cabecera. */
  filtro,
  /** Otro autofiltro ya armado (rango de fecha o de m³). */
  extra,
  col,
}: {
  field: CtpSortField;
  sort: CtpSort;
  onSort: (f: CtpSortField) => void;
  align?: "left" | "right";
  children: React.ReactNode;
  filtro?: FiltroColumnaGuias;
  extra?: React.ReactNode;
  col?: ColGuia;
}) {
  const activo = sort.by === field;
  return (
    <th
      data-col={col}
      aria-sort={activo ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH_CLS} align-top ${align === "right" ? "text-right" : ""}`}
    >
      <BotonOrden field={field} sort={sort} onSort={onSort} align={align}>
        {children}
      </BotonOrden>
      {/* Título arriba, autofiltro debajo — igual que en las otras tablas del libro. */}
      {filtro && <FiltroColumnaMulti label={String(children)} {...propsDeFiltroColumna(filtro)} />}
      {extra && <div className={align === "right" ? "flex justify-end" : undefined}>{extra}</div>}
    </th>
  );
}
