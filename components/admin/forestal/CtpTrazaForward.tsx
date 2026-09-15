"use client";

/**
 * CtpTrazaForward — sección "¿A dónde fue esta madera?": trazabilidad HACIA
 * ADELANTE de un ingreso (ingreso → corridas que lo consumieron → despachos).
 *
 * Single source: la usan el detalle del ingreso (CtpEntryDetailModal) y el modal
 * "Cadena" abierto desde la tabla (CtpIngresoCadenaModal). Self-fetch por
 * `?trazaForward=<woodEntryId>` — cada consumidor solo le pasa el id.
 */

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Loader2,
  PackageOpen,
  Truck,
} from "@buleje/design-system/icons";
import { formatDate } from "./ctp-shared";
import type { TrazaForwardIngreso } from "@/lib/db/forest-ctp.db";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function TrazaForwardSection({ entryId }: { entryId: string }) {
  const [data, setData] = useState<TrazaForwardIngreso | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/forestal/ctp?trazaForward=${encodeURIComponent(entryId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) setData((j.trazaForward ?? null) as TrazaForwardIngreso | null); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [entryId]);

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--rule-soft)] pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <ArrowRight className="h-4 w-4" />
        </span>
        <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          ¿A dónde fue esta madera?
        </CardTitle>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Rastreando la cadena…
        </div>
      )}
      {error && !loading && (
        <p className="flex items-start gap-2 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo rastrear: {error}
        </p>
      )}

      {data && !loading && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-info-100)] px-3 py-1 text-xs font-bold text-[var(--data-info-700)]">
              <Boxes className="h-3.5 w-3.5" /> {data.consumidoM3.toFixed(2)} m³ a producción
            </span>
            {data.sinConsumirM3 > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
                <PackageOpen className="h-3.5 w-3.5" /> {data.sinConsumirM3.toFixed(2)} m³ en patio
              </span>
            )}
          </div>

          {data.corridas.length === 0 ? (
            <p className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
              Esta madera todavía no entró a producción — sigue en patio.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {data.corridas.map((c) => (
                <li key={c.produccionEntryId} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]" />
                        <span className="truncate text-sm font-bold text-[var(--text-primary)]">
                          Corrida #{c.lineNo}{c.productType ? ` · ${c.productType}` : ""}
                        </span>
                        {c.status === "anulado" && (
                          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">anulada</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                        {formatDate(c.entryDate)}{c.speciesCommon ? ` · ${c.speciesCommon}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                      {fmtM3(c.volumeConsumidoM3)} m³
                      <span className="block text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">de este ingreso</span>
                    </span>
                  </div>

                  {c.despachos.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5 border-t border-[var(--rule-soft)] pt-2.5">
                      {c.despachos.map((d) => (
                        <li key={d.despachoEntryId} className="flex items-center gap-2 text-xs">
                          <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" />
                          <span className="font-medium text-[var(--text-primary)]">Despacho #{d.lineNo}</span>
                          <span className="text-[var(--text-tertiary)]">{d.destino ?? "sin destino"}</span>
                          {d.gtfNumber && <span className="font-mono text-[var(--text-tertiary)]">· {d.gtfNumber}</span>}
                          <span className="ml-auto shrink-0 font-mono tabular-nums text-[var(--text-secondary)]">{d.quantity.toFixed(2)} {d.unit ?? ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 flex items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2 text-xs text-[var(--text-tertiary)]">
                      <PackageOpen className="h-3.5 w-3.5 shrink-0" /> Aún sin despachar — en stock de producto.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
