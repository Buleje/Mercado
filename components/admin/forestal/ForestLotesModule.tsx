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
import { EmptyState, ErrorAlert, SectionTitle, StatCard } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import LibroChrome from "@/components/admin/shared/libro-chrome";
import ContratoActivoChip from "@/components/admin/forestal/ContratoActivoChip";
import { useDebounce } from "@/hooks/use-debounce";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { resumenLotes } from "@/lib/forestal/lote-metricas";
import LoteForm from "./LoteForm";
import LoteDetailModal from "./LoteDetailModal";
import LotesTabla from "./LotesTabla";
import LoteCard, { type LoteRow, type LoteStatus } from "./LoteCard";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

interface Stats { total: number; abiertos: number; cerrados: number; despachados: number; cantidadTotal: number }

const STATUS_FILTERS: { key: LoteStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "cerrado", label: "Cerrados" },
  { key: "despachado", label: "Despachados" },
  { key: "anulado", label: "Anulados" },
];

export default function ForestLotesModule({
  embebido = false,
}: {
  /**
   * Montado DENTRO de Libro CTP › Despacho › «Lotes comerciales y QR» (plan
   * «panel unificado», F34 — Brandon 2026-10-09): sin cabina propia (sería una
   * cabina dentro de otra); el permiso de trabajo ya lo muestra la del libro.
   * Suelto (`?tab=forestal-lotes`, el QR viejo) conserva su cabina.
   */
  embebido?: boolean;
}) {
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LoteStatus | "todos">("todos");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [showForm, setShowForm] = useState(false);
  /* `?lote=<id>`: la ficha del lote vive en la URL (enlace copiable; el «atrás» la cierra). */
  const fichaLote = useFichaEnUrl("lote");
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

  /* La acción principal con la piel de «Nuevo ingreso» del mismo libro (desde
     `--accent-600`: con `--accent` el blanco quedaba en 3,2:1). En la cabina
     suelta mide lo que sus vecinos (h-10); dentro de Despacho, 48 px. */
  const botonNuevo = (alto: "h-10" | "h-12") => (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      title="Agrupa corridas del Libro CTP en un lote comercial con código, grado y certificado QR"
      className={`inline-flex ${alto} items-center justify-center gap-2 ${alto === "h-12" ? "rounded-2xl px-5" : "rounded-xl px-4"} bg-linear-to-br from-[var(--accent-600)] to-[var(--accent-dark)] text-sm font-semibold text-white shadow-sm transition duration-[var(--dur-fast)] hover:shadow-md hover:brightness-110`}
    >
      <Plus className="h-4 w-4" /> Nuevo lote
    </button>
  );

  const cuerpo = (
    <>
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
          value={`${fmtM3(resumen.armadoM3)} m³`}
          subValue={`${formatNumber(resumen.armadoPt)} pt`}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Despachado"
          value={`${fmtM3(resumen.despachadoM3)} m³`}
          subValue={resumen.avancePct == null ? "Sin lotes armados" : `${resumen.avancePct}% de lo armado`}
          icon={Truck}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Disponible"
          value={`${fmtM3(resumen.disponibleM3)} m³`}
          subValue={
            resumen.lotesOtraUnidad > 0
              ? `${formatNumber(resumen.disponiblePt)} pt · +${resumen.lotesOtraUnidad} en otra unidad`
              : `${formatNumber(resumen.disponiblePt)} pt · listo para salir`
          }
          icon={PackageCheck}
          emphasis="success"
        />
      </div>

      {/* Una barra: el buscador, cómo se lee (tarjetas para mirar pocos lotes,
          tabla para BARRER una columna y comparar rendimientos: la misma data)
          y Recargar; el estado, pegado a lo que filtra. Todo a 48 px. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 min-w-0 flex-1 basis-full items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:basis-0">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por código, especie, producto o destino..."
            aria-label="Buscar lotes"
            className="w-full min-w-0 bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        <SegmentedControl<"cards" | "tabla">
          size="lg"
          label="Cómo ver los lotes"
          value={vista}
          onChange={setVista}
          options={[
            { value: "cards", label: "Tarjetas", icon: <LayoutGrid className="h-4 w-4" /> },
            { value: "tabla", label: "Tabla", icon: <Rows3 className="h-4 w-4" /> },
          ]}
        />
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Recargar
        </button>
      </div>

      {/* En el celular las cinco opciones no entran en 368 px: la fila se desliza. */}
      <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:px-1 max-sm:pb-1">
        <SegmentedControl<LoteStatus | "todos">
          size="lg"
          label="Estado del lote"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
        />
      </div>

      {error && <ErrorAlert title="No se pudieron cargar los lotes" description={error} />}

      {loading && lotes.length === 0 ? (
        <div className="flex h-48 items-center justify-center" role="status" aria-label="Cargando lotes">
          <LoadingSpinner size={32} />
        </div>
      ) : lotes.length === 0 ? (
        search.trim() || statusFilter !== "todos" ? (
          <EmptyState icon={Layers} title="Ningún lote coincide" description="Prueba con otro estado o borra la búsqueda." />
        ) : (
          <EmptyState icon={Layers} title="Sin lotes todavía" description="Agrupa corridas de producción del Libro CTP en un lote con su código y su QR." />
        )
      ) : vista === "tabla" ? (
        <LotesTabla
          lotes={lotes}
          pagina={pagina}
          porPagina={porPagina}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAbrir={fichaLote.abrir}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lotes.map((l) => (
            <LoteCard key={l.id} lote={l} onAbrir={fichaLote.abrir} />
          ))}
        </div>
      )}

      {showForm && <LoteForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {fichaLote.id && <LoteDetailModal key={fichaLote.id} loteId={fichaLote.id} onClose={fichaLote.cerrar} onChanged={load} />}
    </>
  );

  if (embebido) {
    return (
      <div className="space-y-4" data-vista-lotes-qr>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <SectionTitle as="h2">Lotes comerciales</SectionTitle>
            <InfoTip
              title="Lotes comerciales y QR"
              what="Agrupa corridas de producción del libro en un lote con código, grado y estado; cada lote tiene su certificado y su QR verificable."
              affects="La cadena de custodia del lote es la de sus corridas: sale del mismo libro."
            />
          </span>
          <div className="ml-auto">{botonNuevo("h-12")}</div>
        </div>
        {cuerpo}
      </div>
    );
  }

  return (
    <LibroChrome
      moduleId="forest-lotes"
      eyebrow="Forestal · Especialización"
      title="Lotes de Producción"
      icon={Layers}
      /* El permiso de TRABAJO (Brandon 2026-09-19): un lote empaqueta corridas
         que ya salieron del Libro CTP bajo un título habilitante — saber cuál
         importa tanto acá como en el libro de origen. */
      contrato={<ContratoActivoChip />}
      tools={botonNuevo("h-10")}
    >
      {cuerpo}
    </LibroChrome>
  );
}
