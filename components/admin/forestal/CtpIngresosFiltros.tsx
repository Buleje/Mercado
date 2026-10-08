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

import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Coins, Download, FileStack, FolderOpen, FolderPlus, Plus, RefreshCw, Search, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import CtpFiltrosPanel, { BotonFiltros, BTN_FILTRO, usePanelFiltros } from "./ctp-filtros-panel";
import { etiquetaDePermiso, type FiltroMovil } from "./CtpGuiasFiltrosCabecera";
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
  /**
   * Los cuatro admiten VARIOS valores (Brandon, 2026-09-10). Son filtros de
   * SERVIDOR: viajan repetidos en la URL y la consulta los cruza con OR
   * adentro de cada campo y AND entre campos.
   *
   * `string` sigue valiendo —una preferencia guardada antes de este cambio lo
   * tiene así— y se lee como una lista de uno.
   */
  species?: string | readonly string[];
  provider?: string | readonly string[];
  product?: string | readonly string[];
  /** El título habilitante que ampara la madera (ADR-400). Vacío = todos. */
  permiso?: string | readonly string[];
  cites?: boolean;
  late?: boolean;
  /** Sin código de origen: los ingresos que dejan el EUDR sin parcela. */
  sinOrigen?: boolean;
  /** Sin costo cargado: la madera que deja al margen sin base (ADR-135). */
  sinCosto?: boolean;
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
  /** Atajo «N guías de tu Libro TH por ingresar», junto a «Nuevo ingreso». */
  avisoLibroTh?: ReactNode;
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
  modoLista?: MenuAccion[];
  /** Qué guías lista la bandeja (por recepcionar / todas): primero en la fila de chips. */
  recepcionFiltro?: React.ReactNode;
  /**
   * El botón «Columnas» de la tabla (Brandon, 2026-09-08). Va en esta barra y
   * no en la tabla porque es un control de la VISTA, al lado de los otros que
   * deciden qué se ve.
   */
  columnas?: React.ReactNode;
  /**
   * Especie y Proveedor ya se filtran desde la cabecera de su columna en la
   * tabla por guía (estilo Excel, Brandon 2026-09-03): acá sólo se dibujan en
   * móvil (sin tabla, hay cards). Falso en la lista por troza, que no los tiene.
   */
  enCabecera?: boolean;
  /** Lo que va primero en la fila del buscador (el botón «Indicadores»). */
  antes?: React.ReactNode;
  /** Abre «Poner precio a la madera» (precio por m³ en tanda). Sin esto no se ofrece. */
  onPonerPrecio?: () => void;
  /** Abre «Acomodar trozas en su especie» para todas las guías (ADR-435). Sin esto no se ofrece. */
  onAcomodar?: () => void;
  /**
   * Los autofiltros de la cabecera (fecha, documento, N° SNIFFS, cantidad…)
   * para el celular, donde no hay tabla (Brandon, 2026-09-26). Son los MISMOS
   * nodos que arma `filtrosDeCabeceraGuiasMovil`: un estado, dos lugares.
   */
  filtrosMovil?: FiltroMovil[];
  /** Hay algún autofiltro de columna puesto (para ofrecer quitarlos). */
  hayFiltroMovil?: boolean;
  onLimpiarMovil?: () => void;
  /**
   * Guardar una guía antes de que llegue la madera (ADR-442): su N° de
   * registro, su GTF y sus papeles. Sin esto no se ofrece.
   */
  onGuardarGuia?: () => void;
  /** Abre el listado de guías guardadas (por ingresar / ya ingresadas). */
  onGuiasGuardadas?: () => void;
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
  avisoLibroTh,
  onDescargar,
  descargando,
  totalFiltrado,
  onLegajo,
  legajoCount,
  legajoDeTodo,
  armandoLegajo,
  modoLista,
  recepcionFiltro,
  columnas,
  enCabecera = false,
  antes,
  onPonerPrecio,
  onAcomodar,
  filtrosMovil,
  hayFiltroMovil = false,
  onLimpiarMovil,
  onGuardarGuia,
  onGuiasGuardadas,
}: CtpIngresosFiltrosProps) {
  /* Una COLUMNA acotada cuenta 1, tenga uno o cinco valores elegidos. */
  const puesto = (v: string | readonly string[] | undefined) => (Array.isArray(v) ? v.length > 0 : !!v);
  const activos =
    (puesto(facetas.species) ? 1 : 0) +
    (puesto(facetas.provider) ? 1 : 0) +
    (puesto(facetas.product) ? 1 : 0) +
    (puesto(facetas.permiso) ? 1 : 0) +
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
    /* La plata de la madera (2026-09-25): antes sólo se cargaba desde Gestión →
       Rentabilidad, y en el tenant real 0 de 23 guías tenían precio. */
    ...(onPonerPrecio
      ? [
          {
            id: "precio",
            label: "Poner precio a la madera",
            hint: stats?.sinCostoCount
              ? `${stats.sinCostoCount} ${stats.sinCostoCount === 1 ? "ingreso" : "ingresos"} del período sin precio · un precio por m³ para todas las guías de un proveedor`
              : "Un precio por m³ para todas las guías de un proveedor y especie",
            icon: Coins,
            onSelect: onPonerPrecio,
          } satisfies MenuAccion,
        ]
      : []),
    /* ADR-435: en Blas, 29 de 46 trozas del permiso de Huánuco colgaban de la
       fila de otra especie de su guía. Primero se ve qué se mueve; después se
       confirma. */
    ...(onAcomodar
      ? [
          {
            id: "acomodar",
            label: "Acomodar trozas en su especie",
            hint: "En las guías de varias especies, cada troza a la fila de su especie · primero ves qué se mueve",
            icon: ArrowLeftRight,
            onSelect: onAcomodar,
          } satisfies MenuAccion,
        ]
      : []),
    /* ADR-442: la guía se guarda ANTES de que llegue la madera. Se hace de vez
       en cuando (el ingreso diario es «Nuevo ingreso»), así que vive en el
       menú, pegada a «Guías guardadas». Antes era un botón-ícono suelto en la
       barra (2026-10-08: la vista llegó a 31 botones). */
    ...(onGuardarGuia
      ? [
          {
            id: "guardar-guia",
            label: "Guardar guía",
            hint: "Sus datos y sus papeles, antes de que llegue la madera",
            icon: FolderPlus,
            onSelect: onGuardarGuia,
          } satisfies MenuAccion,
        ]
      : []),
    /* ADR-442: las guías guardadas antes del ingreso, con sus papeles. */
    ...(onGuiasGuardadas
      ? [
          {
            id: "guardadas",
            label: "Guías guardadas",
            hint: "Las que guardaste antes del ingreso, con sus documentos · por ingresar o ya ingresadas",
            icon: FolderOpen,
            onSelect: onGuiasGuardadas,
          } satisfies MenuAccion,
        ]
      : []),
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
            hint: "Un solo documento con las guías y su índice. Marca filas para elegir cuáles.",
            icon: FileStack,
            busy: armandoLegajo,
            onSelect: onLegajo,
          } satisfies MenuAccion,
        ]
      : []),
    {
      /* `disabled` y no `busy` mientras carga: con `busy`, el botón «Opciones»
         entero decía «Generando…» en cada carga de la tabla (visto a 1280 px,
         2026-09-25) — se leía como si algo se estuviera exportando. */
      id: "recargar",
      label: loading ? "Leyendo el período…" : "Recargar",
      hint: "Volver a pedir el período al servidor (atajo: R)",
      icon: RefreshCw,
      disabled: loading,
      onSelect: onReload,
    },
    ...(modoLista ?? []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* El botón «Indicadores», primero de la fila (2026-09-24).
            Con tope de ancho y el buscador con base propia: a 1280 px el
            resumen del botón se llevaba 383 px y el buscador quedaba en 117
            («Buscar p…»). `min-w-*` no sirve acá — el reset global
            `* { min-width: 0 }` le gana a las utilidades (memoria
            `min-width-utilities-muertas`); `basis` y `max-w` sí aplican. */}
        {antes && <div className="flex min-w-0 sm:max-w-64 2xl:max-w-96">{antes}</div>}
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl sm:basis-40 border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
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
            title="Desglose por especie, guías guardadas, descargar, legajo y recargar"
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
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent-600)] to-[var(--accent-dark)] px-5 text-base font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 sm:flex-none"
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
        {avisoLibroTh}
        {recepcionFiltro}
        <StatusChip label="Todos" count={stats?.totalCount} active={statusFilter === ""} tone="accent" onClick={() => onStatus("")} />
        {/* Sólo los estados que EXISTEN en el período.
            Medido en pantalla: con 3 guías pendientes salían igual «Validado 0»,
            «Procesado 0», «Rechazado 0» y «Anulado 0» — cuatro chips que ocupan
            la fila entera y que al tocarlos dejan la tabla vacía. Un filtro que
            sólo puede devolver cero no es un filtro, es un cartel.
            El activo se dibuja siempre, aunque su cuenta caiga a cero: si no,
            el chip por el que estás filtrando desaparecería bajo el dedo. */}
        {STATUS_ORDER.filter((s) => (stats?.byStatus[s] ?? 0) > 0 || statusFilter === s).map((s) => (
          <StatusChip
            key={s}
            label={STATUS_META[s].label}
            count={stats?.byStatus[s]}
            active={statusFilter === s}
            tone={STATUS_META[s].tone}
            onClick={() => onStatus(statusFilter === s ? "" : s)}
          />
        ))}
        {columnas && <div className="ml-auto flex items-center gap-2">{columnas}</div>}
      </div>

      {abierto && (
        <CtpFiltrosPanel
          id={panelId}
          activos={activos}
          /* Producto no es una columna de la tabla por guía: se queda acá siempre. */
          selects={[
            { id: "species", label: "Especie", value: facetas.species, options: stats?.species ?? [], soloMobile: enCabecera },
            { id: "provider", label: "Proveedor", value: facetas.provider, options: stats?.providers ?? [], soloMobile: enCabecera },
            { id: "product", label: "Producto", value: facetas.product, options: stats?.products ?? [], etiqueta: productLabel },
            /* El permiso vive en la cabecera junto al proveedor; en el celular no tenía dónde elegirse. */
            { id: "permiso", label: "Permiso", value: facetas.permiso, options: stats?.permisos ?? [], soloMobile: enCabecera, etiqueta: etiquetaDePermiso(stats) },
          ]}
          extra={
            filtrosMovil && filtrosMovil.length > 0 ? (
              <div className="sm:hidden" data-testid="filtros-columna-movil">
                <span className="text-sm font-bold text-[var(--text-primary)]">Por columna</span>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3">
                  {filtrosMovil.map((f) => (
                    <div key={f.id} className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">{f.label}</span>
                      {f.nodo}
                    </div>
                  ))}
                </div>
                {hayFiltroMovil && onLimpiarMovil && (
                  <button
                    type="button"
                    onClick={onLimpiarMovil}
                    className="mt-3 inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Quitar los filtros por columna
                  </button>
                )}
              </div>
            ) : undefined
          }
          /* Una marca sólo se ofrece si HAY qué marcar en el período.
             Las tres viven además como pastilla arriba (`BarraDeuda`) y como
             tarjeta —CITES—, así que dibujarlas siempre significaba ofrecer el
             mismo filtro por tercera vez y, encima, apagado: tocar «Fuera de
             plazo» con cero fuera de plazo vacía la tabla y parece que la
             pantalla se rompió. La que está puesta se dibuja igual, o el filtro
             activo desaparecería sin poder apagarlo. */
          toggles={[
            ...((stats?.citesCount ?? 0) > 0 || facetas.cites === true
              ? [{ id: "cites", label: "CITES", on: facetas.cites === true }]
              : []),
            ...((stats?.lateCount ?? 0) > 0 || facetas.late === true
              ? [{ id: "late", label: "Fuera de plazo", on: facetas.late === true }]
              : []),
            ...((stats?.sinOrigenCount ?? 0) > 0 || facetas.sinOrigen === true
              ? [{
                  id: "sinOrigen",
                  label: stats?.sinOrigenCount
                    ? `Sin código de origen (${stats.sinOrigenCount})`
                    : "Sin código de origen",
                  on: facetas.sinOrigen === true,
                }]
              : []),
          ]}
          onSelect={(id, valores) => set({ [id]: valores.length > 0 ? valores : undefined })}
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
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition ${
        active
          ? activeCls
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-black/5 " : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
