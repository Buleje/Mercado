"use client";

/**
 * CacaoResumen — dashboard de campaña del cacao (ADR-128, v2 potenciado).
 * Self-fetch de stats + trends + inventory. KPIs hero + secundarios, barra de
 * calidad apilada, distribuciones (variedad/grado), tendencia mensual, top
 * productores, alerta de humedad + reporte imprimible.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Scale, Coins, PackageCheck, Users, Leaf, Warehouse, TrendingUp, Award, Droplets,
  AlertCircle, Download, RefreshCw, Calendar, Beaker, Percent, Banknote,
  Trees, Stethoscope, ClipboardList,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { GRADO_LABEL, type CacaoGrado } from "@/lib/cacao/cacao-quality";
import { PLAGA_LABEL, type CacaoPlaga } from "@/lib/cacao/cacao-sanidad";
import { printCacaoReporte } from "@/lib/cacao/cacao-reporte";

// Gráfico central grande (recharts) fuera del bundle inicial.
const CacaoResumenChart = dynamic(() => import("./CacaoResumenChart"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"><RefreshCw className="h-6 w-6 animate-spin" /></div>,
});

interface Stats {
  lotes: number; productoresActivos: number; kgAcopiados: number; valorPagado: number;
  precioPromKg: number; ticketPromLote: number; kgPromLote: number; kgSeco: number; kgHumedo: number;
  pctGradoI: number; indiceFermentacionProm: number; pctHumedadEnNorma: number; humedadMuestras: number;
  primeraFecha: string | null; ultimaFecha: string | null; diasCampana: number;
  porVariedad: { variedad: string; kg: number }[]; porGrado: { grado: string; count: number }[];
}
interface Trends {
  meses: { mes: string; kg: number; valor: number }[];
  topProductores: { nombre: string; kg: number; pagado: number; lotes: number }[];
  calidad: { bien: number; violeta: number; pizarroso: number; mohoso: number; muestras: number } | null;
  humedadFuera: { loteCode: string; humedadPct: number }[]; humedadFueraCount: number;
}
interface Inventory { kgSecoDisponible: number; valorEstimado: number; kgHumedoProceso: number; rendimientoProm: number | null }
interface CampoStats { parcelas: number; areaHa: number; alDia: number; pendientes: number; vencidos: number; laboresPendientes: number }
interface CampoSanidad { focosActivos: number; criticos: number; seccionesAfectadas: number; plagaTop: CacaoPlaga | null }
interface CampoTotales { cosechaKg: number; rendKgHa: number | null; ingresos: number; costos: number; margen: number }

const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const n0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const fdate = (iso: string | null) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }); } catch { return iso; } };

/** Presets de campaña → rango ISO {from,to} para no mezclar años/campañas. */
const RANGO_OPCIONES: { v: string; label: string }[] = [
  { v: "all", label: "Toda la historia" },
  { v: "year", label: "Este año" },
  { v: "prev", label: "Año pasado" },
  { v: "90d", label: "Últimos 90 días" },
];
function rangoADatos(r: string): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  if (r === "year") return { from: new Date(Date.UTC(y, 0, 1)).toISOString() };
  if (r === "prev")
    return {
      from: new Date(Date.UTC(y - 1, 0, 1)).toISOString(),
      to: new Date(Date.UTC(y - 1, 11, 31, 23, 59, 59)).toISOString(),
    };
  if (r === "90d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return { from: d.toISOString() };
  }
  return {};
}

