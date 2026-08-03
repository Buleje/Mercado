"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Repeat, Trash2, AlertTriangle } from "@buleje/design-system/icons";
import { I } from "./ctp-shared";

/**
 * De qué corridas ya terminadas sale este reproceso (ADR-316).
 *
 * Se ofrece **el mismo saldo que valida el servidor** —descontando lo despachado
 * y lo ya reprocesado—, así que la lista no muestra madera que después se va a
 * rechazar. Un picker que ofrece lo que el backend niega enseña al operador a
 * pelearse con el formulario.
 *
 * A diferencia del consumo (que entra desde ingresos) y del despacho (que sale
 * hacia afuera), acá **el producto cambia de tipo**: una tabla se convierte en
 * tablillas. Por eso no se filtra por producto, sólo por unidad.
 */

export type ReprocesoRow = { origenEntryId: string; quantity: string };

type Corrida = {
  id: string;
  lineNo: number | null;
  fecha: string;
  productType: string | null;
  speciesCommon: string | null;
  unit: string | null;
  codigoRaiz: string | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
};

export function sumReproceso(rows: ReprocesoRow[]): number {
  return rows.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
}

export default function CtpReprocesoPicker({
  unidad,
  rows,
  onRowsChange,
  excluirDestinoId,
}: {
  unidad: string;
  rows: ReprocesoRow[];
  onRowsChange: (rows: ReprocesoRow[]) => void;
  excluirDestinoId?: string;
}) {
  const [corridas, setCorridas] = useState<Corrida[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const url = `/api/admin/forestal/ctp/reproceso${excluirDestinoId ? `?destinoEntryId=${encodeURIComponent(excluirDestinoId)}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      setCorridas(r.ok ? ((await r.json()).disponibles ?? []) : []);
    } catch {
      setCorridas([]);
    } finally {
      setCargando(false);
    }
  }, [excluirDestinoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const elegidas = new Set(rows.map((r) => r.origenEntryId));
  const candidatas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (corridas ?? [])
      // Sumar m³ con kg daría un número que no significa nada.
      .filter((c) => (c.unit ?? "m3") === unidad)
      .filter((c) => !elegidas.has(c.id))
      .filter((c) => !t || `${c.lineNo} ${c.productType} ${c.speciesCommon} ${c.codigoRaiz}`.toLowerCase().includes(t))
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `elegidas` se deriva de rows
  }, [corridas, q, unidad, rows]);

  const detalle = (id: string) => (corridas ?? []).find((c) => c.id === id);

  return (
    <div className="sm:col-span-12 space-y-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-[var(--text-tertiary)]" />
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
          ¿Sale de reprocesar producto ya terminado?
        </span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        Opcional. Si esta corrida re-asierra un producto anterior, elegí de cuál: esa cantidad deja de estar
        disponible para despachar.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar corrida por número, producto o especie…"
        className={`${I} h-10`}
      />

      <div className="max-h-44 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        {cargando ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando corridas con saldo…
          </div>
        ) : candidatas.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
            {(corridas ?? []).length === 0
              ? "No hay corridas con saldo para reprocesar."
              : `Ninguna corrida en ${unidad} sin elegir.`}
          </div>
        ) : (
          candidatas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onRowsChange([...rows, { origenEntryId: c.id, quantity: "" }])}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success-500)]/10"
            >
              <span className="min-w-0">
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">#{c.lineNo ?? "?"}</span>{" "}
                <span className="text-sm text-[var(--text-secondary)]">
                  {[c.productType, c.speciesCommon].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {c.disponible} {c.unit ?? "m3"} disp.
              </span>
            </button>
          ))
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const c = detalle(r.origenEntryId);
            const pedido = Number(r.quantity) || 0;
            const excede = c != null && pedido > c.disponible + 0.0001;
            return (
              <li key={r.origenEntryId} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-mono font-bold text-[var(--text-primary)]">#{c?.lineNo ?? "?"}</span>{" "}
                  <span className="text-[var(--text-secondary)]">
                    {[c?.productType, c?.speciesCommon].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={r.quantity}
                  onChange={(e) => onRowsChange(rows.map((x, j) => (i === j ? { ...x, quantity: e.target.value } : x)))}
                  placeholder={c ? String(c.disponible) : "0"}
                  aria-label={`Cantidad de la corrida ${c?.lineNo ?? ""}`}
                  className={`${I} h-9 w-28 font-mono tabular-nums ${excede ? "border-[var(--data-error-500)]" : ""}`}
                />
                <span className="text-xs text-[var(--text-tertiary)]">de {c?.disponible ?? "—"}</span>
                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                  aria-label={`Quitar la corrida ${c?.lineNo ?? ""}`}
                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {excede && (
                  <span className="w-full text-xs font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    Sólo quedan {c?.disponible}
                    {c && c.despachado > 0 ? ` (${c.despachado} ya despachado)` : ""}
                    {c && c.reprocesado > 0 ? ` (${c.reprocesado} ya reprocesado)` : ""}.
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
