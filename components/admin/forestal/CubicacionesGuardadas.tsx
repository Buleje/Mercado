"use client";

/**
 * CubicacionesGuardadas — el historial del cubicador: cada lote medido queda
 * guardado con su nombre, su fecha y sus totales congelados, y se puede
 * reabrir para seguir trabajando o volver a exportarlo.
 *
 * Vive en el servidor (KV por tenant), no en el navegador: la cubicación es el
 * respaldo de una compra o un despacho y tiene que sobrevivir al celular que
 * se formatea y verse desde la computadora de la oficina.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Copy, FileText, Loader2, Search, Table, Trash2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { filtrarCubicaciones, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { m3DesdePt } from "@/lib/forestal/cubicacion";

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const soles = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// date-only con timeZone UTC: sin eso, en Lima la fecha se corre un día.
const fmtFecha = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function CubicacionesGuardadas({
  onAbrir, onCerrar, recargarToken,
}: {
  /** Carga esa cubicación en la tabla del cubicador. */
  onAbrir: (c: CubicacionRegistro) => void;
  onCerrar: () => void;
  /** Cambia cuando se guardó algo nuevo, para refrescar la lista. */
  recargarToken?: number;
}) {
  const [lista, setLista] = useState<CubicacionRegistro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);
  /** Qué fila mostró "Copiado" último — se apaga sola, no queda pegado si se
   *  copian varios códigos seguidos (Brandon, 2026-09-01: código de cubicación
   *  para pegarlo después en Resumen por Permiso como objetivo). */
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const copiarCodigo = (c: CubicacionRegistro) => {
    navigator.clipboard
      ?.writeText(c.id)
      .then(() => {
        setCopiadoId(c.id);
        setTimeout(() => setCopiadoId((v) => (v === c.id ? null : v)), 1500);
      })
      .catch(() => setCopiadoId(null));
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message ?? `No se pudo cargar el historial (HTTP ${r.status})`);
      }
      const j = (await r.json()) as { cubicaciones: CubicacionRegistro[] };
      setLista(j.cubicaciones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, recargarToken]);

  const borrar = async (c: CubicacionRegistro) => {
    if (!window.confirm(`¿Borrar la cubicación "${c.nombre}"? No se puede deshacer.`)) return;
    setBorrando(c.id);
    try {
      const r = await fetch(`/api/admin/forestal/cubicaciones?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE", headers: csrfHeaders(), credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLista((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(`No se pudo borrar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBorrando(null);
    }
  };

  const visibles = useMemo(() => filtrarCubicaciones(lista, busqueda), [lista, busqueda]);
  const acumulado = useMemo(
    () => visibles.reduce((a, c) => ({ pt: a.pt + c.totales.pieTablar, valor: a.valor + c.valor }), { pt: 0, valor: 0 }),
    [visibles],
  );

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <FileText className="h-4 w-4 text-[var(--accent)]" /> Cubicaciones guardadas ({lista.length})
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
          placeholder="Buscar por nombre, cliente, especie o fecha…"
          aria-label="Buscar cubicaciones guardadas"
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
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando tus cubicaciones…
        </p>
      ) : visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          {lista.length === 0
            ? "Todavía no guardaste ninguna cubicación. Cubicá un lote y tocá «Guardar»."
            : "Ninguna cubicación coincide con la búsqueda."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visibles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {fmtFecha(c.fecha)}
                    {c.cliente ? ` · ${c.cliente}` : ""}
                    {c.especie ? ` · ${c.especie}` : ""}
                    {c.createdBy ? ` · ${c.createdBy}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => copiarCodigo(c)}
                    title={`Copiar el código de esta cubicación (${c.id}) — pegalo en Resumen por Permiso como objetivo`}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="h-3 w-3" aria-hidden />
                    {copiadoId === c.id ? "Código copiado" : `Código …${c.id.slice(-8)}`}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{fmtPt(c.totales.pieTablar)} PT</div>
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {c.totales.piezas} pzas · {fmtM3(m3DesdePt(c.totales.pieTablar))} m³{c.valor > 0 ? ` · S/ ${soles(c.valor)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => onAbrir(c)} title="Abrir en el cubicador para seguir o exportar"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent)] hover:brightness-95">
                      <Table className="h-3.5 w-3.5" /> Abrir
                    </button>
                    <button type="button" onClick={() => onAbrir({ ...c, id: "", nombre: `${c.nombre} (copia)` })} title="Empezar una cubicación nueva con estas mismas piezas"
                      aria-label={`Duplicar ${c.nombre}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void borrar(c)} disabled={borrando === c.id}
                      aria-label={`Borrar ${c.nombre}`} title="Borrar"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] disabled:opacity-40 dark:hover:text-[var(--data-error-500)]">
                      {borrando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Lo que suman las cubicaciones que estás viendo (útil al filtrar por cliente o mes) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <Calculator className="h-3.5 w-3.5" /> {busqueda ? "Suma de lo filtrado" : "Suma de todo el historial"}
            </span>
            <span className="font-mono text-sm font-extrabold tabular-nums text-[var(--accent)]">
              {fmtPt(acumulado.pt)} PT{acumulado.valor > 0 ? ` · S/ ${soles(acumulado.valor)}` : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
