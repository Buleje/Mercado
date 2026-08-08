"use client";

/**
 * LothTraceView — trazabilidad del Libro TH (ADR-125), rediseñada: la operación
 * completa de cada árbol (tala → … → despacho) con un resumen "de un vistazo",
 * búsqueda + filtros + orden, y tarjetas colapsables con métricas por árbol
 * (rendimiento, embudo, estado de cadena, alertas) + pasaporte imprimible.
 *
 * La inteligencia por árbol vive en `loth-trace` (pura); la tarjeta en
 * `LothTraceCard`.
 */

import { useMemo, useState } from "react";
import { Search, TreePine, TrendingUp, AlertTriangle, CheckCircle2, MapPin, Download } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { buildTraceOperations, buildTraceSummary, matchesTrace, buildTraceCsv, type TraceOperation } from "@/lib/forestal/loth-trace";
import LothTraceCard from "./LothTraceCard";

interface Caratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

type Filter = "todas" | "completa" | "alertas" | "cites" | "patio";
type Sort = "volumen" | "rendimiento" | "codigo" | "etapas";

const SORTERS: Record<Sort, (a: TraceOperation, b: TraceOperation) => number> = {
  volumen: (a, b) => b.talaVolM3 - a.talaVolM3,
  rendimiento: (a, b) => b.rendimientoPct - a.rendimientoPct,
  codigo: (a, b) => a.tree.localeCompare(b.tree, "es", { numeric: true }),
  etapas: (a, b) => b.stagesReached - a.stagesReached,
};

export default function LothTraceView({ entries, caratula }: { entries: LothEntryDTO[]; caratula?: Caratula | null }) {
  const ops = useMemo(() => buildTraceOperations(entries), [entries]);
  const summary = useMemo(() => buildTraceSummary(ops), [ops]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [sort, setSort] = useState<Sort>("volumen");

  const shown = useMemo(() => {
    return ops
      .map((o) => ({ o, m: matchesTrace(o, search) }))
      .filter(({ o, m }) => {
        if (!m.matched) return false;
        if (filter === "completa" && o.chain !== "completa") return false;
        if (filter === "alertas" && o.alerts.length === 0) return false;
        if (filter === "cites" && !o.cites) return false;
        if (filter === "patio" && o.trozasEnPatio === 0) return false;
        return true;
      })
      .sort((a, b) => SORTERS[sort](a.o, b.o));
  }, [ops, search, filter, sort]);

  function doExportCsv() {
    const csv = buildTraceCsv(ops);
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }); // BOM → Excel lee UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trazabilidad-libro-th.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (ops.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
        <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">No hay operaciones para trazar todavía.</p>
        <p className="mt-1 text-sm">Registrá una tala en la sección 1 para iniciar la trazabilidad de un árbol.</p>
      </div>
    );
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "todas", label: "Todas", count: summary.totalTrees },
    { key: "completa", label: "Cadena completa", count: summary.completas },
    { key: "alertas", label: "Con alertas", count: summary.conAlertas },
    { key: "patio", label: "En patio", count: summary.conPatio },
    { key: "cites", label: "CITES", count: summary.citesCount },
  ];

  return (
    <div className="space-y-5">
      {/* Resumen del aprovechamiento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard density="compact" label="Árboles trazados" value={summary.totalTrees.toString()} subValue={`${summary.conGps} con GPS`} icon={TreePine} emphasis="neutral" />
        <StatCard density="compact" label="Volumen talado" value={`${summary.talaVolM3.toFixed(2)} m³`} subValue={`trozado ${summary.trozadoVolM3.toFixed(2)} m³`} icon={TreePine} emphasis="success" />
        {/* Un decimal, calculado de los m³ y no del entero del resumen: la tabla
            de abajo dice 97.7% y este KPI decía 98%. Es el MISMO hecho con dos
            cifras, que es justo lo que hace desconfiar de un tablero. */}
        <StatCard
          density="compact"
          label="Rendimiento global"
          value={`${Number(summary.talaVolM3) > 0 ? ((Number(summary.trozadoVolM3) / Number(summary.talaVolM3)) * 100).toFixed(1) : "0.0"}%`}
          subValue="trozado / talado"
          icon={TrendingUp}
          emphasis={summary.rendimientoGlobalPct >= 60 ? "success" : "warning"}
        />
        <StatCard
          density="compact"
          label="Cadenas completas"
          value={`${summary.completas}/${summary.totalTrees}`}
          subValue={summary.conAlertas > 0 ? `${summary.conAlertas} con alertas` : "sin alertas"}
          icon={summary.conAlertas > 0 ? AlertTriangle : CheckCircle2}
          emphasis={summary.conAlertas > 0 ? "error" : "success"}
        />
      </div>

      {/* Buscar + filtros + orden */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código de árbol o especie..."
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        <label className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
          <span className="text-[var(--text-tertiary)]">Ordenar</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none">
            <option value="volumen">Mayor volumen</option>
            <option value="rendimiento">Mayor rendimiento</option>
            <option value="etapas">Más avanzada</option>
            <option value="codigo">Código</option>
          </select>
        </label>
        <button
          type="button"
          onClick={doExportCsv}
          title="Descargar el resumen de trazabilidad de todos los árboles (CSV / Excel)"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${
                active ? "border-[var(--data-success-600)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              {c.label}
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Lista de árboles */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-sm text-[var(--text-tertiary)]">
          <MapPin className="mx-auto mb-2 h-6 w-6 opacity-40" />
          Ningún árbol coincide con el filtro. Probá con otro término o quitá los filtros.
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(({ o, m }) => (
            <LothTraceCard key={o.tree} op={o} caratula={caratula} matchHint={m.hint} />
          ))}
        </div>
      )}
    </div>
  );
}
