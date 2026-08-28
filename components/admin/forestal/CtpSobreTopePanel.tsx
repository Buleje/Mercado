"use client";

/**
 * Las corridas que declaran más de lo que sale de su materia prima (ADR-358).
 *
 * El tope del 56 % frena lo que se registre de ahora en más. Lo que **ya estaba
 * cargado** queda invisible justo cuando la regla pasa a existir, y es lo que un
 * fiscalizador cruza primero: una corrida al 73 % dice que salió más madera de
 * la que entró.
 *
 * Es el espejo del barrido de guías descuadradas: el mismo cruce, del otro lado
 * del libro. No bloquea nada —lo hecho está hecho— pero lo pone a la vista con
 * el número y el camino.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle2, Gauge, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import {
  RENDIMIENTO_TOPE_PCT,
  corridasSobreTope,
  type CorridaParaTope,
  type CorridaSobreTope,
} from "@/lib/forestal/produccion-paquetes";
import { Btn } from "./ctp-shared";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

export default function CtpSobreTopePanel({ onNavigate }: { onNavigate?: () => void }) {
  const [filas, setFilas] = useState<CorridaSobreTope[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const barrer = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      /* Sin período: una corrida de julio por encima del tope sigue estando en
         el libro que se presenta. Mismo criterio que el barrido de descuadres. */
      const r = await ctpGet<{ entries?: CorridaParaTope[] }>(
        "/api/admin/forestal/ctp?section=produccion",
      );
      setFilas(corridasSobreTope(r.entries ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void barrer();
  }, [barrer]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--data-warning-600)]" />
          <CardTitle as="h3" className="text-sm font-bold">
            Corridas por encima del tope{" "}
            {filas != null && <span className="text-[var(--text-tertiary)]">({filas.length})</span>}
          </CardTitle>
        </div>
        <Btn variant="secondary" onClick={() => void barrer()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Rebarrer
        </Btn>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        De 1 m³ de troza no salen más de <b>{RENDIMIENTO_TOPE_PCT} %</b> de tabla. Estas corridas declaran más: el
        tope frena las nuevas, pero éstas ya estaban cargadas. Se corrigen anulando la corrida y volviéndola a
        declarar con lo que realmente salió.
      </p>

      {error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {filas == null ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cruzando cada corrida contra su materia prima…
        </p>
      ) : filas.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 p-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Ninguna corrida declara más de lo que sale de su materia prima.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 text-left font-bold">Corrida</th>
                <th className="px-3 py-2 text-left font-bold">Producto</th>
                <th className="px-3 py-2 text-left font-bold">Lote</th>
                <th className="px-3 py-2 text-right font-bold">Entró</th>
                <th className="px-3 py-2 text-right font-bold">Declaró</th>
                <th className="px-3 py-2 text-right font-bold">Rend.</th>
                <th className="px-3 py-2 text-right font-bold">De más</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">#{f.lineNo}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{f.producto}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{f.lote ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {f.entradaM3.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {f.salidaM3.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    {f.rendimientoPct} %
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    {f.excesoM3.toFixed(4)} m³
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>
        </div>
      )}

      {filas != null && filas.length > 0 && onNavigate && (
        <Btn variant="secondary" onClick={onNavigate}>
          Ver Producción
        </Btn>
      )}
    </section>
  );
}
