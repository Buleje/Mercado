"use client";

/**
 * CtpIngresosFiltros — buscar, acotar y sacar de la pestaña Ingresos.
 *
 * Antes sólo había búsqueda libre + estado. En un libro con cientos de
 * registros la pregunta real del operador no es "¿dónde dice tornillo?" sino
 * "¿cuánto me entró de Maderera X en rolliza este mes?" — eso es faceta, no
 * texto. Las opciones salen de `stats` (lo que REALMENTE hay en el período,
 * con su volumen), así que ningún filtro devuelve vacío por adivinar mal.
 */

import { BarChart3, Download, FileStack, Plus, RefreshCw, Search, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import CtpFiltrosPanel, { BotonFiltros, BTN_FILTRO, usePanelFiltros } from "./ctp-filtros-panel";
import { STATUS_META, productLabel, type WoodEntryStats, type WoodEntryStatus } from "./ctp-shared";

const STATUS_ORDER: WoodEntryStatus[] = ["pendiente", "validado", "procesado", "rechazado", "anulado"];

/** Clases del chip ACTIVO por tono de estado + color del punto (identidad DS). */
const TONE_CHIP: Record<string, { active: string; dot: string }> = {
  success: { active: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]", dot: "bg-[var(--data-success-500)]" },
  warning: { active: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]", dot: "bg-[var(--data-warning-500)]" },
  danger: { active: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]", dot: "bg-[var(--data-error-500)]" },
  info: { active: "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]", dot: "bg-[var(--data-info-500)]" },
  muted: { active: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]", dot: "bg-[var(--text-tertiary)]" },
};

/** Mismo alto/radio que el botón de filtros: la barra es una sola fila. */
const BTN_ICONO = BTN_FILTRO;

export interface CtpFacetasActivas {
  species?: string;
  provider?: string;
  product?: string;
  cites?: boolean;
  late?: boolean;
  /** Sin código de origen: los ingresos que dejan el EUDR sin parcela. */
  sinOrigen?: boolean;
}

export interface CtpIngresosFiltrosProps {
  searchInput: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatus: (v: string) => void;
  facetas: CtpFacetasActivas;
  onFacetas: (f: CtpFacetasActivas) => void;
  stats: WoodEntryStats | null;
  loading: boolean;
  dashboardOn: boolean;
  onDashboard: () => void;
  onReload: () => void;
  onNuevo: () => void;
  onDescargar: () => void;
  descargando: boolean;
  /** Cuántos registros bajaría el CSV (el total del filtro actual). */
  totalFiltrado: number;
  /** Arma un solo documento con las guías seleccionadas (legajo). */
  onLegajo: () => void;
  /** Cuántos ingresos entrarían al legajo (la selección, o todo el filtro). */
  legajoCount: number;
  /** true = no hay filas marcadas y el legajo saldría de todo el filtro. */
  legajoDeTodo: boolean;
  armandoLegajo: boolean;
  /** Cómo se lista (por guía / por troza): va con los chips, no en su propia fila. */
  modoLista?: React.ReactNode;
  /**
   * Especie y Proveedor ya se filtran desde la cabecera de su columna en la
   * tabla por guía (estilo Excel, Brandon 2026-09-03): acá sólo se dibujan en
   * móvil (sin tabla, hay cards). Falso en la lista por troza, que no los tiene.
   */
  enCabecera?: boolean;
}

export default function CtpIngresosFiltros({
  searchInput,
  onSearch,
  statusFilter,
  onStatus,
  facetas,
  onFacetas,
  stats,
  loading,
  dashboardOn,
  onDashboard,
  onReload,
  onNuevo,
  onDescargar,
  descargando,
  totalFiltrado,
  onLegajo,
  legajoCount,
  legajoDeTodo,
  armandoLegajo,
  modoLista,
  enCabecera = false,
}: CtpIngresosFiltrosProps) {
  const activos =
    (facetas.species ? 1 : 0) +
    (facetas.provider ? 1 : 0) +
    (facetas.product ? 1 : 0) +
    (facetas.cites !== undefined ? 1 : 0) +
    (facetas.late ? 1 : 0) +
    (facetas.sinOrigen ? 1 : 0);
  const { panelId, abierto, alternar } = usePanelFiltros(activos);

  const set = (patch: CtpFacetasActivas) => onFacetas({ ...facetas, ...patch });

  /** Lo que se hace de vez en cuando, plegado. Ver el comentario de la barra. */
  const opciones: MenuAccion[] = [
    {
      id: "especies",
      label: dashboardOn ? "Cerrar el desglose por especie" : "Desglose por especie",
      hint: "Cuánto entró de cada especie en el período, en un gráfico",
      icon: BarChart3,
      activo: dashboardOn,
      onSelect: onDashboard,
    },
    {
      id: "descargar",
      label: "Descargar en Excel",
      hint: `${totalFiltrado === 1 ? "El ingreso" : `Los ${totalFiltrado} ingresos`} de este filtro, con las columnas ya separadas`,
      icon: Download,
      busy: descargando,
      disabled: totalFiltrado === 0,
      onSelect: onDescargar,
    },
    /* Sin nada que meter adentro no se ofrece: un legajo "de nada" enseña que
       la función no sirve. */
    ...(legajoCount > 0
      ? [
          {
            id: "legajo",
            label: legajoDeTodo
              ? `Legajo del filtro (${legajoCount} guía${legajoCount === 1 ? "" : "s"})`
              : `Legajo de lo marcado (${legajoCount} guía${legajoCount === 1 ? "" : "s"})`,
            hint: "Un solo documento con las guías y su índice. Marcá filas para elegir cuáles.",
            icon: FileStack,
            busy: armandoLegajo,
            onSelect: onLegajo,
          } satisfies MenuAccion,
        ]
      : []),
    {
      id: "recargar",
      label: "Recargar",
      hint: "Volver a pedir el período al servidor (atajo: R)",
      icon: RefreshCw,
      busy: loading,
      onSelect: onReload,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <label htmlFor="ctp-ing-search" className="sr-only">
            Buscar ingresos
          </label>
          <input
            id="ctp-ing-search"
            type="text"
            value={searchInput}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por GTF, proveedor o especie..."
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => onSearch("")}
              aria-label="Limpiar búsqueda"
              className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* En móvil los botones van en UNA fila: con `max-sm:sr-only` y ancho
            completo se veían como cajas vacías. */}
        <div className="flex items-center gap-2">
          <BotonFiltros activos={activos} abierto={abierto} panelId={panelId} onToggle={alternar} />
          {/* Cinco botones-icono (especies, descargar, legajo, recargar) más el
              CTA envolvían a dos filas en un portátil. Se pliegan acá adentro,
              donde además cada uno gana la línea que explica qué hace (ADR-360). */}
          <ActionMenu
            label="Opciones"
            title="Desglose por especie, descargar, legajo y recargar"
            actions={opciones}
            size="md"
            compactoEnMovil
          />
          {/* La excepción: con filas marcadas, armar el legajo de ESAS guías es
              la acción del momento y sale del menú a la barra. */}
          {legajoCount > 0 && !legajoDeTodo && (
            <button
              type="button"
              onClick={onLegajo}
              disabled={armandoLegajo}
              title={`Armar un solo documento con las ${legajoCount} guías marcadas y su índice`}
              className={`${BTN_ICONO} border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]`}
            >
              <FileStack className={`h-4 w-4 ${armandoLegajo ? "animate-pulse" : ""}`} />
              <span>{armandoLegajo ? "Armando…" : `Legajo (${legajoCount})`}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNuevo}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:shadow-md hover:brightness-110 sm:flex-none"
          >
            <Plus className="h-5 w-5" />
            Nuevo ingreso
          </button>
        </div>
      </div>

      {/* Chips de estado + cómo se lista, en la MISMA fila: los dos son
          controles de la tabla de abajo y separados costaban dos renglones en
          cada carga de la vista. */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label="Todos" count={stats?.totalCount} active={statusFilter === ""} tone="accent" onClick={() => onStatus("")} />
        {STATUS_ORDER.map((s) => (
          <StatusChip
            key={s}
            label={STATUS_META[s].label}
            count={stats?.byStatus[s]}
            active={statusFilter === s}
            tone={STATUS_META[s].tone}
            onClick={() => onStatus(statusFilter === s ? "" : s)}
          />
        ))}
        {modoLista && <div className="ml-auto">{modoLista}</div>}
      </div>

      {abierto && (
        <CtpFiltrosPanel
          id={panelId}
          activos={activos}
          /* Producto no es una columna de la tabla por guía: se queda acá siempre. */
          selects={[
            { id: "species", label: "Especie", value: facetas.species ?? "", options: stats?.species ?? [], soloMobile: enCabecera },
            { id: "provider", label: "Proveedor", value: facetas.provider ?? "", options: stats?.providers ?? [], soloMobile: enCabecera },
            { id: "product", label: "Producto", value: facetas.product ?? "", options: stats?.products ?? [], etiqueta: productLabel },
          ]}
          toggles={[
            { id: "cites", label: "CITES", on: facetas.cites === true },
            { id: "late", label: "Fuera de plazo", on: facetas.late === true },
            {
              id: "sinOrigen",
              label: stats?.sinOrigenCount ? `Sin código de origen (${stats.sinOrigenCount})` : "Sin código de origen",
              on: facetas.sinOrigen === true,
            },
          ]}
          onSelect={(id, valor) => set({ [id]: valor || undefined })}
          onToggle={(id) =>
            id === "cites"
              ? set({ cites: facetas.cites === true ? undefined : true })
              : id === "late"
                ? set({ late: facetas.late ? undefined : true })
                : set({ sinOrigen: facetas.sinOrigen ? undefined : true })
          }
          onLimpiar={() => onFacetas({})}
        />
      )}
    </div>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────

/** Chip de filtro por estado: punto de color + etiqueta + count. Reusa el tono
 *  del estado (STATUS_META) para leerse igual que los badges de la tabla. */
function StatusChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  tone: "accent" | "success" | "warning" | "danger" | "info" | "muted";
  onClick: () => void;
}) {
  const activeCls =
    tone === "accent"
      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : TONE_CHIP[tone].active;
  const dotCls = tone === "accent" ? "bg-[var(--accent)]" : TONE_CHIP[tone].dot;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition ${
        active
          ? activeCls
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-black/5 dark:bg-white/10" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
