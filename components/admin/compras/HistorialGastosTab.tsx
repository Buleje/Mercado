"use client";

import { useState } from "react";
import {
  DollarSign, RefreshCw, Download, TrendingDown, Wallet,
  Clock, AlertTriangle, Search, X, Info, Copy,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useHistorialGastos } from "@/hooks/use-historial-gastos";
import GastosFijosPanel from "./historial/GastosFijosPanel";
import PresupuestoPanel from "./historial/PresupuestoPanel";
import GastoDetalleModal from "./historial/GastoDetalleModal";
import GastoEditarModal from "./historial/GastoEditarModal";
import HistorialTabla from "./historial/HistorialTabla";
import { PERIOD_LABELS, fmt, type HistorialItem, type Period } from "./historial/shared";

/**
 * HistorialGastosTab — en qué se fue la plata del negocio.
 *
 * Junta los gastos operativos (`Expense`) con las compras a proveedor
 * recibidas (`PurchaseOrder`), y distingue lo GASTADO de lo PAGADO: una orden
 * recibida y sin cancelar es deuda, no caja que salió.
 *
 * Los totales de arriba salen de las filas que se están viendo. Antes venían
 * del servidor sin filtrar mientras la tabla se filtraba en el cliente, así
 * que apretar un chip de categoría dejaba a los KPIs contando otra cosa.
 */

function Kpi({
  label, valor, detalle, icono: Icono, tono,
}: {
  label: string;
  valor: string;
  detalle: string;
  icono: typeof Wallet;
  tono?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icono className="h-4 w-4" style={{ color: tono ?? "var(--text-primary)" }} />
        <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
      </div>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color: tono ?? "var(--text-primary)" }}>{valor}</p>
      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{detalle}</p>
    </div>
  );
}

