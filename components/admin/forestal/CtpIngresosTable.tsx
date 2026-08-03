"use client";

/**
 * CtpIngresosTable — la tabla de la pestaña Ingresos del Libro CTP.
 *
 * Extraída de CtpIngresosView para que ninguno de los dos pase de ~300 LOC
 * (regla del repo): la vista se queda con KPIs, filtros y paginación; acá vive
 * el render de las filas y sus acciones por registro.
 *
 * Dual-render: la <table> se muestra solo en ≥640px (hidden sm:block) y en
 * mobile se sirven cards a medida (CtpIngresoCardMobile). El `hidden` de Tailwind
 * a <640px gana sobre la conversión genérica table→card del shell admin, así que
 * la tabla NO se auto-convierte y no compite con las cards premium.
 *
 * 2026-07-29 — orden por columna (el server ordena: con 50 filas por página,
 * ordenar en el cliente ordenaría sólo la página), cabecera pegajosa y pie con
 * los totales de lo que se está viendo.
 */

import { ArrowDown, ArrowUp, ArrowUpDown, TreePine } from "@buleje/design-system/icons";
import type { CtpSort, CtpSortField } from "@/hooks/use-ctp-ingresos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpEntryActions from "./CtpEntryActions";
import CtpIngresoCardMobile from "./CtpIngresoCardMobile";
import EspecieFoto from "./EspecieFoto";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { faltantesIngreso, resumenFaltantes } from "@/lib/forestal/loctp-campos";
import {
  PLAZO_REGISTRO_DIAS,
  StatusBadge,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  originLabel,
  productLabel,
  TablaSkeleton,
  DescuadreChip,
  type WoodEntry,
} from "./ctp-shared";

export interface CtpIngresosTableProps {
  entries: WoodEntry[];
  loading: boolean;
  period: CtpPeriod;
  /** Hay algún filtro activo → el vacío significa "no coincide", no "no hay datos". */
  filtered: boolean;
  pendingIds: string[];
  selectedIds: string[];
  /** Intersección selectedIds ∩ pendingIds — la calcula la vista (single source). */
  selectedPending: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  busy: string | null;
  rejectingId: string | null;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onStartReject: (id: string) => void;
  onCancelReject: () => void;
  onConfirmReject: (id: string) => void;
  onValidate: (id: string) => void;
  onDetail: (entry: WoodEntry) => void;
  onChain: (entry: WoodEntry) => void;
  onDuplicate: (entry: WoodEntry) => void;
  onEdit: (entry: WoodEntry) => void;
  /** Abre la guía del ingreso como documento imprimible. */
  onVerGuia: (entry: WoodEntry) => void;
  sort: CtpSort;
  onSort: (field: CtpSortField) => void;
}

