"use client";

/**
 * CtpAnalisis — pestaña "Análisis": mira hacia ADELANTE (reorden predictivo) y
 * hacia ATRÁS (tendencias mensuales).
 *
 * - Reorden: por especie, cuántos días de materia prima quedan al ritmo de
 *   consumo reciente. Para reponer ANTES de quedarse sin madera.
 * - Tendencias: volumen y rendimiento mes a mes — ¿estoy procesando más o menos?
 *   ¿mi rendimiento sube o baja? Todo derivado de los registros, sin snapshots.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, RefreshCw, TrendingUp } from "@buleje/design-system/icons";
import type { ReordenProyeccion, TendenciaMes } from "@/lib/db/forest-ctp.db";

const n2 = (v: number) => v.toFixed(2);

export default function CtpAnalisis() {
  const [reorden, setReorden] = useState<ReordenProyeccion[] | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaMes[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/forestal/ctp?reorden=1", { credentials: "include" }),
        fetch("/api/admin/forestal/ctp?tendencias=1&meses=6", { credentials: "include" }),
      ]);
      if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).message ?? `HTTP ${r1.status}`);
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).message ?? `HTTP ${r2.status}`);
      setReorden((await r1.json()).reorden ?? []);
      setTendencias((await r2.json()).tendencias ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">Reorden predictivo (¿cuándo me quedo sin madera?) y tendencias de los últimos 6 meses. Derivado del libro, sin configurar nada.</p>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !reorden && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando…</p></div>}

      {reorden && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><TrendingUp className="h-4 w-4" /> Reorden predictivo de materia prima</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Días de stock al ritmo de consumo de los últimos 90 días. Repone antes de que llegue a cero.</p>
          </div>
          {reorden.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">Sin materia prima ni consumo registrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">Especie</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Stock (m³)</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Consumo/mes</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Se agota en</th>
                </tr>
              </thead>
              <tbody>
                {reorden.map((r) => {
                  const u = urgencia(r.diasHastaAgotar);
                  return (
                    <tr key={r.especie} className="border-t border-[var(--rule-soft)]">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">{r.especie}{r.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</span>
                        {r.scientific && <div className="text-xs italic text-[var(--text-tertiary)]">{r.scientific}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(r.saldo)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{r.ratePorDia > 0 ? n2(r.ratePorDia * 30) : "—"}</td>
                      <td className="px-4 py-3 text-right"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${u.cls}`}>{u.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tendencias && tendencias.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MiniBars title="Volumen ingresado por mes (m³)" data={tendencias.map((t) => ({ label: mesCorto(t.mes), value: t.ingresoM3 }))} color="var(--data-success-600)" fmt={n2} />
          <MiniBars title="Rendimiento promedio por mes (%)" data={tendencias.map((t) => ({ label: mesCorto(t.mes), value: t.rendimiento }))} color="var(--data-info-600)" fmt={(v) => v.toFixed(0)} max={100} />
        </div>
      )}
    </div>
  );
}

function urgencia(dias: number | null): { label: string; cls: string } {
  if (dias == null) return { label: "no se agota", cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" };
  if (dias <= 14) return { label: `${dias} días`, cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" };
  if (dias <= 30) return { label: `${dias} días`, cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" };
  return { label: `${dias} días`, cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" };
}

function mesCorto(ym: string): string {
  const [y, m] = ym.split("-");
  const nombres = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${nombres[Number(m)] ?? m}'${y.slice(2)}`;
}

function MiniBars({ title, data, color, fmt, max }: { title: string; data: { label: string; value: number }[]; color: string; fmt: (v: number) => string; max?: number }) {
  const BW = 46, H = 150, PAD_BOTTOM = 26, PAD_TOP = 18;
  const W = Math.max(data.length * BW, BW);
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  const barH = (v: number) => (top > 0 ? (v / top) * (H - PAD_BOTTOM - PAD_TOP) : 0);
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <CardTitle as="h3" className="mb-2 text-sm font-bold text-[var(--text-primary)]">{title}</CardTitle>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} style={{ minWidth: "100%" }} role="img" aria-label={title}>
          {data.map((d, i) => {
            const h = barH(d.value);
            const x = i * BW + 8;
            const y = H - PAD_BOTTOM - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={BW - 16} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={4} fill={color} opacity={0.85} />
                <text x={x + (BW - 16) / 2} y={y - 5} fontSize={9} fontWeight={700} textAnchor="middle" fill="var(--text-secondary)">{d.value > 0 ? fmt(d.value) : ""}</text>
                <text x={x + (BW - 16) / 2} y={H - 10} fontSize={9} textAnchor="middle" fill="var(--text-tertiary)">{d.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
