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
  Layers, Plus, RefreshCw, Search, PackageCheck, Boxes, Truck, Tag, Users,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { StatCard } from "@buleje/design-system";
import LibroChrome from "@/components/admin/shared/libro-chrome";
import { useDebounce } from "@/hooks/use-debounce";
import { LABEL_OPERATIVO, estadoOperativo } from "@/lib/forestal/lote-ventana";
import { avanceDeLote, enPieTablar, resumenLotes } from "@/lib/forestal/lote-metricas";
import LoteForm from "./LoteForm";
import LoteDetailModal from "./LoteDetailModal";

type LoteStatus = "abierto" | "cerrado" | "despachado" | "anulado";

interface LoteRow {
  id: string; loteCode: string; productType: string | null;
  speciesCommon: string | null; cites: boolean; unit: string;
  grade: string | null; destino: string | null; status: LoteStatus;
  miembrosCount: number; totalCantidad: number; createdAt: string;
  /** Lo que ya salió y lo que queda del lote (despachos vivos). */
  despachado: number; disponible: number;
  /** Ventana de trabajo y dueño de la madera (ADR-327). */
  fechaInicio?: string | null; fechaFin?: string | null; titularNombre?: string | null;
}
interface Stats { total: number; abiertos: number; cerrados: number; despachados: number; cantidadTotal: number }

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const STATUS_FILTERS: { key: LoteStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "cerrado", label: "Cerrados" },
  { key: "despachado", label: "Despachados" },
  { key: "anulado", label: "Anulados" },
];
const STATUS_CHIP: Record<LoteStatus, string> = {
  abierto: "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
  cerrado: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
  despachado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  anulado: "bg-[var(--data-error-100)] text-[var(--data-error-700)]",
};
const STATUS_LABEL: Record<LoteStatus, string> = { abierto: "Abierto", cerrado: "Cerrado", despachado: "Despachado", anulado: "Anulado" };
/** `timeZone: "UTC"` NO es cosmético: las fechas del libro son date-only y sin
 *  esto, a las 19:00 de Lima, un 20-jul se dibuja como 19-jul. Mismo criterio
 *  que CtpEntriesView y el resto del módulo. */
/** Las cantidades viajan por JSON: un Decimal de Prisma puede llegar como
 *  string y `.toFixed()` sobre un string revienta en pantalla (la regresión que
 *  motivó la regla de lint). Se coacciona SIEMPRE antes de formatear. */
const n4 = (v: number | string | null | undefined) => (Number(v) || 0).toFixed(4);

const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };

/**
 * En qué anda el lote según su VENTANA — distinto del estado comercial.
 *
 * Sin fechas no dibuja nada: un chip "sin fechas" en cada card sería ruido en
 * las plantas que no usan la ventana.
 */
function OperativoChip({ lote }: { lote: { fechaInicio?: string | null; fechaFin?: string | null } }) {
  const est = estadoOperativo(lote);
  if (est === "sin_fecha") return null;
  const tono =
    est === "en_proceso"
      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : est === "programado"
        ? "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/10 dark:text-[var(--data-info-500)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold ${tono}`}>
      {LABEL_OPERATIVO[est]}
    </span>
  );
}

/**
 * Cuánto del lote ya salió, como barra.
 *
 * Un lote SIN corridas no dibuja barra: una barra vacía se lee como "no
 * despaché nada de lo que tengo", que es lo contrario de "todavía no armé nada".
 */
function LoteAvance({ lote }: { lote: LoteRow }) {
  const { pct, completo, sinArmar } = avanceDeLote(lote);
  if (sinArmar) {
    return (
      <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">Sin corridas todavía.</p>
    );
  }
  return (
    <div
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Despachado ${pct}% del lote ${lote.loteCode}`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[var(--motion-slow)]",
          completo ? "bg-[var(--data-success-500)]" : "bg-[var(--accent)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

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
          label="Lotes"
          value={String(kpis.total)}
          subValue={`${kpis.abiertos} ${kpis.abiertos === 1 ? "abierto" : "abiertos"} · ${
            kpis.cerrados + kpis.despachados
          } ${kpis.cerrados + kpis.despachados === 1 ? "cerrado" : "cerrados"}`}
          icon={Layers}
          emphasis="neutral"
        />
        <StatCard
          label="Armado"
          value={`${n4(resumen.armadoM3)} m³`}
          subValue={`${resumen.armadoPt.toLocaleString("es-PE")} pt`}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard
          label="Despachado"
          value={`${n4(resumen.despachadoM3)} m³`}
          subValue={resumen.avancePct == null ? "Sin lotes armados" : `${resumen.avancePct}% de lo armado`}
          icon={Truck}
          emphasis="neutral"
        />
        <StatCard
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

      {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><strong>Error:</strong> {error}</div>}

      {loading && lotes.length === 0 ? (
        <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando lotes…</p></div>
      ) : lotes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <Layers className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">{search.trim() || statusFilter !== "todos" ? "Ningún lote coincide con el filtro." : "Sin lotes todavía."}</p>
          {!search.trim() && statusFilter === "todos" && <p className="mt-1 text-sm">Creá el primer lote agrupando corridas de producción del Libro CTP.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lotes.map((l) => (
            <button key={l.id} type="button" onClick={() => setDetailId(l.id)} className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-left transition-colors hover:border-[var(--brand-ink)] hover:bg-[var(--surface-canvas)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{l.loteCode}</span>
                <div className="flex items-center gap-1.5">
                  {/* Dos ejes distintos: el comercial (abierto/cerrado) y el
                      operativo (programado/en proceso/finalizado). Un lote puede
                      estar abierto y ya terminado de aserrar. */}
                  <OperativoChip lote={l} />
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold ${STATUS_CHIP[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{l.productType ?? "—"}</span>
                {l.speciesCommon && <span className="text-[var(--text-secondary)]">· {l.speciesCommon}</span>}
                {l.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
              </div>
              <div className="border-t border-[var(--rule-soft)] pt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
                    {n4(l.totalCantidad)}{" "}
                    <span className="text-sm font-normal text-[var(--text-tertiary)]">{UNIT_LABELS[l.unit] ?? l.unit}</span>
                  </span>
                  {/* Acá la madera se habla en pie tablar: el m³ es el del libro,
                      el pt es el que usa el comprador. Van los dos o hay que
                      convertir de cabeza en el teléfono. */}
                  {l.unit === "m3" && (
                    <span className="font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
                      {enPieTablar(l.totalCantidad).toLocaleString("es-PE")} pt
                    </span>
                  )}
                </div>
                <LoteAvance lote={l} />
                <div className="mt-1.5 flex items-center justify-between text-sm text-[var(--text-tertiary)]">
                  <span>{l.miembrosCount} {l.miembrosCount === 1 ? "corrida" : "corridas"}</span>
                  <span>
                    Quedan{" "}
                    <b className="font-mono tabular-nums text-[var(--text-primary)]">{n4(l.disponible)}</b>{" "}
                    {UNIT_LABELS[l.unit] ?? l.unit}
                  </span>
                </div>
              </div>
              {l.titularNombre && (
                <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <Users className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">Madera de {l.titularNombre}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                {l.grade ? <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />{l.grade}</span> : <span />}
                <span>{l.fechaInicio || l.fechaFin ? `${l.fechaInicio ? fmtDate(l.fechaInicio) : "?"} → ${l.fechaFin ? fmtDate(l.fechaFin) : "?"}` : fmtDate(l.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm && <LoteForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {detailId && <LoteDetailModal loteId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </LibroChrome>
  );
}
