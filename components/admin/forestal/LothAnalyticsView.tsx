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
  Calculator, Save, Wallet,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

interface Funnel {
  taladoM3: number; trozadoM3: number; despachoTrozaM3: number;
  consumidoM3: number; productoCantidad: number; despachoProductoM3: number;
}
interface CosteoRow {
  species: string; cites: boolean; movilizadoM3: number; precioVentaM3: number; costoTotalM3: number;
  margenM3: number; margenPct: number; ingreso: number; costo: number; margen: number;
  desglose: { venM3: number; extraccionM3: number; transformacionM3: number; fleteM3: number };
}
interface Analytics {
  hasPlan: boolean;
  plan: { id: string; planNumber: string | null; titularName: string; estado: string; vigenciaHasta: string | null; costos: { extraccionM3: number; transformacionM3: number; fleteM3: number } } | null;
  aprovechamiento: { funnel: Funnel; bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[]; rendimientoGlobalPct: number };
  balance: { rows: { species: string; movilizado: number; saldo: number; valorMovilizado: number }[]; pagoDerechoTotal: number; valorTotal: number } | null;
  anomalias: { level: "error" | "warn"; code: string; message: string; species?: string }[];
  projection: { ritmoDiaM3: number; diasParaAgotar: number; fechaAgotamientoISO: string | null } | null;
  lateCount: number;
  costeo: { rows: CosteoRow[]; ingresoTotal: number; costoTotal: number; margenTotal: number; margenPctTotal: number; costoOperativoM3: number } | null;
}

const fm = (n: number, dp = 2) => n.toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fdate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "—");

export default function LothAnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costForm, setCostForm] = useState({ extraccionM3: "", transformacionM3: "", fleteM3: "" });
  const [savingCosts, setSavingCosts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const a: Analytics = (await r.json()).analytics;
      setData(a);
      if (a.plan?.costos) setCostForm({
        extraccionM3: a.plan.costos.extraccionM3 ? String(a.plan.costos.extraccionM3) : "",
        transformacionM3: a.plan.costos.transformacionM3 ? String(a.plan.costos.transformacionM3) : "",
        fleteM3: a.plan.costos.fleteM3 ? String(a.plan.costos.fleteM3) : "",
      });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveCosts() {
    if (!data?.plan?.id) return;
    setSavingCosts(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          id: data.plan.id,
          costoExtraccionM3: costForm.extraccionM3 ? Number(costForm.extraccionM3) : null,
          costoTransformacionM3: costForm.transformacionM3 ? Number(costForm.transformacionM3) : null,
          costoFleteM3: costForm.fleteM3 ? Number(costForm.fleteM3) : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSavingCosts(false); }
  }

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

      {/* Costeo & margen por m³ (Batch 3 · frente D) */}
      {data.hasPlan && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <div className="mb-4 flex items-center gap-2"><Calculator className="h-4 w-4 text-[var(--brand-ink)]" /><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Costeo y margen por m³</CardTitle></div>

          {/* Config de costos operativos (S//m³) */}
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 sm:grid-cols-4">
            <CostInput label="Extracción S//m³" hint="tala + arrastre + patio" value={costForm.extraccionM3} onChange={(v) => setCostForm((f) => ({ ...f, extraccionM3: v }))} />
            <CostInput label="Transformación S//m³" hint="aserrío" value={costForm.transformacionM3} onChange={(v) => setCostForm((f) => ({ ...f, transformacionM3: v }))} />
            <CostInput label="Flete S//m³" hint="transporte a destino" value={costForm.fleteM3} onChange={(v) => setCostForm((f) => ({ ...f, fleteM3: v }))} />
            <div className="flex items-end">
              <button type="button" onClick={saveCosts} disabled={savingCosts} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {savingCosts ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar costos
              </button>
            </div>
          </div>

          {data.costeo && data.costeo.rows.length > 0 ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Ingreso (movilizado)" value={`S/ ${fm(data.costeo.ingresoTotal)}`} icon={Coins} emphasis="neutral" />
                <StatCard label="Costo total" value={`S/ ${fm(data.costeo.costoTotal)}`} subValue={`op. S/ ${fm(data.costeo.costoOperativoM3)}/m³`} icon={Wallet} emphasis="neutral" />
                <StatCard label="Margen" value={`S/ ${fm(data.costeo.margenTotal)}`} icon={TrendingUp} emphasis={data.costeo.margenTotal >= 0 ? "success" : "error"} />
                <StatCard label="Margen %" value={`${data.costeo.margenPctTotal}%`} subValue="sobre ingreso" icon={Gauge} emphasis={data.costeo.margenPctTotal >= 25 ? "success" : data.costeo.margenPctTotal >= 0 ? "warning" : "error"} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-sunken)] text-left">
                    <tr><Th>Especie</Th><Th className="text-right">Precio/m³</Th><Th className="text-right">Costo/m³</Th><Th className="text-right">Margen/m³</Th><Th className="text-right">Margen %</Th><Th className="text-right">Margen total</Th></tr>
                  </thead>
                  <tbody>
                    {data.costeo.rows.map((c) => (
                      <tr key={c.species} className="border-t border-[var(--rule-soft)]">
                        <Td>
                          <span className="font-medium text-[var(--text-primary)]">{c.species}</span>
                          {c.cites && <span className="ml-2 rounded bg-[var(--data-danger-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">CITES</span>}
                          <div className="text-xs text-[var(--text-tertiary)]">VEN {fm(c.desglose.venM3)} + ext {fm(c.desglose.extraccionM3)} + transf {fm(c.desglose.transformacionM3)} + flete {fm(c.desglose.fleteM3)}</div>
                        </Td>
                        <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">S/ {fm(c.precioVentaM3)}</Td>
                        <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">S/ {fm(c.costoTotalM3)}</Td>
                        <Td className="text-right font-mono tabular-nums"><span className={c.margenM3 >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-danger-700)]"}>S/ {fm(c.margenM3)}</span></Td>
                        <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${c.margenPct >= 25 ? "text-[var(--data-success-700)]" : c.margenPct >= 0 ? "text-[var(--data-warning-700)]" : "text-[var(--data-danger-700)]"}`}>{c.margenPct}%</span></Td>
                        <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">S/ {fm(c.margen)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-[var(--text-tertiary)]">El precio de venta y el VEN (derecho) salen de cada especie del plan; los costos operativos se aplican por m³ a todas. Margen = precio − (VEN + extracción + transformación + flete).</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Configurá precios de venta en las especies del plan y registrá movilización para ver el margen.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CostInput({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">{label}</span>
      <input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)]" />
      <span className="mt-1 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</span>
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
