"use client";

/**
 * LothRentabilidadPanel — pestaña "Rentabilidad" del Libro TH. Reencuadra el
 * costeo (que la Analítica muestra como tabla) en un dashboard de NEGOCIO:
 * ¿cuánto gano por especie? ¿cuál deja más y cuál pierde plata?
 *
 * Reusa el mismo `costeo` de `/plan?analytics=1` (computeCosteo) → nunca dice
 * números distintos que la Analítica. Margen = precio venta − (derecho VEN +
 * extracción + transformación + flete), por m³ movilizado.
 */

import { useCallback, useEffect, useState } from "react";
import { Coins, TrendingUp, TrendingDown, Award, Wallet, RefreshCw, Calculator } from "@buleje/design-system/icons";
import { StatCard, LoadingState, ErrorAlert, WarningAlert } from "@buleje/design-system";
import { Btn } from "./ctp-shared";

interface CosteoRow {
  species: string;
  cites: boolean;
  movilizadoM3: number;
  precioVentaM3: number;
  costoTotalM3: number;
  margenM3: number;
  margenPct: number;
  ingreso: number;
  costo: number;
  margen: number;
}
interface Costeo {
  rows: CosteoRow[];
  ingresoTotal: number;
  costoTotal: number;
  margenTotal: number;
  margenPctTotal: number;
  costoOperativoM3: number;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function LothRentabilidadPanel() {
  const [costeo, setCosteo] = useState<Costeo | null>(null);
  const [hasPlan, setHasPlan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      const a = (await r.json()).analytics;
      setHasPlan(!!a?.hasPlan);
      setCosteo(a?.costeo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading && costeo === null && !error) return <LoadingState message="Calculando rentabilidad..." />;
  if (error && costeo === null) {
    return <ErrorAlert title="No se pudo calcular la rentabilidad" description={error} action={<Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>} />;
  }

  // Sin costeo: el plan no declara precios de venta / VEN por especie, o no hay
  // volumen movilizado. La rentabilidad no se puede calcular todavía.
  if (!costeo || costeo.rows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Recargar</Btn>
        </div>
        <WarningAlert
          title="Todavía no se puede calcular la rentabilidad"
          description={
            hasPlan
              ? "Cargá el precio de venta y el valor al estado natural (VEN) por especie en el Plan de Manejo, y registrá despachos, para ver el margen."
              : "Registrá o activá un Plan de Manejo con precios por especie para calcular la rentabilidad."
          }
        />
      </div>
    );
  }

  const rows = [...costeo.rows].sort((a, b) => b.margen - a.margen);
  const mejor = rows[0];
  const peor = rows[rows.length - 1];
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.margen)), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-tertiary)]">Margen por especie = precio de venta − (derecho VEN + extracción + transformación + flete). Mismos números que la Analítica.</p>
        <Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Recargar</Btn>
      </div>

      {/* Insight accionable */}
      <div className="grid gap-3 sm:grid-cols-2">
        {mejor && mejor.margen > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] p-4">
            <Award className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-700)]" />
            <div>
              <p className="text-sm font-bold text-[var(--data-success-700)]">La que más deja: {mejor.species}</p>
              <p className="text-xs text-[var(--text-secondary)]">{soles(mejor.margen)} de margen ({pct(mejor.margenPct)}) sobre {mejor.movilizadoM3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³ movilizados.</p>
            </div>
          </div>
        )}
        {peor && peor.margen < 0 && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] p-4">
            <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-700)]" />
            <div>
              <p className="text-sm font-bold text-[var(--data-error-700)]">Pierde plata: {peor.species}</p>
              <p className="text-xs text-[var(--text-secondary)]">{soles(peor.margen)} ({pct(peor.margenPct)}). Revisá el precio de venta o los costos de esta especie.</p>
            </div>
          </div>
        )}
      </div>

      {/* P&L del aprovechamiento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Ingreso (movilizado)" value={soles(costeo.ingresoTotal)} subValue="ventas estimadas" icon={Wallet} emphasis="neutral" />
        <StatCard label="Costo total" value={soles(costeo.costoTotal)} subValue={`operativo ${soles(costeo.costoOperativoM3)}/m³`} icon={Calculator} emphasis="neutral" />
        <StatCard
          label="Margen"
          value={soles(costeo.margenTotal)}
          subValue={pct(costeo.margenPctTotal)}
          icon={costeo.margenTotal >= 0 ? TrendingUp : TrendingDown}
          emphasis={costeo.margenTotal > 0 ? "success" : costeo.margenTotal < 0 ? "error" : "neutral"}
        />
      </div>

      {/* Ranking por margen */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Especie</Th>
              <Th className="text-right">Movilizado</Th>
              <Th className="text-right">Precio/m³</Th>
              <Th className="text-right">Costo/m³</Th>
              <Th className="text-right">Margen/m³</Th>
              <Th className="text-right">Margen total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.species} className="border-t border-[var(--rule-soft)]">
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    {i === 0 && r.margen > 0 && <Award className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />}
                    <span className="font-medium text-[var(--text-primary)]">{r.species}</span>
                    {r.cites && <span className="rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                  </span>
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.movilizadoM3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.precioVentaM3)}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.costoTotalM3)}</Td>
                <Td className={`text-right font-mono tabular-nums font-bold ${r.margenM3 >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{soles(r.margenM3)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
                      <span className={`block h-full ${r.margen >= 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`} style={{ width: `${Math.max(4, (Math.abs(r.margen) / maxAbs) * 100)}%` }} />
                    </span>
                    <span className={`font-mono tabular-nums font-bold ${r.margen >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{soles(r.margen)}</span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <Coins className="h-3.5 w-3.5" /> El margen no incluye el pago por derecho de aprovechamiento de área (0.01% UIT × ha), que es fijo del plan.
      </p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
