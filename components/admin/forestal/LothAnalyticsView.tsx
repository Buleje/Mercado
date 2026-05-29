"use client";

/**
 * LothAnalyticsView — Inteligencia del LO-TH (Batch 2 · frente C, ADR-126):
 *  - Cascada de aprovechamiento bosque→producto (funnel de volumen).
 *  - Rendimiento por especie + merma.
 *  - Proyección de agotamiento del saldo + valorización.
 *  - Detección de anomalías (defensa ante fiscalización).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, Gauge, Coins, CalendarClock, Activity, CheckCircle2,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";

interface Funnel {
  taladoM3: number; trozadoM3: number; despachoTrozaM3: number;
  consumidoM3: number; productoCantidad: number; despachoProductoM3: number;
}
interface Analytics {
  hasPlan: boolean;
  plan: { planNumber: string | null; titularName: string; estado: string; vigenciaHasta: string | null } | null;
  aprovechamiento: { funnel: Funnel; bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[]; rendimientoGlobalPct: number };
  balance: { rows: { species: string; movilizado: number; saldo: number; valorMovilizado: number }[]; pagoDerechoTotal: number; valorTotal: number } | null;
  anomalias: { level: "error" | "warn"; code: string; message: string; species?: string }[];
  projection: { ritmoDiaM3: number; diasParaAgotar: number; fechaAgotamientoISO: string | null } | null;
  lateCount: number;
}

const fm = (n: number, dp = 2) => n.toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fdate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "—");

export default function LothAnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setData((await r.json()).analytics);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const funnelSteps = useMemo(() => {
    if (!data) return [];
    const f = data.aprovechamiento.funnel;
    const base = f.taladoM3 || 1;
    return [
      { label: "Tala (en pie tumbado)", v: f.taladoM3, tone: "var(--data-success-600)" },
      { label: "Trozado", v: f.trozadoM3, tone: "var(--data-success-500)" },
      { label: "Despacho de trozas", v: f.despachoTrozaM3, tone: "var(--data-info-500)" },
      { label: "Consumo (aserrío)", v: f.consumidoM3, tone: "var(--data-info-600)" },
      { label: "Despacho producto term.", v: f.despachoProductoM3, tone: "var(--brand-ink)" },
    ].map((s) => ({ ...s, pct: Math.round((s.v / base) * 100) }));
  }, [data]);

  if (loading && !data) return <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando inteligencia…</p></div>;
  if (error) return <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>;
  if (!data) return null;

  const errores = data.anomalias.filter((a) => a.level === "error");
  const warns = data.anomalias.filter((a) => a.level === "warn");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-tertiary)]">
          {data.hasPlan ? <>Plan activo: <b className="text-[var(--text-secondary)]">{data.plan?.titularName}</b>{data.plan?.planNumber ? ` · ${data.plan.planNumber}` : ""}</> : "Sin plan activo — la proyección y el balance requieren un Plan de Manejo configurado."}
        </p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rendimiento de aprovechamiento" value={`${data.aprovechamiento.rendimientoGlobalPct}%`} subValue="trozado / talado" icon={TrendingUp} emphasis={data.aprovechamiento.rendimientoGlobalPct >= 60 ? "success" : "warning"} />
        <StatCard label="Valor movilizado" value={`S/ ${fm(data.balance?.valorTotal ?? 0)}`} subValue={`pago derecho S/ ${fm(data.balance?.pagoDerechoTotal ?? 0)}`} icon={Coins} emphasis="neutral" />
        <StatCard label="Saldo se agota en" value={data.projection ? `${data.projection.diasParaAgotar} días` : "—"} subValue={data.projection ? fdate(data.projection.fechaAgotamientoISO) : "sin ritmo aún"} icon={CalendarClock} emphasis={data.projection && data.projection.diasParaAgotar < 60 ? "warning" : "neutral"} />
        <StatCard label="Anomalías" value={String(data.anomalias.length)} subValue={`${errores.length} graves · ${warns.length} alertas`} icon={AlertTriangle} emphasis={errores.length > 0 ? "error" : warns.length > 0 ? "warning" : "success"} />
      </div>

      {/* Anomalías */}
      {data.anomalias.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-200)] bg-[var(--data-success-50)] px-4 py-3 text-sm font-medium text-[var(--data-success-900)]"><CheckCircle2 className="h-4 w-4" /> Sin anomalías detectadas. El libro es consistente.</div>
      ) : (
        <div className="space-y-2">
          {[...errores, ...warns].map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm ${a.level === "error" ? "border-[var(--data-danger-300)] bg-[var(--data-danger-50)] text-[var(--data-danger-900)]" : "border-[var(--data-warning-300)] bg-[var(--data-warning-50)] text-[var(--data-warning-900)]"}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><b className="uppercase tracking-wide text-[length:var(--ts-2xs)]">{a.level === "error" ? "Grave" : "Alerta"}</b> · {a.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cascada de aprovechamiento */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--brand-ink)]" /><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Cascada de aprovechamiento (m³)</CardTitle></div>
        <div className="space-y-3">
          {funnelSteps.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{s.label}</span>
                <span className="font-mono tabular-nums text-[var(--text-primary)]"><b>{fm(s.v, 4)}</b> m³ <span className="text-xs text-[var(--text-tertiary)]">· {s.pct}%</span></span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.pct)}%`, backgroundColor: s.tone }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rendimiento por especie */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3"><Gauge className="h-4 w-4 text-[var(--brand-ink)]" /><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Rendimiento por especie</CardTitle></div>
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr><Th>Especie</Th><Th className="text-right">Talado (m³)</Th><Th className="text-right">Trozado (m³)</Th><Th className="text-right">Rendimiento</Th><Th className="text-right">Merma (m³)</Th></tr>
          </thead>
          <tbody>
            {data.aprovechamiento.bySpecies.map((s) => (
              <tr key={s.species} className="border-t border-[var(--rule-soft)]">
                <Td>
                  <span className="font-medium text-[var(--text-primary)]">{s.species}</span>
                  {s.cites && <span className="ml-2 rounded bg-[var(--data-danger-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">CITES</span>}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{fm(s.taladoM3, 4)}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{fm(s.trozadoM3, 4)}</Td>
                <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${s.rendimientoPct >= 60 ? "text-[var(--data-success-700)]" : "text-[var(--data-warning-700)]"}`}>{s.rendimientoPct}%</span></Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fm(s.mermaM3, 4)}</Td>
              </tr>
            ))}
            {data.aprovechamiento.bySpecies.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[var(--text-tertiary)]">Sin talas registradas todavía.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Proyección + valorización por especie */}
      {data.balance && data.balance.rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3"><Coins className="h-4 w-4 text-[var(--brand-ink)]" /><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Valorización y saldo por especie</CardTitle></div>
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr><Th>Especie</Th><Th className="text-right">Movilizado (m³)</Th><Th className="text-right">Saldo (m³)</Th><Th className="text-right">Valor movilizado</Th></tr>
            </thead>
            <tbody>
              {data.balance.rows.map((r) => (
                <tr key={r.species} className="border-t border-[var(--rule-soft)]">
                  <Td className="font-medium text-[var(--text-primary)]">{r.species}</Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{fm(r.movilizado, 4)}</Td>
                  <Td className="text-right font-mono tabular-nums"><span className={r.saldo < 0 ? "text-[var(--data-danger-700)]" : "text-[var(--text-primary)]"}>{fm(r.saldo, 4)}</span></Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">S/ {fm(r.valorMovilizado)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