// `boolean` además de `string`: el segmento de «sólo gastos» es un sí/no y
// merecía el mismo control que el resto, no un checkbox suelto.
function Segmento<T extends string | boolean>({
  opciones, valor, onChange,
}: {
  opciones: Array<{ v: T; l: string }>;
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
      {opciones.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={valor === o.v}
          className={cn(
            "h-10 rounded-lg px-3 text-sm font-semibold transition-colors",
            valor === o.v
              ? "bg-white text-[var(--text-primary)] shadow-sm dark:bg-[var(--color-card)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export default function HistorialGastosTab() {
  const h = useHistorialGastos();
  const [detalle, setDetalle] = useState<HistorialItem | null>(null);
  const [editando, setEditando] = useState<HistorialItem | null>(null);
  /**
   * Cuántas veces se tocó un gasto desde acá. Corregir un monto cambia lo que
   * el panel de gastos fijos tiene que mostrar («¿el combustible de esta semana
   * está pagado?»), y ese panel trae sus propios datos.
   */
  const [cambios, setCambios] = useState(0);

  const { resumen } = h;
  const conDatos = h.items.length > 0;

  return (
    <div className="space-y-4">
      {/* Los KPIs abren la pantalla: son el resumen de lo que se está viendo.
          Antes venían terceros, detrás de dos paneles de más de 300px cada uno,
          así que «Historial de Gastos» empezaba con dos pantallas de otra cosa
          y la tabla —a lo que la gente entra— quedaba abajo de todo. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Total gastado"
          valor={h.loading ? "—" : fmt(resumen.total)}
          detalle={`${resumen.cantidad} ${resumen.cantidad === 1 ? "movimiento" : "movimientos"}${h.hayFiltroActivo ? ` de ${h.items.length}` : ""}`}
          icono={TrendingDown}
          tono="var(--data-error-ink)"
        />
        <Kpi
          label="Ya pagado"
          valor={h.loading ? "—" : fmt(resumen.pagado)}
          detalle="Plata que salió de la caja"
          icono={Wallet}
          tono="var(--data-success-ink)"
        />
        <Kpi
          label="Queda por pagar"
          valor={h.loading ? "—" : fmt(resumen.porPagar)}
          detalle="Mercadería recibida sin cancelar"
          icono={Clock}
          tono={resumen.porPagar > 0 ? "var(--data-warning-ink)" : undefined}
        />
        <Kpi
          label="Categoría top"
          valor={resumen.categorias[0] ? fmt(resumen.categorias[0].total) : "—"}
          detalle={resumen.categorias[0]?.cat ?? "Sin movimientos"}
          icono={DollarSign}
        />
      </div>

      {/* Plata que salió pero NO es gasto. Va afuera del total a propósito: un
          adelanto vuelve como trabajo o producto, y un retiro de caja suele ser
          la otra cara de un gasto que ya está contado más arriba. */}
      {(resumen.anticipos > 0 || resumen.retirosCaja > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
          <Info className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            Salió de la caja pero <span className="font-bold text-[var(--text-primary)]">no cuenta como gasto</span>:
            {resumen.anticipos > 0 && (
              <> adelantos al personal <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(resumen.anticipos)}</span> (vuelven)</>
            )}
            {resumen.anticipos > 0 && resumen.retirosCaja > 0 && " ·"}
            {resumen.retirosCaja > 0 && (
              <> retiros de caja <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(resumen.retirosCaja)}</span> (pueden ser el mismo gasto ya contado)</>
            )}
          </p>
        </div>
      )}

      <GastosFijosPanel onPagoRegistrado={h.recargar} recargaToken={cambios} />

      <PresupuestoPanel />

      {/* Toolbar en dos filas: los tres segmentos juntos no entran en una sola
          y empujaban el buscador fuera de la pantalla. Arriba el período (que
          recarga del servidor), abajo lo que filtra en el cliente. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmento
            opciones={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({ v: p, l: PERIOD_LABELS[p] }))}
            valor={h.period}
            onChange={h.setPeriod}
          />

          <div className="flex-1" />

          <button
            type="button"
            onClick={h.recargar}
            title="Recargar"
            aria-label="Recargar el historial"
            className="h-12 rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 transition-colors hover:bg-[var(--surface-sunken)] dark:bg-[var(--color-card)]"
          >
            <RefreshCw className={cn("h-4 w-4 text-[var(--text-secondary)]", h.loading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={h.exportarCsv}
            disabled={h.filtered.length === 0}
            className="inline-flex h-12 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-white px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50 dark:bg-[var(--color-card)]"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seis fuentes no entran como botones. El `select` además deja claro
              que es UNA sola elección. */}
          <label className="flex items-center gap-2">
            <span className="sr-only">Filtrar por origen</span>
            <select
              value={h.sourceFilter}
              onChange={(e) => h.setSourceFilter(e.target.value as typeof h.sourceFilter)}
              className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
            >
              <option value="all">Todos los orígenes</option>
              <option value="expense">Gastos operativos</option>
              <option value="purchase">Compras a proveedor</option>
              <option value="flete">Fletes</option>
              <option value="adelanto">Adelantos al personal</option>
              <option value="caja">Retiros de caja</option>
            </select>
          </label>
          {/* Lo que se cuenta como gasto y lo que no viven en la misma tabla a
              propósito (la caja no distingue), pero en un mes normal los
              adelantos y retiros son la mayoría de las filas. */}
          <Segmento
            opciones={[
              { v: false as const, l: "Todo lo que salió" },
              { v: true as const, l: "Sólo gastos" },
            ]}
            valor={h.soloGastos}
            onChange={h.setSoloGastos}
          />

          <Segmento
            opciones={[
              { v: "all" as const, l: "Pagado y no" },
              { v: "pagado" as const, l: "Pagados" },
              { v: "pendiente" as const, l: "Por pagar" },
            ]}
            valor={h.estadoFilter}
            onChange={h.setEstadoFilter}
          />

          <div className="relative min-w-[240px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="search"
              value={h.search}
              onChange={(e) => h.setSearch(e.target.value)}
              placeholder="Buscar descripción, categoría o proveedor"
              aria-label="Buscar en el historial de gastos"
              className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-white pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
            />
          </div>

          {h.hayFiltroActivo && (
            <button
              type="button"
              onClick={h.limpiarFiltros}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Los chips de categoría son un filtro más: vivían en una tarjeta
            aparte, con título propio y 4rem de aire, lejos de la fila de
            filtros con la que trabajan en conjunto. */}
        {resumen.categorias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Categorías
            </span>
            {resumen.categorias.slice(0, 10).map(({ cat, total }) => {
              const isActive = h.categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => h.setCategoryFilter(isActive ? "" : cat)}
                  aria-pressed={isActive}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-primary/40 hover:text-primary dark:bg-[var(--color-card)]",
                  )}
                >
                  <span>{cat}</span>
                  <span className="font-bold tabular-nums">{fmt(total)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Ocultar filas sin decirlo sería mentir por omisión: el aviso dice
          cuántas son, por qué y cómo verlas. */}
      {(h.duplicadosOcultos > 0 || !h.ocultarDuplicados) && !h.loading && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5">
          <Copy className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">
            {h.ocultarDuplicados ? (
              <>
                <span className="font-bold text-[var(--text-primary)]">
                  {h.duplicadosOcultos} {h.duplicadosOcultos === 1 ? "retiro de caja oculto" : "retiros de caja ocultos"}
                </span>{" "}
                porque {h.duplicadosOcultos === 1 ? "ya está listado" : "ya están listados"} como su adelanto.
              </>
            ) : (
              <>Se están mostrando los retiros de caja que duplican a un adelanto.</>
            )}
          </p>
          <button
            type="button"
            onClick={() => h.setOcultarDuplicados(!h.ocultarDuplicados)}
            className="ml-auto inline-flex h-9 items-center rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            {h.ocultarDuplicados ? "Mostrarlos igual" : "Volver a ocultarlos"}
          </button>
        </div>
      )}

      {h.loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-white py-12 dark:bg-[var(--color-card)]">
          <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-secondary)]" />
          <span className="text-sm text-[var(--text-secondary)]">Cargando historial…</span>
        </div>
      ) : h.error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-white py-12 dark:bg-[var(--color-card)]">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)]">{h.error}</p>
          <button type="button" onClick={h.recargar} className="mt-1 text-sm font-bold text-primary hover:underline">
            Reintentar
          </button>
        </div>
      ) : h.filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-white py-12 dark:bg-[var(--color-card)]">
          <DollarSign className="h-8 w-8 text-[var(--text-secondary)]" />
          {/* «Sin gastos» puede significar dos cosas muy distintas: que no se
              gastó, o que lo que hay quedó fuera del filtro. */}
          <p className="text-base font-semibold text-[var(--text-primary)]">
            {conDatos
              ? "Ningún gasto coincide con el filtro"
              : h.period === "todo"
                ? "Todavía no hay gastos registrados"
                : "Sin gastos en este período"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {conDatos
              ? `Hay ${h.items.length} movimiento${h.items.length === 1 ? "" : "s"} en el período, pero ninguno coincide con la búsqueda o los filtros.`
              : h.period === "todo"
                ? "Cuando registres gastos o recibas compras, aparecerán acá."
                : "Puede que los haya en otro período."}
          </p>
          {conDatos ? (
            <button
              type="button"
              onClick={h.limpiarFiltros}
              className="mt-1 inline-flex h-10 items-center rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              Limpiar filtros
            </button>
          ) : h.period !== "todo" ? (
            <button
              type="button"
              onClick={() => h.setPeriod("todo")}
              className="mt-1 inline-flex h-10 items-center rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              Ver todo el historial
            </button>
          ) : null}
        </div>
      ) : (
        <HistorialTabla
          grupos={h.grupos}
          orden={h.orden}
          alternarOrden={h.alternarOrden}
          resumen={resumen}
          visibles={h.visibles}
          totalFilas={h.totalFilas}
          verMas={h.verMas}
          onAbrir={setDetalle}
        />
      )}

      <GastoDetalleModal
        item={detalle}
        onEditar={(item) => { setDetalle(null); setEditando(item); }}
        onClose={() => setDetalle(null)}
      />

      {editando && (
        <GastoEditarModal
          item={editando}
          categorias={resumen.categorias.map((c) => c.cat)}
          onGuardado={() => { h.recargar(); setCambios((n) => n + 1); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