export default function CtpIngresosTable(props: CtpIngresosTableProps) {
  const {
    entries,
    loading,
    period,
    filtered,
    pendingIds,
    selectedIds,
    selectedPending,
    setSelectedIds,
    onDetail,
    sort,
    onSort,
  } = props;

  /** Fotos de referencia por especie: una sola carga para toda la tabla. */
  const { indice: fotosEspecie } = useEspeciesFotos();

  // Acciones por fila/card: el mismo componente para desktop y mobile.
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
  const toggleSelect = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  // Totales de lo que está en pantalla. Los KPIs de arriba hablan del período
  // entero; esto responde "¿y lo que estoy mirando/marcando cuánto suma?".
  const marcados = entries.filter((e) => selectedIds.includes(e.id));
  const suma = (rows: WoodEntry[]) => ({
    vol: rows.reduce((s, e) => s + Number(e.volumeM3 || 0), 0),
    pz: rows.reduce((s, e) => s + (e.pieces || 0), 0),
  });
  const totalPagina = suma(entries);
  const totalMarcado = suma(marcados);

  return (
    <>
      {/* sr-only + aria-labelledby (no aria-label inline): el shell admin
          auto-genera data-label de mobile-cards leyendo el <th> completo
          (incl. aria-label/title de hijos) — un aria-label inline acá se
          filtraría como etiqueta repetida en CADA fila del checkbox por
          registro. Referenciar un id externo lo evita sin perder el nombre
          accesible. */}
      <span id="ctp-select-all-label" className="sr-only">
        Seleccionar todos los ingresos pendientes de esta página
      </span>

      {/* ── Desktop: tabla (≥640px) ── */}
      {/* El alto tope + scroll propio sólo se activa con muchas filas: es lo que
          hace REAL a la cabecera pegajosa (un `sticky` dentro de un contenedor
          sin scroll no se pega a nada). Con 5 filas no se toca el layout. */}
      {/* Nueve columnas entran en el panel (medido: pedía 1585px con once y el
          contenedor da 1290). El degradé del borde derecho queda por si el
          panel se angosta —sidebar abierto, monitor chico—: sin él, el corte se
          lee como el fin de la tabla y "Acciones" no existe para el que no
          arrastra. */}
      <div className="relative hidden sm:block">
      <div
        className={`overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${
          entries.length > 12 ? "max-h-[75vh] overflow-y-auto" : ""
        }`}
      >
        <table className="w-full text-sm">
          {/* `sticky top-0`: con 50 filas por página, al llegar al final ya no se
              sabía qué columna era cuál. */}
          <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-labelledby="ctp-select-all-label"
                  disabled={pendingIds.length === 0}
                  checked={pendingIds.length > 0 && selectedPending.length === pendingIds.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? pendingIds : [])}
                  className="h-4 w-4 accent-[var(--brand-ink)]"
                />
              </Th>
              <Th className="w-16">N° libro</Th>
              <ThSort field="entryDate" sort={sort} onSort={onSort}>Fecha</ThSort>
              <Th>Documento</Th>
              <ThSort field="providerName" sort={sort} onSort={onSort}>Proveedor / Origen</ThSort>
              {/* Especie y producto son UN dato para el que lee la fila
                  ("tornillo rolliza"), y separarlos costaba una columna. */}
              <ThSort field="speciesCommonName" sort={sort} onSort={onSort}>Especie / producto</ThSort>
              {/* Volumen y piezas también van juntos: son las dos caras de
                  "cuánto entró" y nadie ordena por una sin mirar la otra.
                  Con once columnas la tabla pedía 1585px en un panel de 1290 y
                  «Acciones» quedaba fuera de pantalla — medido, no estimado. */}
              <ThSort field="volumeM3" sort={sort} onSort={onSort} align="right">Cantidad</ThSort>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const tarde = estaFueraDePlazo(e);
              const marcado = selectedIds.includes(e.id);
              return (
                <tr
                  key={e.id}
                  className={`border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-canvas)]/40 ${
                    marcado ? "bg-primary/5" : ""
                  }`}
                >
                  <Td>
                    {e.status === "pendiente" && (
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ingreso ${e.gtfNumber}`}
                        checked={marcado}
                        onChange={(ev) => toggleSelect(e.id, ev.target.checked)}
                        className="h-4 w-4 accent-[var(--brand-ink)]"
                      />
                    )}
                  </Td>
                  <Td>
                    {/* (1) del formato oficial. Es el número con el que la
                        autoridad pide "traeme el registro 128": sin verlo en la
                        tabla, el operador no lo puede citar (ADR-311). */}
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {e.libroNro ?? "—"}
                    </span>
                    {(() => {
                      const faltan = faltantesIngreso(e as unknown as Record<string, unknown>);
                      if (faltan.length === 0) return null;
                      return (
                        // Chip en vez de tres renglones sueltos: la celda del
                        // N° de libro medía el triple por un dato secundario, y
                        // el número que la autoridad pide quedaba aplastado.
                        <span
                          title={resumenFaltantes(faltan)}
                          className="mt-1 inline-block whitespace-nowrap rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        >
                          −{faltan.length} SERFOR
                        </span>
                      );
                    })()}
                  </Td>
                  <Td>
                    <div className="whitespace-nowrap font-bold text-[var(--text-primary)]">{formatDate(e.entryDate)}</div>
                    {tarde && (
                      <div
                        title={`Registrado ${diasDeRegistro(e)} días después de la operación (plazo ${PLAZO_REGISTRO_DIAS} días hábiles)`}
                        className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      >
                        fuera de plazo
                      </div>
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onDetail(e)}
                      title={e.gtfNumber}
                      className="block max-w-32 truncate text-left font-mono text-sm font-bold text-[var(--brand-ink)] dark:text-[var(--text-primary)] underline-offset-2 hover:underline"
                    >
                      {e.gtfNumber}
                    </button>
                    <div className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {e.docType || "GTF"}
                    </div>
                    {e.gtfDate && (
                      <div className="text-sm text-[var(--text-tertiary)]">{formatDate(e.gtfDate)}</div>
                    )}
                  </Td>
                  <Td>
                    <div title={e.providerName} className="max-w-36 truncate font-medium text-[var(--text-primary)]">
                      {e.providerName}
                    </div>
                    <div className="text-sm text-[var(--text-tertiary)]">{originLabel(e.originType)}</div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {/* La foto de referencia: si no hay cargada no dibuja nada. */}
                      <EspecieFoto especie={e.speciesCommonName} indice={fotosEspecie} />
                      <span className="font-medium text-[var(--text-primary)]">{e.speciesCommonName}</span>
                      {e.speciesCites && (
                        <span
                          title="Especie protegida CITES"
                          className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"
                        >
                          CITES
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                        {productLabel(e.productType)}
                      </span>
                      {e.speciesScientificName && (
                        <span className="truncate text-xs italic text-[var(--text-tertiary)]">
                          {e.speciesScientificName}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {Number(e.volumeM3).toFixed(4)}{" "}
                      <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                    </div>
                    {/* Las piezas debajo y no en su propia columna: el número
                        que se compara es el volumen, las piezas lo acompañan. */}
                    <div className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {e.pieces} {e.pieces === 1 ? "pieza" : "piezas"}
                    </div>
                    <DescuadreChip entry={e} />
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                    {e.rejectionReason && (
                      <div className="mt-1 text-sm text-[var(--data-error-700)]">{e.rejectionReason}</div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <CtpEntryActions
                      entry={e}
                      {...actionProps}
                      // Por FILA y no en `actionProps`: el botón sólo tiene
                      // sentido si ESE ingreso trae la ficha de SERFOR. Sin
                      // ella el documento saldría con todos los casilleros
                      // vacíos, y un botón que abre un papel en blanco es peor
                      // que no tenerlo.
                      onVerGuia={e.serforGtf ? props.onVerGuia : undefined}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
              <tr>
                {/* Los `colSpan` suman las NUEVE columnas de arriba. Con once
                    sumaban diez: el total de volumen caía bajo «Producto» y el
                    de piezas bajo «Volumen» — un pie de totales corrido una
                    columna en un registro que se presenta a la autoridad. */}
                <td colSpan={6} className="px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                  {marcados.length > 0
                    ? `${marcados.length} marcados de ${entries.length} en pantalla`
                    : `${entries.length} en pantalla`}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {(marcados.length > 0 ? totalMarcado.vol : totalPagina.vol).toFixed(4)}{" "}
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">m³</span>
                  </div>
                  <div className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {marcados.length > 0 ? totalMarcado.pz : totalPagina.pz} piezas
                  </div>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-2xl bg-linear-to-l from-[var(--surface-raised)] to-transparent"
        />
      </div>

      {/* ── Mobile: cards a medida (<640px) ── */}
      {entries.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {entries.map((e) => (
            <CtpIngresoCardMobile
              key={e.id}
              entry={e}
              fotosEspecie={fotosEspecie}
              selected={selectedIds.includes(e.id)}
              onToggleSelect={toggleSelect}
              {...actionProps}
              // Duplicar NO va en la card: en 360px ya conviven Ver, Cadena y
              // Validar/Rechazar a ancho completo — un cuarto botón los parte.
              onDuplicate={undefined}
            />
          ))}
          <p className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
            {entries.length} en pantalla · {Number(totalPagina.vol).toFixed(4)} m³ · {totalPagina.pz} piezas
          </p>
        </div>
      )}

      {/* ── Estados compartidos (vacío / cargando) ── */}
      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">
            {filtered ? "Ningún ingreso coincide con el filtro." : `Sin ingresos en ${period.label}.`}
          </p>
          <p className="mt-1 text-sm">
            {filtered
              ? "Probá limpiar la búsqueda o ampliar el período."
              : period.from
                ? 'Puede haber registros fuera de este período: elegí "Todo el histórico" arriba, o registrá uno con "Nuevo ingreso".'
                : 'Hacé click en "Nuevo ingreso" para registrar el primer movimiento de madera.'}
          </p>
        </div>
      )}

      {loading && <TablaSkeleton filas={5} columnas={8} />}
    </>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}

/** Encabezado ordenable. `aria-sort` real (no sólo la flecha) para que un lector
 *  de pantalla anuncie por qué columna está ordenada la tabla. */
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

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
