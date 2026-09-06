"use client";

/**
 * CacaoCampoSanidad — monitoreo fitosanitario del campo. Registra focos de plaga/
 * enfermedad (monilia, escoba de bruja, phytophthora…) por sección con severidad,
 * incidencia y tratamiento, y los sigue hasta resolverlos. La sanidad es lo que más
 * protege el rendimiento (la monilia sola se come 30-40%). Brandon 2026-07-03.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Stethoscope, RefreshCw, AlertCircle, Plus, Check, Trash2, Loader2, ShieldAlert, AlertTriangle, MapPin, Sparkles, X } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CACAO_PLAGAS, PLAGA_LABEL, SANIDAD_SEVERIDAD, SANIDAD_ESTADO, type CacaoPlaga, type SanidadSeveridad, type SanidadEstado } from "@/lib/cacao/cacao-sanidad";
import type { Parcela } from "./CacaoCampo";

interface Foco {
  id: string; parcelaId: string; parcelaCodigo: string; plaga: CacaoPlaga; severidad: SanidadSeveridad;
  incidenciaPct: number | null; fecha: string; tratamiento: string | null; responsable: string | null;
  notas: string | null; estado: SanidadEstado; createdAt: string;
}
interface Stats { focosActivos: number; criticos: number; seccionesAfectadas: number; incidenciaProm: number | null; plagaTop: CacaoPlaga | null; porPlaga: { plaga: CacaoPlaga; count: number; sevRank: number }[]; total: number }

const PLAGA = Object.fromEntries(CACAO_PLAGAS.map((p) => [p.tipo, p])) as Record<CacaoPlaga, (typeof CACAO_PLAGAS)[number]>;
const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
const NEXT_ESTADO: Record<SanidadEstado, SanidadEstado | null> = { activo: "controlado", controlado: "resuelto", resuelto: null };
const NEXT_LABEL: Record<SanidadEstado, string> = { activo: "Marcar en control", controlado: "Marcar resuelto", resuelto: "" };

export default function CacaoCampoSanidad({ parcelas, onOpenParcela, onChanged }: { parcelas: Parcela[]; onOpenParcela: (id: string) => void; onChanged?: () => void }) {
  const [focos, setFocos] = useState<Foco[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showReg, setShowReg] = useState(false);
  const [fPlaga, setFPlaga] = useState("todas");
  const [fEstado, setFEstado] = useState("activos");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rf, rs] = await Promise.all([
        fetch("/api/admin/cacao/campo?view=sanidad", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=sanidad-stats", { credentials: "include" }),
      ]);
      if (!rf.ok) throw new Error(`HTTP ${rf.status}`);
      setFocos((await rf.json()).sanidad ?? []);
      if (rs.ok) setStats((await rs.json()).stats ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setEstado(f: Foco, estado: SanidadEstado) {
    setBusy(`e-${f.id}`); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "set_sanidad", id: f.id, estado }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      await load(); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(f: Foco) {
    setBusy(`d-${f.id}`); setError(null);
    try {
      const r = await fetch(`/api/admin/cacao/campo?type=sanidad&id=${encodeURIComponent(f.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      await load(); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const view = useMemo(() => focos.filter((f) =>
    (fPlaga === "todas" || f.plaga === fPlaga) &&
    (fEstado === "todos" || (fEstado === "activos" ? f.estado !== "resuelto" : f.estado === fEstado)),
  ), [focos, fPlaga, fEstado]);

  const tip = stats?.plagaTop ? PLAGA[stats.plagaTop] : null;
  const S = "h-11 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Focos activos" value={String(stats?.focosActivos ?? 0)} subValue={stats && stats.criticos > 0 ? `${stats.criticos} de severidad alta` : undefined} icon={ShieldAlert} emphasis={stats && stats.focosActivos > 0 ? (stats.criticos > 0 ? "error" : "warning") : "success"} />
        <StatCard label="Secciones afectadas" value={`${stats?.seccionesAfectadas ?? 0} de ${parcelas.length}`} icon={MapPin} emphasis={stats && stats.seccionesAfectadas > 0 ? "warning" : "neutral"} />
        <StatCard label="Incidencia promedio" value={stats?.incidenciaProm != null ? `${stats.incidenciaProm}%` : "—"} icon={AlertTriangle} emphasis="neutral" />
        <StatCard label="Plaga más frecuente" value={stats?.plagaTop ? PLAGA_LABEL[stats.plagaTop] : "—"} icon={Stethoscope} emphasis="neutral" />
      </div>

      {tip && stats && stats.focosActivos > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--accent-soft)] bg-[var(--surface-raised)] p-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Sparkles className="h-4 w-4" /></span>
          <p className="text-sm text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">{tip.label}{tip.cientifico ? ` (${tip.cientifico})` : ""}:</strong> {tip.tip}</p>
        </div>
      )}

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowReg(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Registrar foco</button>
        <div className="mr-auto" />
        <select value={fPlaga} onChange={(e) => setFPlaga(e.target.value)} className={S}><option value="todas">Todas las plagas</option>{CACAO_PLAGAS.map((p) => <option key={p.tipo} value={p.tipo}>{p.label}</option>)}</select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={S}><option value="activos">Activos + en control</option><option value="activo">Solo activos</option><option value="controlado">En control</option><option value="resuelto">Resueltos</option><option value="todos">Todos</option></select>
        <button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {loading && focos.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : view.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-600)]"><Stethoscope className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">{focos.length === 0 ? "Sin focos registrados" : "Sin resultados"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">{focos.length === 0 ? "Cuando detectes monilia, escoba de bruja u otra plaga en una sección, registrala acá para hacerle seguimiento." : "Ajustá los filtros para ver otros focos."}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {view.map((f) => {
            const p = PLAGA[f.plaga]; const sev = SANIDAD_SEVERIDAD[f.severidad]; const est = SANIDAD_ESTADO[f.estado]; const nextE = NEXT_ESTADO[f.estado];
            return (
              <li key={f.id} className="flex items-start gap-3 rounded-2xl border-2 p-3" style={{ borderColor: sev.ring }}>
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: sev.bg, color: sev.fg }}><p.icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onOpenParcela(f.parcelaId)} className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">{f.parcelaCodigo}</button>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{p.label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: sev.bg, color: sev.fg }}><sev.icon className="h-3 w-3" />{sev.label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: est.bg, color: est.fg }}>{est.label}</span>
                    {f.incidenciaPct != null && <span className="text-xs font-bold text-[var(--text-secondary)]">{f.incidenciaPct}% afectado</span>}
                  </div>
                  {(f.tratamiento || f.responsable || f.notas) && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{[f.tratamiento && `Tratamiento: ${f.tratamiento}`, f.responsable && `por ${f.responsable}`, f.notas].filter(Boolean).join(" · ")}</p>}
                  <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Detectado {fdate(f.fecha)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {nextE && <button type="button" disabled={busy === `e-${f.id}`} onClick={() => setEstado(f, nextE)} title={NEXT_LABEL[f.estado]} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--data-success-500)] text-white hover:opacity-90 disabled:opacity-50">{busy === `e-${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>}
                  <button type="button" disabled={busy === `d-${f.id}`} onClick={() => del(f)} title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] disabled:opacity-50">{busy === `d-${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showReg && <RegistrarSanidadModal parcelas={parcelas} onClose={() => setShowReg(false)} onSaved={() => { setShowReg(false); load(); onChanged?.(); }} />}
    </div>
  );
}

function RegistrarSanidadModal({ parcelas, onClose, onSaved }: { parcelas: Parcela[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ parcelaId: parcelas[0]?.id ?? "", plaga: "monilia" as CacaoPlaga, severidad: "media" as SanidadSeveridad, incidenciaPct: "", fecha: today, tratamiento: "", responsable: "", notas: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const plagaTip = CACAO_PLAGAS.find((p) => p.tipo === f.plaga);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!f.parcelaId) { setError("Elegí una sección."); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo?type=sanidad", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ parcelaId: f.parcelaId, plaga: f.plaga, severidad: f.severidad, incidenciaPct: f.incidenciaPct ? Number(f.incidenciaPct) : null, fecha: f.fecha, tratamiento: f.tratamiento.trim() || null, responsable: f.responsable.trim() || null, notas: f.notas.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="wide" icon={Stethoscope} title="Registrar foco fitosanitario" description="Anotá una plaga o enfermedad detectada en una sección para seguirla.">
      <form onSubmit={submit} className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Sección<select value={f.parcelaId} onChange={set("parcelaId")} className={`mt-1 ${I}`}>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.codigo}{p.nombre ? ` · ${p.nombre}` : ""}</option>)}</select></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Plaga / enfermedad<select value={f.plaga} onChange={set("plaga")} className={`mt-1 ${I}`}>{CACAO_PLAGAS.map((p) => <option key={p.tipo} value={p.tipo}>{p.label}</option>)}</select></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Severidad<select value={f.severidad} onChange={set("severidad")} className={`mt-1 ${I}`}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Incidencia (% afectado)<input type="number" step="1" min="0" max="100" value={f.incidenciaPct} onChange={set("incidenciaPct")} placeholder="ej. 15" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Fecha<input type="date" value={f.fecha} onChange={set("fecha")} max={today} className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Responsable<input value={f.responsable} onChange={set("responsable")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
        </div>
        <label className="block text-sm font-bold text-[var(--text-primary)]">Tratamiento / plan<input value={f.tratamiento} onChange={set("tratamiento")} placeholder="ej. cosecha sanitaria, poda, fungicida cúprico" className={`mt-1 ${I}`} /></label>
        <label className="block text-sm font-bold text-[var(--text-primary)]">Notas<input value={f.notas} onChange={set("notas")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
        {plagaTip?.tip && <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">Recomendación:</strong> {plagaTip.tip}</p>}
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="submit" disabled={submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Registrar</button>
        </div>
      </form>
    </AdminModal>
  );
}
