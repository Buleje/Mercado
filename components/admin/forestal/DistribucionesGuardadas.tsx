"use client";

/**
 * DistribucionesGuardadas — el historial de "Distribución de rolliza sobre lo
 * aserrado": cada tanda de bloques que se cargó queda guardada con su nombre
 * y su fecha, para volver a abrirla después sin tipear nada de nuevo
 * (Brandon, 2026-09-01: "para cuando quiera en otro lado después pueda
 * escoger eso guardado y se ponga todos los datos de los bloques").
 *
 * Vive en el servidor (KV por tenant), no en el navegador: mismo motivo que
 * `CubicacionesGuardadas` — tiene que sobrevivir al celular que se formatea y
 * verse desde otra computadora.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, FolderOpen, Layers, Loader2, Search, Trash2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { filtrarDistribuciones, type DistribucionRegistro } from "@/lib/forestal/distribucion-registro";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

// date-only con timeZone UTC: sin eso, en Lima la fecha se corre un día.
const fmtFecha = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function DistribucionesGuardadas({
  onAbrir, onCerrar, recargarToken,
}: {
  /** Reemplaza los bloques de la tabla por los de esta distribución guardada. */
  onAbrir: (d: DistribucionRegistro) => void;
  onCerrar: () => void;
  /** Cambia cuando se guardó algo nuevo, para refrescar la lista. */
  recargarToken?: number;
}) {
  const [lista, setLista] = useState<DistribucionRegistro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/distribuciones", { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message ?? `No se pudo cargar el historial (HTTP ${r.status})`);
      }
      const j = (await r.json()) as { distribuciones: DistribucionRegistro[] };
      setLista(j.distribuciones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, recargarToken]);

  const borrar = async (d: DistribucionRegistro) => {
    if (!window.confirm(`¿Borrar la distribución "${d.nombre}"? No se puede deshacer.`)) return;
    setBorrando(d.id);
    try {
      const r = await fetch(`/api/admin/forestal/distribuciones?id=${encodeURIComponent(d.id)}`, {
        method: "DELETE", headers: csrfHeaders(), credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLista((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(`No se pudo borrar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBorrando(null);
    }
  };

  const visibles = useMemo(() => filtrarDistribuciones(lista, busqueda), [lista, busqueda]);

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Layers className="h-4 w-4 text-[var(--accent)]" /> Distribuciones guardadas ({lista.length})
        </CardTitle>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el historial" className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, fecha, etiqueta o permiso…"
          aria-label="Buscar distribuciones guardadas"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none"
        />
      </label>

      {error && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {cargando ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando tus distribuciones…
        </p>
      ) : visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          {lista.length === 0
            ? "Todavía no guardaste ninguna distribución. Cargá los bloques y tocá «Guardar»."
            : "Ninguna distribución coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{d.nombre}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {fmtFecha(d.fecha)}
                  {d.createdBy ? ` · ${d.createdBy}` : ""}
                </p>
                {d.notas && <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{d.notas}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  {/* Los dos volúmenes se muestran por separado: la troza y la
                      madera ya aserrada no se suman (`totalesDeDistribucion`). */}
                  <div className="font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]" title="Rolliza cargada en esta distribución">{fmtM3(d.totales.rollizaM3)} m³ <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">(R)</span></div>
                  {(d.totales.aserradaDirectaM3 ?? 0) > 0 && (
                    <div className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]" title="Madera cargada ya aserrada, sin troza de origen">
                      + {fmtM3(d.totales.aserradaDirectaM3 ?? 0)} m³ <span className="font-normal text-[var(--text-tertiary)]">(A) directos</span>
                    </div>
                  )}
                  <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {d.totales.bloques} bloque{d.totales.bloques === 1 ? "" : "s"} · {d.totales.especies} especie{d.totales.especies === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onAbrir(d)} title="Reemplazar los bloques cargados por los de esta distribución"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent)] hover:brightness-95">
                    <FolderOpen className="h-3.5 w-3.5" /> Abrir
                  </button>
                  <button type="button" onClick={() => onAbrir({ ...d, id: "", nombre: `${d.nombre} (copia)` })} title="Empezar una distribución nueva con estos mismos bloques"
                    aria-label={`Duplicar ${d.nombre}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void borrar(d)} disabled={borrando === d.id}
                    aria-label={`Borrar ${d.nombre}`} title="Borrar"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] disabled:opacity-40 dark:hover:text-[var(--data-error-500)]">
                    {borrando === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
