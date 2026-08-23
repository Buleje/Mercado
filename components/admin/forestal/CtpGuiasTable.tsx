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
  Eye,
  FileText,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Share2,
  ThumbsDown,
  TreePine,
} from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import type { CtpSort, CtpSortField } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
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

export interface CtpGuiasTableProps {
  guias: GuiaIngreso<WoodEntry>[];
  loading: boolean;
  period: CtpPeriod;
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
  /** La vista está en la bandeja «por recepcionar» (ADR-339). */
  modoBandeja: boolean;
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
  sort: CtpSort;
  onSort: (field: CtpSortField) => void;
}

export default function CtpGuiasTable(props: CtpGuiasTableProps) {
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
    modoBandeja,
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
          className={`overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${
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
                <Th>Documento</Th>
                <ThSort field="providerName" sort={sort} onSort={onSort}>Proveedor / Origen</ThSort>
                {/* Ya no es «la» especie: es la lista de lo que trae el papel. */}
                <ThSort field="speciesCommonName" sort={sort} onSort={onSort}>Especies de la guía</ThSort>
                <ThSort field="volumeM3" sort={sort} onSort={onSort} align="right">Cantidad</ThSort>
                <Th>Estado</Th>
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
                    fotosEspecie={fotosEspecie}
                    modoBandeja={modoBandeja}
                    actionProps={actionProps}
                    onVerGuia={props.onVerGuia}
                    onVerDocumento={props.onVerDocumento}
                    onVerFicha={props.onVerFicha}
                    onCuadrar={props.onCuadrar}
                    onValidarGuia={props.onValidarGuia}
                    onRecepcionarGuia={props.onRecepcionarGuia}
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
                  <td colSpan={6} className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                    {guias.length} guía{guias.length === 1 ? "" : "s"} en pantalla · {totalPagina.lineas} asiento
                    {totalPagina.lineas === 1 ? "" : "s"} del libro
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {totalPagina.vol.toFixed(4)}{" "}
                      <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                    </div>
                    <div className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {totalPagina.pz} piezas
                    </div>
                  </td>
                  <td colSpan={2} />
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
              modoBandeja={modoBandeja}
              onDetail={onDetail}
              onValidarGuia={props.onValidarGuia}
              onRecepcionarGuia={props.onRecepcionarGuia}
              busy={props.busy}
            />
          ))}
          <p className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
            {guias.length} guías · {totalPagina.vol.toFixed(4)} m³ · {totalPagina.pz} piezas
          </p>
        </div>
      )}

      {!loading && guias.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
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
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                >
                  Quitar los filtros y ver todo
                </button>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm">
              {period.from
                ? 'Puede haber registros fuera de este período: elegí "Todo el histórico" arriba, o registrá uno con "Nuevo ingreso".'
                : 'Hacé click en "Nuevo ingreso" para registrar el primer movimiento de madera.'}
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
  fotosEspecie,
  modoBandeja,
  actionProps,
  onVerGuia,
  onVerDocumento,
  onVerFicha,
  onCuadrar,
  onValidarGuia,
  onRecepcionarGuia,
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
  fotosEspecie: ReturnType<typeof useEspeciesFotos>["indice"];
  modoBandeja: boolean;
  actionProps: ActionProps;
  onVerGuia: (e: WoodEntry) => void;
  onVerDocumento: (g: GuiaIngreso<WoodEntry>) => void;
  onVerFicha: (g: GuiaIngreso<WoodEntry>) => void;
  onCuadrar: (g: GuiaIngreso<WoodEntry>) => void;
  onValidarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  onRecepcionarGuia: (g: GuiaIngreso<WoodEntry>) => void;
  onAlternarDetalle: () => void;
  onAlternarMarca: (v: boolean) => void;
  onDetail: (e: WoodEntry) => void;
}) {
  /* Rechazar/anular pide un motivo en la misma celda: mientras se escribe, la
     fila cede el lugar a ese formulario (es el flujo de `CtpEntryActions`). */
  const enRechazo = actionProps.rejectingId === primera.id;

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
        <Td>
          <div title={guia.providerName} className="max-w-36 truncate font-medium text-[var(--text-primary)]">
            {guia.providerName}
          </div>
          <div className="text-sm text-[var(--text-tertiary)]">{originLabel(primera.originType)}</div>
        </Td>
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
                    {e.volumenM3.toFixed(4)} m³
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
            {guia.volumenM3.toFixed(4)} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
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
              «tenés un problema y arreglate». */}
          {(() => {
            const c = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
            if (!descuadra(c)) return null;
            const cuantos = unaSola ? "" : ` entre sus ${guia.lineas.length} asientos`;
            return (
              <button
                type="button"
                onClick={() => onCuadrar(guia)}
                title={`La guía declara ${guia.volumenM3.toFixed(4)} m³${cuantos} y sus ${guia.trozasCount} piezas suman ${(guia.trozasM3 ?? 0).toFixed(4)} m³. Abrí el cuadre para ver los dos lados del documento.`}
                className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] underline-offset-2 hover:underline dark:text-[var(--data-warning-500)]"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                {c.aviso} · cuadrar
              </button>
            );
          })()}
        </Td>
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
              {modoBandeja ? (
                <BotonGuia
                  icon={PackageCheck}
                  texto={unaSola ? "Recepcionar" : "Recepcionar guía"}
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
                {Number(l.volumeM3).toFixed(4)} <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
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
}: {
  icon: typeof PackageCheck;
  texto: string;
  onClick: () => void;
  disabled?: boolean;
  tono?: "neutro" | "accion";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={texto}
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
    <th
      aria-sort={activo ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 font-bold text-[var(--text-primary)] ${align === "right" ? "text-right" : ""}`}
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
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