export default function CacaoResumen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [campo, setCampo] = useState<CampoStats | null>(null);
  const [campoSan, setCampoSan] = useState<CampoSanidad | null>(null);
  const [campoTot, setCampoTot] = useState<CampoTotales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rango, setRango] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { from, to } = rangoADatos(rango);
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const q = qs.toString() ? `&${qs}` : "";
      const [rs, rt, ri, rc, rcs, rca] = await Promise.all([
        fetch(`/api/admin/cacao?view=stats${q}`, { credentials: "include" }),
        fetch(`/api/admin/cacao?view=trends${q}`, { credentials: "include" }),
        // Inventario + Campo = estado ACTUAL de la chacra, no se filtran por campaña.
        fetch("/api/admin/cacao?view=inventory", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=stats", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=sanidad-stats", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=analytics", { credentials: "include" }),
      ]);
      if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
      setStats((await rs.json()).stats ?? null);
      setTrends(rt.ok ? (await rt.json()).trends ?? null : null);
      setInv(ri.ok ? (await ri.json()).inventory ?? null : null);
      setCampo(rc.ok ? (await rc.json()).stats ?? null : null);
      setCampoSan(rcs.ok ? (await rcs.json()).stats ?? null : null);
      setCampoTot(rca.ok ? (await rca.json()).totales ?? null : null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [rango]);
  useEffect(() => { load(); }, [load]);

  if (loading && !stats) return <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando resumen…</p></div>;
  if (error) return <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudo cargar el resumen:</strong> {error}</div></div>;
  if (!stats) return null;

  const cal = trends?.calidad;
  const periodo = stats.primeraFecha ? `${fdate(stats.primeraFecha)} – ${fdate(stats.ultimaFecha)} · ${stats.diasCampana} día${stats.diasCampana !== 1 ? "s" : ""}` : "Sin lotes aún";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Calendar className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="font-medium">{periodo}</span></div>
        <div className="flex items-center gap-2">
          <select
            value={rango}
            onChange={(e) => setRango(e.target.value)}
            aria-label="Campaña / rango"
            className="h-10 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {RANGO_OPCIONES.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button type="button" onClick={() => printCacaoReporte(stats, trends)} className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Download className="h-4 w-4" />Imprimir reporte</button>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Kg acopiados" value={`${n2(stats.kgAcopiados)} kg`} subValue={`${stats.lotes} lote${stats.lotes !== 1 ? "s" : ""}`} icon={Scale} emphasis="success" />
        <StatCard label="Pagado a productores" value={`S/ ${n2(stats.valorPagado)}`} subValue={`${stats.productoresActivos} productor${stats.productoresActivos !== 1 ? "es" : ""}`} icon={Coins} emphasis="neutral" />
        <StatCard label="Precio promedio" value={`S/ ${n2(stats.precioPromKg)}`} subValue="por kg acopiado" icon={Banknote} emphasis="neutral" />
        <StatCard label="Calidad Grado I" value={`${stats.pctGradoI}%`} subValue="de los lotes" icon={Award} emphasis={stats.pctGradoI >= 50 ? "success" : "warning"} />
      </div>

      {/* Gráfico central grande: comprado vs vendido por mes */}
      <CacaoResumenChart />

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini icon={PackageCheck} label="Kg por lote (prom.)" value={`${n2(stats.kgPromLote)} kg`} />
        <Mini icon={Coins} label="Ticket por lote" value={`S/ ${n2(stats.ticketPromLote)}`} />
        <Mini icon={Leaf} label="Índice ferm. prom." value={`${stats.indiceFermentacionProm}%`} tone={stats.indiceFermentacionProm >= 60 ? "ok" : "warn"} />
        <Mini icon={Percent} label="Humedad en norma" value={`${stats.pctHumedadEnNorma}%`} hint={`${stats.humedadMuestras} muestra${stats.humedadMuestras !== 1 ? "s" : ""}`} tone={stats.pctHumedadEnNorma >= 80 ? "ok" : "warn"} />
      </div>

      {/* Campo — tu chacra (integra el módulo de manejo de campo) */}
      {campo && campo.parcelas > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Trees className="h-4 w-4 text-[var(--accent)]" />Campo — tu chacra</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Secciones" value={String(campo.parcelas)} subValue={`${n1(campo.areaHa)} ha`} icon={Trees} emphasis="neutral" />
            <StatCard label="Cosecha propia" value={campoTot ? `${n0(campoTot.cosechaKg)} kg` : "—"} subValue={campoTot?.rendKgHa != null ? `${n1(campoTot.rendKgHa)} kg/ha` : "sin cosecha"} icon={Scale} emphasis="neutral" />
            <StatCard label="Labores pendientes" value={String(campo.laboresPendientes)} subValue={campo.vencidos > 0 ? `${campo.vencidos} sección${campo.vencidos !== 1 ? "es" : ""} vencida${campo.vencidos !== 1 ? "s" : ""}` : `${campo.alDia} al día`} icon={ClipboardList} emphasis={campo.vencidos > 0 ? "warning" : "neutral"} />
            <StatCard label="Sanidad" value={campoSan && campoSan.focosActivos > 0 ? `${campoSan.focosActivos} foco${campoSan.focosActivos !== 1 ? "s" : ""}` : "Sin focos"} subValue={campoSan && campoSan.focosActivos > 0 ? `${campoSan.criticos} de severidad alta${campoSan.plagaTop ? ` · ${PLAGA_LABEL[campoSan.plagaTop]}` : ""}` : "todo sano"} icon={Stethoscope} emphasis={campoSan && campoSan.criticos > 0 ? "error" : campoSan && campoSan.focosActivos > 0 ? "warning" : "success"} />
          </div>
          {campoTot && (campoTot.ingresos > 0 || campoTot.costos > 0) && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">Margen del campo: <strong className={campoTot.margen >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}>S/ {n2(campoTot.margen)}</strong> · ingresos S/ {n2(campoTot.ingresos)} − costos de labores S/ {n2(campoTot.costos)}. <span className="text-[var(--text-tertiary)]">El campo refleja el estado actual (no la campaña seleccionada).</span></p>
          )}
        </div>
      )}

      {/* Inventario seco */}
      {inv && (inv.kgSecoDisponible > 0 || inv.kgHumedoProceso > 0) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Seco disponible" value={`${n2(inv.kgSecoDisponible)} kg`} subValue="listo para vender" icon={Warehouse} emphasis={inv.kgSecoDisponible > 0 ? "success" : "neutral"} />
          <StatCard label="Valor de inventario" value={`S/ ${n2(inv.valorEstimado)}`} subValue="a precio acopio" icon={Coins} emphasis="neutral" />
          <StatCard label="En proceso (húmedo)" value={`${n2(inv.kgHumedoProceso)} kg`} subValue="beneficiando" icon={Droplets} emphasis="neutral" />
          <StatCard label="Rendimiento prom." value={inv.rendimientoProm != null ? `${inv.rendimientoProm}%` : "—"} subValue="seco / húmedo" icon={TrendingUp} emphasis="neutral" />
        </div>
      )}

      {/* Calidad apilada */}
      {cal && (
        <Panel icon={Beaker} title={`Calidad de fermentación (prueba de corte, ${cal.muestras} muestra${cal.muestras !== 1 ? "s" : ""})`}>
          <StackedQuality cal={cal} />
        </Panel>
      )}

      {/* Distribuciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel icon={Scale} title="Kg por variedad">
          {stats.porVariedad.length === 0 ? <Muted /> : (() => { const max = Math.max(...stats.porVariedad.map((v) => v.kg), 1); return stats.porVariedad.map((v) => <Bar key={v.variedad} label={v.variedad} value={v.kg} max={max} unit="kg" />); })()}
        </Panel>
        <Panel icon={Award} title="Lotes por grado">
          {stats.porGrado.length === 0 ? <Muted /> : (() => { const total = stats.porGrado.reduce((a, g) => a + g.count, 0) || 1; return stats.porGrado.map((g) => <GradoBar key={g.grado} grado={g.grado} count={g.count} total={total} />); })()}
        </Panel>
      </div>

      {/* Top productores (la tendencia mensual está en el gráfico central de arriba) */}
      <div className="grid grid-cols-1 gap-4">
        <Panel icon={Users} title="Top productores (por pago)">
          {!trends || trends.topProductores.length === 0 ? <Muted /> : trends.topProductores.map((p, i) => (
            <div key={p.nombre + i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">{i + 1}</span><span className="truncate text-[var(--text-primary)]">{p.nombre}</span></span>
              <span className="flex shrink-0 items-center gap-3"><span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{n2(p.kg)} kg</span><span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">S/ {n2(p.pagado)}</span></span>
            </div>
          ))}
        </Panel>
      </div>

      {/* Alerta humedad */}
      {trends && trends.humedadFueraCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-300)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-900)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>{trends.humedadFueraCount} lote{trends.humedadFueraCount > 1 ? "s" : ""} con humedad fuera de norma</strong> (&gt; 7%).{" "}
            <span className="text-[var(--data-warning-800)]">{trends.humedadFuera.map((h) => `${h.loteCode} (${h.humedadPct.toFixed(1)}%)`).join(" · ")}</span></div>
        </div>
      )}
    </div>
  );
}

