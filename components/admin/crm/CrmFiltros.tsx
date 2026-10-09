"use client";

import { cn } from "@/lib/utils";
import { rangoActivo, textoDeRango, type ChipFiltro } from "@/lib/admin/filtros-columna";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import { SEGMENT_CONFIG, type QuickFilter, type Segment } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";

/** Filtros pegados a la tabla: segmento, estado, frecuencia, etiqueta y los chips de filtros puestos. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmFiltros({ crm }: { crm: Crm }) {
  const {
    customers, actividadFiltro, setActividadFiltro, creditoRango, setCreditoRango, filterSegment, setFilterSegment, filterTag, setFilterTag, freqFilter, setFreqFilter, allTags, quickFilterCounts, freqCounts, segmentCounts,
  } = crm;
  return (
    <>
      {/* Filtros secundarios: quick filter + frecuencia + tags */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filtro segmento — chips estandar */}
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Segmento
        </span>
        {([
          { key: "todos" as const, label: "Todos", count: customers.length },
          { key: "frecuente" as const, label: "Frecuente", count: segmentCounts.frecuente },
          { key: "ocasional" as const, label: "Ocasional", count: segmentCounts.ocasional },
          { key: "nuevo" as const, label: "Nuevo", count: segmentCounts.nuevo },
          { key: "perdido" as const, label: "Perdido", count: segmentCounts.perdido },
        ] as const).map(f => {
          // "Todos" activo con la selección vacía; el resto se puede combinar
          // (multi, 2026-09-22) — mismo estado que el autofiltro de la
          // columna Segmento: clic para sumar, clic de nuevo para sacar.
          const active = f.key === "todos" ? filterSegment.length === 0 : filterSegment.includes(f.key as Segment);
          return (
          <button
            key={f.key}
            onClick={() => {
              if (f.key === "todos") { setFilterSegment([]); return; }
              const seg = f.key as Segment;
              setFilterSegment(prev => prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]);
            }}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              active
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-[var(--surface-sunken)]"
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span className={cn(
                "text-xs font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
                active ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]"
              )}>
                {f.count > 99 ? "99+" : f.count}
              </span>
            )}
          </button>
          );
        })}

        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--rule-base)]" />
        {/* Cada grupo lleva su etiqueta: había TRES chips "Todos" en la misma
            fila (segmento, estado y frecuencia) y no se sabía cuál filtraba qué. */}
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Estado
        </span>
        {/* Atajo excluyente de siempre (mismo look) — ahora escribe DOS
            estados de columna en vez de ser la fuente de verdad: Activos/
            Inactivos van a `actividadFiltro` ("Último pedido"), Con deuda va
            a `creditoRango` ("Crédito"). Elegir uno limpia el otro, como
            antes; el autofiltro de cada `<th>` puede combinarlos si hace
            falta más precisión que el atajo. */}
        {([
          { key: "todos" as QuickFilter,     label: "Todos" },
          { key: "activos" as QuickFilter,   label: "Activos" },
          { key: "inactivos" as QuickFilter, label: "Inactivos 30d" },
          { key: "con-deuda" as QuickFilter, label: "Con deuda" },
        ]).map(f => {
          const active =
            f.key === "todos"
              ? actividadFiltro.length === 0 && creditoRango.min == null && creditoRango.max == null
              : f.key === "con-deuda"
                ? creditoRango.min === 0.01 && creditoRango.max == null
                : actividadFiltro.length === 1 && actividadFiltro[0] === (f.key === "activos" ? "Activo" : "Inactivo");
          const aplicar = () => {
            if (f.key === "todos") { setActividadFiltro([]); setCreditoRango({ min: null, max: null }); return; }
            if (f.key === "con-deuda") { setActividadFiltro([]); setCreditoRango({ min: 0.01, max: null }); return; }
            setActividadFiltro([f.key === "activos" ? "Activo" : "Inactivo"]);
            setCreditoRango({ min: null, max: null });
          };
          return (
          <button
            key={f.key}
            onClick={aplicar}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              active
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-[var(--surface-sunken)]"
            )}
          >
            {f.label}
            <span className={cn(
              "text-xs font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
              active ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]"
            )}>
              {quickFilterCounts[f.key] > 99 ? "99+" : quickFilterCounts[f.key]}
            </span>
          </button>
          );
        })}

        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--rule-base)]" />
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Frecuencia
        </span>

        {/* Frecuencia de compra */}
        {([
          { key: "todos-freq" as const, label: "Todos" },
          { key: "diario" as const, label: "Diario" },
          { key: "semanal" as const, label: "Semanal" },
          { key: "quincenal" as const, label: "Quincenal" },
          { key: "mensual" as const, label: "Mensual" },
          { key: "inactivo-freq" as const, label: "Inactivo" },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFreqFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              freqFilter === f.key
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-[var(--surface-sunken)]"
            )}
          >
            {f.label}
            <span className={cn(
              "text-xs font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
              freqFilter === f.key ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]"
            )}>
              {freqCounts[f.key] > 99 ? "99+" : freqCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Etiqueta:</span>
          <button
            onClick={() => setFilterTag("todos")}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              filterTag === "todos"
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-[var(--surface-sunken)]"
            )}
          >
            Todas
          </button>
          {allTags.map(tag => {
            const isActive = filterTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
                  isActive
                    ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] dark:hover:bg-[var(--surface-sunken)]"
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros de columna puestos, con su cruz — arriba de la tabla. Crédito
          y Último pedido se ESCONDEN en pantallas chicas (`hidden lg/sm:
          table-cell`): sin esto un rango puesto en desktop quedaría acotando
          en el celular sin ningún control a la vista. */}
      <ChipsDeFiltros
        className="mb-2"
        chips={[
          ...(filterSegment.length > 0
            ? [{ id: "segmento", label: "Segmento", texto: filterSegment.length === 1 ? SEGMENT_CONFIG[filterSegment[0]].label : `Segmento: ${filterSegment.length} elegidos` }]
            : []),
          ...(actividadFiltro.length > 0
            ? [{ id: "actividad", label: "Último pedido", texto: actividadFiltro.length === 1 ? `${actividadFiltro[0]} (30 d)` : "Activos e inactivos" }]
            : []),
          ...(rangoActivo(creditoRango)
            ? [{ id: "credito", label: "Crédito", texto: textoDeRango("Crédito", creditoRango, { unidad: "S/" }) }]
            : []),
        ] satisfies ChipFiltro[]}
        onQuitar={(id) => {
          if (id === "segmento") setFilterSegment([]);
          else if (id === "actividad") setActividadFiltro([]);
          else if (id === "credito") setCreditoRango({ min: null, max: null });
        }}
        onLimpiarTodo={() => { setFilterSegment([]); setActividadFiltro([]); setCreditoRango({ min: null, max: null }); }}
      />
    </>
  );
}
