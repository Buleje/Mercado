"use client";

/**
 * CtpAtribucionEditor — editar la atribución de una línea DESPUÉS del alta.
 *
 * Cierra el hueco que dejó ADR-134/135: los PUT de /ctp/consumos y
 * /ctp/origenes existían y validaban I1/I2/I4/I5, pero la única UI que
 * escribía atribución era el form de alta — un despacho con cadena incompleta
 * solo se arreglaba anulando y recreando.
 *
 * UN componente para los DOS eslabones (config por `kind`):
 *   - "origenes": despacho → corridas  (PUT /ctp/origenes, valida I4/I5)
 *   - "consumos": corrida  → ingresos  (PUT /ctp/consumos, valida I1/I2)
 *
 * Los pickers del form NO se reusan a propósito: CtpConsumosPicker edita
 * `costoProceso`, que el PUT post-alta no acepta — mostrar un input que no se
 * guarda sería mentir. `disponible` viene del backend con
 * `excludeCtpEntryId` (lo que esta línea ya usa no cuenta en su contra).
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface EditorRow {
  id: string;
  label: string;
  sub: string | null;
  /** Techo que I2/I5 va a exigir igual: mejor mostrarlo que fallar al guardar. */
  disponible: number;
  quantity: string;
}

interface AvailableItem {
  id?: string;
  code: string | null;
  species: string | null;
  productType?: string | null;
  disponible?: number | null;
  cites?: boolean;
}

const CONFIG = {
  origenes: {
    available: "despacho",
    endpoint: "/api/admin/forestal/ctp/origenes",
    payload: (entryId: string, rows: EditorRow[]) => ({
      despachoEntryId: entryId,
      origenes: rows.map((r) => ({ produccionEntryId: r.id, quantity: Number(r.quantity) })),
    }),
    searchPlaceholder: "Buscar corrida por producto o especie...",
    emptyMsg: "No hay corridas con saldo disponible.",
  },
  consumos: {
    available: "produccion",
    endpoint: "/api/admin/forestal/ctp/consumos",
    payload: (entryId: string, rows: EditorRow[]) => ({
      ctpEntryId: entryId,
      consumos: rows.map((r) => ({ woodEntryId: r.id, volumeM3: Number(r.quantity) })),
    }),
    searchPlaceholder: "Buscar guía por GTF o especie...",
    emptyMsg: "No hay ingresos validados con saldo disponible.",
  },
} as const;

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export default function CtpAtribucionEditor({
  kind,
  entryId,
  unitLabel,
  declared,
  current,
  onSaved,
  onCancel,
}: {
  kind: "origenes" | "consumos";
  entryId: string;
  unitLabel: string;
  /** Cantidad/volumen declarado de la línea — contra esto se avisa el faltante. */
  declared: number;
  current: { id: string; label: string; sub: string | null; quantity: number }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const cfg = CONFIG[kind];
  const [rows, setRows] = useState<EditorRow[] | null>(null);
  const [available, setAvailable] = useState<AvailableItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/forestal/ctp?available=${cfg.available}&excludeCtpEntryId=${encodeURIComponent(entryId)}`,
          { credentials: "include" },
        );
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        const items: AvailableItem[] = (await r.json()).items ?? [];
        if (cancel) return;
        setAvailable(items);
        const dispDe = new Map(items.map((it) => [it.id, Number(it.disponible ?? 0)]));
        // Si la fuente ya no está en "available" (ej. corrida anulada después de
        // atribuir), el techo defensivo es lo que ya tiene: no se puede subir.
        setRows(current.map((c) => ({ ...c, disponible: dispDe.get(c.id) ?? c.quantity, quantity: String(c.quantity) })));
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [cfg.available, entryId, current]);

  const filtered = useMemo(() => {
    const inRows = new Set((rows ?? []).map((r) => r.id));
    const q = query.trim().toLowerCase();
    return available
      .filter((it) => it.id && !inRows.has(it.id))
      .filter((it) => !q || `${it.code ?? ""} ${it.species ?? ""} ${it.productType ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [available, rows, query]);

  const total = r4((rows ?? []).reduce((a, r) => a + (Number(r.quantity) || 0), 0));
  const sobre = rows !== null && rows.length > 0 && r4(total - declared) > 0;
  const faltante = !sobre && declared > 0 ? r4(declared - total) : 0;
  const overDisponible = (rows ?? []).some((r) => Number(r.quantity) > r.disponible + 1e-9);
  const invalida = (rows ?? []).some((r) => r.quantity !== "" && Number(r.quantity) <= 0);

  async function save() {
    if (!rows) return;
    const limpias = rows.filter((r) => Number(r.quantity) > 0);
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(cfg.endpoint, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(cfg.payload(entryId, limpias)),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando fuentes disponibles…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)]/40 p-4">
      {/* Buscador para AGREGAR fuentes */}
      <div className="flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={cfg.searchPlaceholder}
          className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
        />
      </div>
      {filtered.length > 0 && (
        <ul className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  setRows((prev) => [
                    ...(prev ?? []),
                    {
                      id: it.id as string,
                      label: it.code ?? "—",
                      sub: [it.productType, it.species].filter(Boolean).join(" · ") || null,
                      disponible: Number(it.disponible ?? 0),
                      quantity: "",
                    },
                  ]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)]"
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? "—"}</span>
                  {it.species && <span className="truncate text-xs text-[var(--text-secondary)]">{it.species}</span>}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {Number(it.disponible ?? 0).toFixed(4)} {unitLabel} disp.
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Filas actuales */}
      {rows && rows.length === 0 ? (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">
          Sin atribución: buscá arriba para agregar {kind === "origenes" ? "corridas" : "guías"}.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(rows ?? []).map((r) => {
            const over = Number(r.quantity) > r.disponible + 1e-9;
            return (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{r.label}</span>
                    {r.sub && <span className="truncate text-xs text-[var(--text-secondary)]">{r.sub}</span>}
                  </div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">máx. {r.disponible.toFixed(4)} {unitLabel}</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max={r.disponible}
                  value={r.quantity}
                  onChange={(e) => setRows((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, quantity: e.target.value } : x)))}
                  className={`h-9 w-28 shrink-0 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${over ? "border-[var(--data-error-500)] focus:border-[var(--data-error-600)] focus:ring-[var(--data-error-600)]/20" : "border-[var(--rule-base)] focus:border-[var(--data-success-600)] focus:ring-[var(--data-success-600)]/20"}`}
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id))}
                  aria-label={`Quitar ${r.label}`}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Avisos — espejo de los pickers del form */}
      <div className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-2 text-xs">
        <span className="text-[var(--text-tertiary)]">Total atribuido</span>
        <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{total.toFixed(4)} / {declared.toFixed(4)} {unitLabel}</span>
      </div>
      {overDisponible && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Alguna fila pide más de lo disponible.
        </p>
      )}
      {sobre && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> El total atribuido supera lo declarado ({declared.toFixed(4)} {unitLabel}).
        </p>
      )}
      {faltante > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Quedan {faltante.toFixed(4)} {unitLabel} sin atribuir: la cadena queda incompleta.
        </p>
      )}
      {error && <p className="text-xs font-bold text-[var(--data-error-700)]">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || overDisponible || sobre || invalida || rows === null}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar atribución
        </button>
      </div>
    </div>
  );
}
