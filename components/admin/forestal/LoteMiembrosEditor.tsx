"use client";

/**
 * LoteMiembrosEditor — elegí de qué corridas de producción se arma un lote
 * (ADR-136). Reusado por LoteForm (alta) y LoteDetailModal (edición).
 *
 * Fetchea las corridas con saldo (`lotes?available=1&excludeLoteId=`) — el
 * saldo ya descuenta lo puesto en OTROS lotes, así que no se puede empaquetar
 * dos veces lo mismo. La invariante L1 la revalida el backend al guardar; acá
 * sólo avisamos antes para no fallar en el submit.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search, Trash2 } from "@buleje/design-system/icons";

export interface LoteRow {
  produccionEntryId: string;
  label: string;
  sub: string | null;
  disponible: number;
  quantity: string;
}

interface AvailableCorrida {
  id: string;
  code: string | null;
  productType: string | null;
  species: string | null;
  disponible: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export default function LoteMiembrosEditor({
  excludeLoteId,
  unitLabel,
  rows,
  onRowsChange,
}: {
  excludeLoteId?: string;
  unitLabel: string;
  rows: LoteRow[];
  onRowsChange: (rows: LoteRow[]) => void;
}) {
  const [available, setAvailable] = useState<AvailableCorrida[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const p = new URLSearchParams({ available: "1" });
        if (excludeLoteId) p.set("excludeLoteId", excludeLoteId);
        const r = await fetch(`/api/admin/forestal/lotes?${p}`, { credentials: "include" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        if (!cancel) setAvailable((await r.json()).items ?? []);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [excludeLoteId]);

  const filtered = useMemo(() => {
    const inRows = new Set(rows.map((r) => r.produccionEntryId));
    const q = query.trim().toLowerCase();
    return available
      .filter((it) => !inRows.has(it.id))
      .filter((it) => !q || `${it.code ?? ""} ${it.species ?? ""} ${it.productType ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [available, rows, query]);

  const total = r4(rows.reduce((a, r) => a + (Number(r.quantity) || 0), 0));
  const overSome = rows.some((r) => Number(r.quantity) > r.disponible + 1e-9);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando corridas disponibles…
      </div>
    );
  }

  return (
    /* El título lo pone la sección que lo contiene (`Seccion numero={2}`): acá
       repetirlo dejaba "CORRIDAS DEL LOTE" dos veces, una debajo de la otra. */
    <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Buscador para agregar corridas */}
      <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar corrida por producto o especie..."
          className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
        />
      </div>
      {filtered.length > 0 && (
        <ul className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  onRowsChange([
                    ...rows,
                    {
                      produccionEntryId: it.id,
                      label: it.code ?? "—",
                      sub: [it.productType, it.species].filter(Boolean).join(" · ") || null,
                      disponible: it.disponible,
                      quantity: String(it.disponible),
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
                  {it.disponible.toFixed(4)} {unitLabel} disp.
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && available.length === 0 && (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">
          No hay corridas de producción con saldo disponible. Registrá producción en el Libro CTP primero.
        </p>
      )}

      {/* Filas elegidas */}
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const over = Number(r.quantity) > r.disponible + 1e-9;
            return (
              <li key={r.produccionEntryId} className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] px-2.5 py-2">
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
                  onChange={(e) => onRowsChange(rows.map((x) => (x.produccionEntryId === r.produccionEntryId ? { ...x, quantity: e.target.value } : x)))}
                  className={`h-9 w-28 shrink-0 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${over ? "border-[var(--data-error-500)] focus:border-[var(--data-error-600)] focus:ring-[var(--data-error-600)]/20" : "border-[var(--rule-base)] focus:border-[var(--data-success-600)] focus:ring-[var(--data-success-600)]/20"}`}
                />
                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((x) => x.produccionEntryId !== r.produccionEntryId))}
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

      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-2 text-xs">
          <span className="text-[var(--text-tertiary)]">Total del lote</span>
          <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{total.toFixed(4)} {unitLabel}</span>
        </div>
      )}
      {overSome && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Alguna corrida pide más de lo disponible.
        </p>
      )}
    </div>
  );
}

/** ¿Las filas son válidas para guardar? (todas > 0 y dentro del disponible) */
export function loteRowsValidas(rows: LoteRow[]): boolean {
  return rows.length > 0 && rows.every((r) => Number(r.quantity) > 0 && Number(r.quantity) <= r.disponible + 1e-9);
}
