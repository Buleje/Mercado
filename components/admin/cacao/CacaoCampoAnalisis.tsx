"use client";

/**
 * CacaoCampoAnalisis — productividad y rentabilidad por sección del campo.
 * Cruza cosechas (kg + valor de los lotes de acopio) con costos de labores
 * (ya posteados a Finanzas) → kg/ha, kg/planta, margen, ROI y ranking. Todo
 * computado en backend (view=analytics), sin schema nuevo. Brandon 2026-07-03.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertCircle, TrendingUp, Scale, Coins, Trees, Trophy } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";

interface Seccion {
  id: string; codigo: string; nombre: string | null; variedad: string | null;
  areaHa: number | null; nPlantas: number | null; cosechaKg: number;
  rendKgHa: number | null; rendKgPlanta: number | null;
  ingresos: number; kgSinValorar: number; costos: number;
  margen: number; margenHa: number | null; roi: number | null;
  tendencia: { anio: number; kg: number }[];
}
interface Totales {
  secciones: number; areaHa: number; cosechaKg: number; rendKgHa: number | null;
  ingresos: number; costos: number; margen: number; kgSinValorar: number;
}

const soles = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const kg = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
const n1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 1 }));
const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 2 }));

/** Sparkline de barras de la tendencia de cosecha por campaña. */
function Sparkline({ data }: { data: { anio: number; kg: number }[] }) {
  if (data.length < 2) return <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">—</span>;
  const max = Math.max(...data.map((d) => d.kg)) || 1;
  return (
    <span className="inline-flex h-6 items-end gap-0.5" title={data.map((d) => `${d.anio}: ${kg(d.kg)} kg`).join(" · ")}>
      {data.map((d) => (
        <span key={d.anio} className="w-1.5 rounded-sm bg-[var(--accent)]" style={{ height: `${Math.max(10, (d.kg / max) * 100)}%` }} />
      ))}
    </span>
  );
}

export default function CacaoCampoAnalisis({ onOpenParcela }: { onOpenParcela: (id: string) => void }) {
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo?view=analytics", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setSecciones(d.secciones ?? []); setTotales(d.totales ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const conCosecha = useMemo(() => secciones.filter((s) => s.cosechaKg > 0), [secciones]);
  const mejor = conCosecha.find((s) => s.rendKgHa != null) ?? null;

  if (loading && secciones.length === 0) return <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando…</p></div>;
  if (error) return <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error} <button onClick={load} className="ml-2 underline">reintentar</button></div></div>;
  if (secciones.length === 0) return <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]"><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><TrendingUp className="h-7 w-7" /></span><p className="text-base font-bold text-[var(--text-primary)]">Sin datos para analizar</p><p className="mx-auto mt-1 max-w-sm text-sm">Registrá cosechas y costos de labores en tus secciones y acá verás rendimiento, ingresos y margen por sección.</p></div>;

  return (
    <div className="space-y-5">
      {totales && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Cosecha total" value={`${kg(totales.cosechaKg)} kg`} subValue={totales.kgSinValorar > 0 ? `${kg(totales.kgSinValorar)} kg sin valorar` : undefined} icon={Trees} emphasis="neutral" />
          <StatCard label="Rendimiento" value={totales.rendKgHa != null ? `${n1(totales.rendKgHa)} kg/ha` : "—"} subValue={`${n2(totales.areaHa)} ha totales`} icon={TrendingUp} emphasis="neutral" />
          <StatCard label="Ingresos − costos" value={`S/ ${soles(totales.ingresos)}`} subValue={`− S/ ${soles(totales.costos)} costos`} icon={Coins} emphasis="neutral" />
          <StatCard label="Margen del campo" value={`S/ ${soles(totales.margen)}`} icon={Scale} emphasis={totales.margen > 0 ? "success" : totales.margen < 0 ? "error" : "neutral"} />
        </div>
      )}

      {mejor && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--data-success-500)] text-white"><Trophy className="h-5 w-5" /></span>
          <p className="text-[var(--data-success-700)]">Sección más productiva: <strong>{mejor.codigo}</strong> con <strong>{n1(mejor.rendKgHa)} kg/ha</strong>{mejor.roi != null && <> · ROI <strong>{n2(mejor.roi)}×</strong></>}.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)]">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              <th className="px-3 py-2 font-bold">Sección</th>
              <th className="px-3 py-2 text-right font-bold">Área</th>
              <th className="px-3 py-2 text-right font-bold">Cosecha</th>
              <th className="px-3 py-2 text-right font-bold">kg/ha</th>
              <th className="px-3 py-2 text-right font-bold">kg/planta</th>
              <th className="px-3 py-2 text-right font-bold">Ingresos</th>
              <th className="px-3 py-2 text-right font-bold">Costos</th>
              <th className="px-3 py-2 text-right font-bold">Margen</th>
              <th className="px-3 py-2 text-right font-bold">ROI</th>
              <th className="px-3 py-2 text-center font-bold">Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {secciones.map((s, i) => (
              <tr key={s.id} onClick={() => onOpenParcela(s.id)} className="cursor-pointer border-b border-[var(--rule-base)] last:border-0 hover:bg-[var(--surface-canvas)]">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    {i === 0 && s.rendKgHa != null && <Trophy className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />}
                    <span className="font-mono font-bold text-[var(--text-primary)]">{s.codigo}</span>
                    {s.variedad && <span className="text-xs text-[var(--text-tertiary)]">{s.variedad}</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{s.areaHa != null ? `${n1(s.areaHa)} ha` : "—"}</td>
                <td className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">{s.cosechaKg > 0 ? `${kg(s.cosechaKg)} kg` : "—"}</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{n1(s.rendKgHa)}</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{n2(s.rendKgPlanta)}</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{s.ingresos > 0 ? `S/ ${soles(s.ingresos)}` : "—"}</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{s.costos > 0 ? `S/ ${soles(s.costos)}` : "—"}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${s.margen > 0 ? "text-[var(--data-success-700)]" : s.margen < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>{s.ingresos > 0 || s.costos > 0 ? `S/ ${soles(s.margen)}` : "—"}</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{s.roi != null ? `${n2(s.roi)}×` : "—"}</td>
                <td className="px-3 py-2.5 text-center"><Sparkline data={s.tendencia} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">Ingresos = valor de los lotes de acopio generados por las cosechas de la sección. Costos = labores con costo (posteadas a Finanzas). Tocá una fila para ver la sección. Las cosechas sin precio no suman a ingresos (se cuentan como “sin valorar”).</p>
    </div>
  );
}