function Mini({ icon: Icon, label, value, hint, tone }: { icon: typeof Leaf; label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  const c = tone === "ok" ? "text-[var(--data-success-700)]" : tone === "warn" ? "text-[var(--data-warning-700)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-extrabold tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
function Panel({ icon: Icon, title, children }: { icon: typeof Leaf; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Icon className="h-4 w-4 text-[var(--accent)]" />{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Bar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{label}</span><span className="font-mono tabular-nums text-[var(--text-primary)]">{value.toFixed(2)} {unit}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function GradoBar({ grado, count, total }: { grado: string; count: number; total: number }) {
  const pct = Math.round((count / total) * 100);
  const g = grado as CacaoGrado;
  const color = g === "I" ? "var(--data-success-500)" : g === "II" ? "var(--data-warning-500)" : grado === "sin_clasificar" ? "var(--rule-strong)" : "var(--data-error-500)";
  const label = grado === "sin_clasificar" ? "Sin clasificar" : GRADO_LABEL[g] ?? grado;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{label}</span><span className="font-mono tabular-nums text-[var(--text-primary)]">{count} · {pct}%</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}
function StackedQuality({ cal }: { cal: { bien: number; violeta: number; pizarroso: number; mohoso: number } }) {
  const segs = [
    { k: "Bien fermentado", v: cal.bien, c: "var(--data-success-500)" },
    { k: "Violeta", v: cal.violeta, c: "var(--data-warning-500)" },
    { k: "Pizarroso", v: cal.pizarroso, c: "var(--data-error-500)" },
    { k: "Mohoso", v: cal.mohoso, c: "var(--data-error-700)" },
  ];
  const sum = segs.reduce((a, s) => a + s.v, 0) || 100;
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        {segs.map((s) => s.v > 0 && <div key={s.k} style={{ width: `${(s.v / sum) * 100}%`, background: s.c }} title={`${s.k}: ${s.v}%`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {segs.map((s) => (
          <div key={s.k} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.c }} />
            <span className="min-w-0"><span className="block truncate text-xs text-[var(--text-tertiary)]">{s.k}</span><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{s.v}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Muted() { return <p className="text-sm text-[var(--text-tertiary)]">Sin datos todavía.</p>; }
