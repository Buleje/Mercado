"use client";

import { DataTable } from "@buleje/design-system";
import { Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { FilaComision, Rango, ResultadoComisiones } from "@/lib/comisiones/calcular";
import { PERIODOS, type Periodo } from "./use-comisiones";

const fmt = (n: number) => `S/ ${formatNumber(n, { min: 2 })}`;
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const tramoDias = (r: Rango) => `${ddmm(r.desde)}–${ddmm(r.hasta)}`;
const TONO_PAGADA = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const TONO_FALTA = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

/** Pendiente de la fila; con un pago que cruza dice con cuál, en vez de una cifra que no se puede pagar acá. */
function CeldaPendiente({ f }: { f: FilaComision }) {
  if (f.cruce) {
    return f.cubierto ? (
      <span className={TONO_PAGADA} title={`Ya entra en el pago del ${ddmm(f.cruce.desde)} al ${ddmm(f.cruce.hasta)}`}>
        Pagada <span className="text-xs font-semibold">· {tramoDias(f.cruce)}</span>
      </span>
    ) : (
      <span className={TONO_FALTA} title={`Este período se pisa con el pago del ${ddmm(f.cruce.desde)} al ${ddmm(f.cruce.hasta)}: esos días ya se pagaron.`}>
        Cruza <span className="text-xs font-semibold">· {tramoDias(f.cruce)}</span>
      </span>
    );
  }
  return f.pendiente > 0 ? <span className={TONO_FALTA}>{fmt(f.pendiente)}</span> : <span className={TONO_PAGADA}>Pagada</span>;
}
const FUENTE: Record<string, string> = { propia: "propia", general: "general", por_defecto: "por defecto" };
const MEDIOS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "transferencia", label: "Transferencia" },
];

type Props = {
  datos: ResultadoComisiones | null;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  propio: { desde: string; hasta: string };
  onPropio: (r: { desde: string; hasta: string }) => void;
  medio: string;
  onMedio: (m: string) => void;
  pagando: string | null;
  onPagar: (cashierId: string, nombre: string, monto: number) => void;
  /** Con un pago que cruza: pasa a «Elegir fechas» con los días que quedan libres. */
  onVerRango?: (r: Rango) => void;
  loading: boolean;
  /** En el estado vacío: lo único accionable es dejar lista la regla antes de vender. */
  onVerReglas?: () => void;
};

const CAMPO = "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]";

/** Lo ganado por vendedor en el período, con el período pegado a la tabla. Las cifras vienen del backend. */
export default function TablaComisiones({ datos, periodo, onPeriodo, propio, onPropio, medio, onMedio, pagando, onPagar, onVerRango, loading, onVerReglas }: Props) {
  const filas = datos?.filas ?? [];
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--rule-soft)] px-3 py-2">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => onPeriodo(p.id)}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3 text-xs font-bold transition-colors",
                periodo === p.id ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === "fechas" && (
          <span className="flex items-center gap-1.5">
            <input type="date" aria-label="Desde" value={propio.desde} max={propio.hasta || undefined} onChange={(e) => onPropio({ ...propio, desde: e.target.value })} className={CAMPO} />
            <input type="date" aria-label="Hasta" value={propio.hasta} min={propio.desde || undefined} onChange={(e) => onPropio({ ...propio, hasta: e.target.value })} className={CAMPO} />
          </span>
        )}
        {datos && <span className="text-xs tabular-nums text-[var(--text-secondary)]">{datos.desde} a {datos.hasta}</span>}
        <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          Pagar con
          <select value={medio} onChange={(e) => onMedio(e.target.value)} className={CAMPO}>
            {MEDIOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {loading && !datos ? (
        <div className="flex justify-center p-8" role="status" aria-label="Calculando comisiones">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filas.length === 0 ? (
        <div className="p-10 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Sin ventas con vendedor en este período.</p>
          {onVerReglas && (
            <button type="button" onClick={onVerReglas} className="mt-2 min-h-10 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
              Ver las reglas de comisión
            </button>
          )}
        </div>
      ) : (
        <DataTable className={cn("min-w-[720px]", loading && "opacity-60")}>
          <thead>
            <tr>
              <th>Vendedor</th><th className="text-right">Ventas</th><th className="text-right">Vendido</th><th className="text-right">Regla</th>
              <th className="text-right">Comisión</th><th className="text-right">Pagado</th><th className="text-right">Pendiente</th><th><span className="sr-only">Pagar</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.cashierId}>
                <td className="font-semibold text-[var(--text-primary)]">{f.cashierName}</td>
                <td className="text-right tabular-nums text-[var(--text-secondary)]">{f.ventas}</td>
                <td className="text-right tabular-nums text-[var(--text-primary)]">{fmt(f.vendido)}</td>
                <td className="text-right tabular-nums text-[var(--text-secondary)]" title={f.tramo ?? undefined}>{f.tasa} % <span className="text-xs">· {FUENTE[f.fuente]}</span></td>
                <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{fmt(f.comision)}</td>
                <td className="text-right tabular-nums text-[var(--text-secondary)]">{f.pagado > 0 ? fmt(f.pagado) : "—"}</td>
                <td className="text-right font-bold tabular-nums"><CeldaPendiente f={f} /></td>
                <td className="text-right">
                  {f.pendiente > 0 && (
                    <button type="button" disabled={pagando != null || loading} onClick={() => onPagar(f.cashierId, f.cashierName, f.pendiente)} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50">
                      {pagando === f.cashierId ? "Pagando…" : "Pagar"}
                    </button>
                  )}
                  {f.cruce && !f.cubierto && f.libre && onVerRango && (
                    <button type="button" disabled={loading} onClick={() => { if (f.libre) onVerRango(f.libre); }} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-2 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 dark:text-[var(--accent)]">
                      Ver {tramoDias(f.libre)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {datos && (
              <tr className="bg-[var(--surface-sunken)] font-bold">
                <td className="text-[var(--text-primary)]">Total</td>
                <td className="text-right tabular-nums">{datos.totales.ventas}</td>
                <td className="text-right tabular-nums">{fmt(datos.totales.vendido)}</td>
                <td />
                <td className="text-right tabular-nums">{fmt(datos.totales.comision)}</td>
                <td className="text-right tabular-nums">{fmt(datos.totales.pagado)}</td>
                <td className="text-right tabular-nums">{fmt(datos.totales.pendiente)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
