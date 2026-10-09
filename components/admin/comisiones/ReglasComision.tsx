"use client";

import { useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { REGLA_GENERAL, TASA_POR_DEFECTO, type ReglaComision } from "@/lib/comisiones/calcular";

type Props = {
  reglas: ReglaComision[];
  equipo: { username: string; name?: string }[];
  nombreDe: (id: string) => string;
  onAgregar: (r: { cashierId: string; minSales: number; maxSales: number | null; rate: number }) => Promise<string | null>;
  onBorrar: (id: string) => Promise<string | null>;
  localesPendientes: { defaultRate?: number; customRates?: Record<string, number> } | null;
  onPasarLocales: () => Promise<string | null>;
};

const CAMPO = "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";

/**
 * Las reglas de comisión guardadas en el sistema (`/api/commission-rules`):
 * valen en todas las computadoras. Una regla es «vendedor + tramo de lo
 * vendido + %»; «Todo el equipo» es el porcentaje general.
 */
export default function ReglasComision({ reglas, equipo, nombreDe, onAgregar, onBorrar, localesPendientes, onPasarLocales }: Props) {
  const [nueva, setNueva] = useState({ cashierId: REGLA_GENERAL, desde: "0", hasta: "", tasa: String(TASA_POR_DEFECTO) });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function correr(fn: () => Promise<string | null>) {
    setOcupado(true);
    setAviso(null);
    const err = await fn();
    setOcupado(false);
    if (err) setAviso(err);
  }

  const agregar = () => {
    const tasa = Number(nueva.tasa);
    const minSales = Number(nueva.desde) || 0;
    const maxSales = nueva.hasta.trim() ? Number(nueva.hasta) : null;
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) { setAviso("El porcentaje va de 0 a 100."); return; }
    if (maxSales != null && maxSales <= minSales) { setAviso("«Hasta» tiene que ser mayor que «desde»."); return; }
    void correr(() => onAgregar({ cashierId: nueva.cashierId, minSales, maxSales, rate: tasa }));
  };

  const ordenadas = [...reglas].sort((a, b) => (a.cashierId === REGLA_GENERAL ? -1 : b.cashierId === REGLA_GENERAL ? 1 : a.cashierId.localeCompare(b.cashierId)) || a.minSales - b.minSales);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold">Reglas de comisión</CardTitle>
        <InfoTip
          title="Reglas de comisión"
          what="A cada vendedor le toca su regla; si no tiene, la de «Todo el equipo»; si no hay ninguna, el 2 %."
          affects="Los tramos van por lo vendido en el período: el tramo en el que cae el total decide el porcentaje de TODO lo vendido."
          example="Todo el equipo 2 %. María: de S/ 0 a S/ 5,000 → 2 %; desde S/ 5,000 → 3 %. Si vende S/ 6,000 gana 3 % de S/ 6,000 = S/ 180."
        />
      </div>

      {localesPendientes && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <span>
            Esta computadora tenía porcentajes guardados sólo aquí (general {localesPendientes.defaultRate ?? TASA_POR_DEFECTO} %
            {Object.keys(localesPendientes.customRates ?? {}).length > 0 && <>, {Object.keys(localesPendientes.customRates ?? {}).length} propios</>}).
          </span>
          <button type="button" disabled={ocupado} onClick={() => void correr(onPasarLocales)} className="min-h-10 font-bold text-[var(--accent-ink)] hover:underline disabled:opacity-50 dark:text-[var(--accent)]">
            Pasarlos al sistema
          </button>
        </div>
      )}

      {ordenadas.length > 0 ? (
        <DataTable>
          <thead><tr><th>Vendedor</th><th className="text-right">Desde</th><th className="text-right">Hasta</th><th className="text-right">%</th><th><span className="sr-only">Borrar</span></th></tr></thead>
          <tbody>
            {ordenadas.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold text-[var(--text-primary)]">{nombreDe(r.cashierId)}</td>
                <td className="text-right tabular-nums">S/ {formatNumber(r.minSales)}</td>
                <td className="text-right tabular-nums">{r.maxSales == null ? "sin tope" : `S/ ${formatNumber(r.maxSales)}`}</td>
                <td className="text-right font-bold tabular-nums">{r.rate} %</td>
                <td className="text-right">
                  <button type="button" disabled={ocupado} aria-label={`Borrar la regla de ${nombreDe(r.cashierId)}`} onClick={() => void correr(() => onBorrar(r.id))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] disabled:opacity-50">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Sin reglas guardadas: se usa el {TASA_POR_DEFECTO} % para todos.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Vendedor
          <select value={nueva.cashierId} onChange={(e) => setNueva((n) => ({ ...n, cashierId: e.target.value }))} className={`${CAMPO} min-w-[10rem]`}>
            <option value={REGLA_GENERAL}>Todo el equipo</option>
            {equipo.map((u) => <option key={u.username} value={u.username}>{u.name || u.username}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Desde S/
          <input inputMode="decimal" value={nueva.desde} onChange={(e) => setNueva((n) => ({ ...n, desde: e.target.value }))} className={`${CAMPO} w-24 text-right`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Hasta S/
          <input inputMode="decimal" value={nueva.hasta} placeholder="sin tope" onChange={(e) => setNueva((n) => ({ ...n, hasta: e.target.value }))} className={`${CAMPO} w-24 text-right`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          %
          <input inputMode="decimal" value={nueva.tasa} onChange={(e) => setNueva((n) => ({ ...n, tasa: e.target.value }))} className={`${CAMPO} w-20 text-right`} />
        </label>
        <button type="button" disabled={ocupado} onClick={agregar} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
          <Plus className="h-4 w-4" aria-hidden /> Agregar regla
        </button>
      </div>
      {aviso && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{aviso}</p>}
    </section>
  );
}
