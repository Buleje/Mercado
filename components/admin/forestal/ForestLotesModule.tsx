"use client";

/**
 * ForestLotesModule — Lotes de producción / comercialización forestal (ADR-136).
 *
 * Capa comercial sobre el Libro CTP: agrupa corridas de producción en lotes con
 * código, grado y estado. Solo se renderiza si el tenant tiene
 * `spec:forestal:lotes` habilitado (gating sidebar + endpoints 403).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, Plus, RefreshCw, Search, PackageCheck, Boxes, Truck, LayoutGrid, Rows3,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import LibroChrome from "@/components/admin/shared/libro-chrome";
import { useDebounce } from "@/hooks/use-debounce";
import { resumenLotes } from "@/lib/forestal/lote-metricas";
import LoteForm from "./LoteForm";
import LoteDetailModal from "./LoteDetailModal";
import LotesTabla from "./LotesTabla";
import LoteCard, { type LoteRow, type LoteStatus } from "./LoteCard";

interface Stats { total: number; abiertos: number; cerrados: number; despachados: number; cantidadTotal: number }

const STATUS_FILTERS: { key: LoteStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "cerrado", label: "Cerrados" },
  { key: "despachado", label: "Despachados" },
  { key: "anulado", label: "Anulados" },
];

const n4 = (v: number | string | null | undefined) => (Number(v) || 0).toFixed(4);

export default function ForestLotesModule() {
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LoteStatus | "todos">("todos");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [vista, setVista] = useState<"cards" | "tabla">("cards");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "todos") p.set("status", statusFilter);
      if (search.trim()) p.set("search", search.trim());
      const [lotesRes, statsRes] = await Promise.all([
        fetch(`/api/admin/forestal/lotes?${p}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/lotes?stats=1`, { credentials: "include" }),
      ]);
      if (!lotesRes.ok) throw new Error((await lotesRes.json().catch(() => ({}))).message ?? `HTTP ${lotesRes.status}`);
      setLotes((await lotesRes.json()).lotes ?? []);
      if (statsRes.ok) setStats((await statsRes.json()).stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);
  useEffect(() => { void load(); }, [load]);
  // Filtrar desde la página 4 dejaba la vista vacía con resultados cargados.
  useEffect(() => { setPagina(1); }, [statusFilter, search]);

  const kpis = useMemo(() => stats ?? { total: 0, abiertos: 0, cerrados: 0, despachados: 0, cantidadTotal: 0 }, [stats]);
  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);

  return (
    <LibroChrome
      moduleId="forest-lotes"
      eyebrow="Forestal · Especialización"
      title="Lotes de Producción"
      icon={Layers}
      tools={
        <button
          type="button"
          onClick={() => setShowForm(true)}
          title="Agrupá corridas del Libro CTP en un lote comercial con código, grado y certificado QR"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Nuevo lote
        </button>
      }
    >

      {/* La pregunta de la planta no es cuántos lotes hay: es CUÁNTO QUEDA. Las
          cifras salen de los lotes a la vista —el filtro es parte de lo que se
          está midiendo— y sólo de los que miden en m³, porque sumar kg con m³
          da un total sin unidad que parece exacto. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          density="compact"
          label="Lotes"
          value={String(kpis.total)}
          subValue={`${kpis.abiertos} ${kpis.abiertos === 1 ? "abierto" : "abiertos"} · ${
            kpis.cerrados + kpis.despachados
          } ${kpis.cerrados + kpis.despachados === 1 ? "cerrado" : "cerrados"}`}
          icon={Layers}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Armado"
          value={`${n4(resumen.armadoM3)} m³`}
          subValue={`${resumen.armadoPt.toLocaleString("es-PE")} pt`}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Despachado"
          value={`${n4(resumen.despachadoM3)} m³`}
          subValue={resumen.avancePct == null ? "Sin lotes armados" : `${resumen.avancePct}% de lo armado`}
          icon={Truck}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Disponible"
          value={`${n4(resumen.disponibleM3)} m³`}
          subValue={
            resumen.lotesOtraUnidad > 0
              ? `${resumen.disponiblePt.toLocaleString("es-PE")} pt · +${resumen.lotesOtraUnidad} en otra unidad`
              : `${resumen.disponiblePt.toLocaleString("es-PE")} pt · listo para salir`
          }
          icon={PackageCheck}
          emphasis="success"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por código, especie, producto o destino..." className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)} className={`inline-flex h-9 items-center rounded-full border-2 px-3.5 text-sm font-bold transition-colors ${statusFilter === f.key ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Cards para mirar pocos lotes; tabla para BARRER una columna y comparar
            rendimientos. Es la misma data: sólo cambia la forma de leerla. */}
        {([
          { key: "cards", label: "Tarjetas", icon: LayoutGrid },
          { key: "tabla", label: "Tabla", icon: Rows3 },
        ] as const).map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setVista(v.key)}
            aria-pressed={vista === v.key}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition-colors ${
              vista === v.key
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
            }`}
          >
            <v.icon className="h-4 w-4" aria-hidden /> {v.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><strong>Error:</strong> {error}</div>}

      {loading && lotes.length === 0 ? (
        <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando lotes…</p></div>
      ) : lotes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <Layers className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">{search.trim() || statusFilter !== "todos" ? "Ningún lote coincide con el filtro." : "Sin lotes todavía."}</p>
          {!search.trim() && statusFilter === "todos" && <p className="mt-1 text-sm">Creá el primer lote agrupando corridas de producción del Libro CTP.</p>}
        </div>
      ) : vista === "tabla" ? (
        <LotesTabla
          lotes={lotes}
          pagina={pagina}
          porPagina={porPagina}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAbrir={setDetailId}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lotes.map((l) => (
            <LoteCard key={l.id} lote={l} onAbrir={setDetailId} />
          ))}
        </div>
      )}

      {showForm && <LoteForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {detailId && <LoteDetailModal loteId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </LibroChrome>
  );
}
