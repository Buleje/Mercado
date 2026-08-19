"use client";

/**
 * LothTraceFiltros — cómo se busca un árbol entre cientos.
 *
 * Antes había cinco chips fijos y cuatro órdenes. Faltaban las tres preguntas
 * que se hacen de verdad frente a una fiscalización: «¿qué se registró tarde?»,
 * «¿qué árbol perdió más madera?» y «¿qué pasó entre estas dos fechas?».
 */

import { Download, LayoutGrid, Rows3, Search, SlidersHorizontal } from "@buleje/design-system/icons";
import { ORDEN_LABEL, type TraceFiltro, type TraceModo, type TraceOrden } from "./loth-trace-ui";

const CONTROL = "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm";

export interface ChipDef {
  key: TraceFiltro;
  label: string;
  count: number;
  tono?: "error" | "warning";
}

export default function LothTraceFiltros({
  search,
  onSearch,
  especie,
  onEspecie,
  especies,
  desde,
  hasta,
  onDesde,
  onHasta,
  orden,
  onOrden,
  modo,
  onModo,
  chips,
  filtro,
  onFiltro,
  onExportar,
  onUmbrales,
}: {
  search: string;
  onSearch: (v: string) => void;
  especie: string;
  onEspecie: (v: string) => void;
  especies: string[];
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  orden: TraceOrden;
  onOrden: (v: TraceOrden) => void;
  modo: TraceModo;
  onModo: (v: TraceModo) => void;
  chips: ChipDef[];
  filtro: TraceFiltro;
  onFiltro: (v: TraceFiltro) => void;
  onExportar: () => void;
  onUmbrales: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className={`flex flex-1 items-center gap-2 px-4 ${CONTROL}`}>
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por árbol, especie, troza o N° de GTF…"
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>

        <label className={`flex items-center gap-2 px-3 ${CONTROL}`}>
          <span className="text-[var(--text-tertiary)]">Especie</span>
          <select value={especie} onChange={(e) => onEspecie(e.target.value)} className="max-w-[10rem] bg-transparent font-bold text-[var(--text-primary)] outline-none">
            <option value="">Todas</option>
            {especies.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        <label className={`flex items-center gap-2 px-3 ${CONTROL}`}>
          <span className="text-[var(--text-tertiary)]">Ordenar</span>
          <select value={orden} onChange={(e) => onOrden(e.target.value as TraceOrden)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none">
            {(Object.keys(ORDEN_LABEL) as TraceOrden[]).map((o) => (
              <option key={o} value={o}>
                {ORDEN_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex items-center gap-2 px-3 ${CONTROL}`}>
          <span className="text-[var(--text-tertiary)]">Desde</span>
          <input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none" />
        </label>
        <label className={`flex items-center gap-2 px-3 ${CONTROL}`}>
          <span className="text-[var(--text-tertiary)]">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none" />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-12 items-center gap-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
            <ModoBtn activo={modo === "tarjetas"} onClick={() => onModo("tarjetas")} icon={<LayoutGrid className="h-4 w-4" />} label="Tarjetas" />
            <ModoBtn activo={modo === "tabla"} onClick={() => onModo("tabla")} icon={<Rows3 className="h-4 w-4" />} label="Tabla" />
          </div>
          <button
            type="button"
            onClick={onUmbrales}
            title="Definir a partir de cuánta merma se avisa, por especie"
            className={`inline-flex items-center justify-center gap-2 px-4 font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] ${CONTROL}`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Umbrales
          </button>
          <button
            type="button"
            onClick={onExportar}
            title="Descargar lo que se está viendo (CSV / Excel)"
            className={`inline-flex items-center justify-center gap-2 px-4 font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] ${CONTROL}`}
          >
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const activo = filtro === c.key;
          // Un chip en cero no es una alerta: «Fuera de plazo 0» pintado de
          // ámbar enseña a ignorar el color justo cuando deje de ser cero.
          const tonoReal = c.count > 0 ? c.tono : undefined;
          const tono =
            tonoReal === "error"
              ? "border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              : tonoReal === "warning"
                ? "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)]";
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onFiltro(c.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${
                activo
                  ? "border-[var(--data-success-600)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : `${tono} bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]`
              }`}
            >
              {c.label}
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{c.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModoBtn({ activo, onClick, icon, label }: { activo: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors ${
        activo ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
