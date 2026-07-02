"use client";

/**
 * CacaoCampo — la "maqueta" de la chacra en grilla. Cada sección es una celda
 * con su código, coloreada por el estado de sus labores (al día / pendiente /
 * vencido / sin labores). Click en una sección → drawer para registrar poda,
 * fertilización, cosecha, etc. y ver qué se hizo y qué falta. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trees, Plus, RefreshCw, AlertCircle, Grid3x3, Square, ClipboardList, Loader2, X, LayoutGrid, Map as MapIcon } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CACAO_LABORES, PARCELA_STATUS, type CacaoParcelaStatus, type CacaoLaborTipo } from "@/lib/cacao/cacao-labores";
import CacaoParcelaDrawer from "./CacaoParcelaDrawer";
import CacaoCampoMapa from "./CacaoCampoMapa";

type PorTipo = Record<CacaoLaborTipo, { hechos: number; pendientes: number; vencido: boolean; ultimoHecho: string | null }>;
export interface Parcela {
  id: string; codigo: string; nombre: string | null; areaHa: number | null; variedad: string | null;
  anioSiembra: number | null; nPlantas: number | null; status: string; observaciones: string | null; poligono: string | null;
  laborStatus: CacaoParcelaStatus; labores: { total: number; hechos: number; pendientes: number; vencidos: number }; porTipo: PorTipo;
}

const n1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 1 }));
const VARIEDADES = ["CCN-51", "criollo", "trinitario", "forastero", "nacional"];

/** Color del icono de una labor en la celda según su estado en esa sección. */
function tipoTone(t: { hechos: number; pendientes: number; vencido: boolean }): string {
  if (t.vencido) return "var(--data-error-500)";
  if (t.pendientes > 0) return "var(--data-warning-500)";
  if (t.hechos > 0) return "var(--data-success-600)";
  return "var(--text-tertiary)";
}

export default function CacaoCampo() {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [vista, setVista] = useState<"grilla" | "mapa">("grilla");
  const [showNew, setShowNew] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/cacao/campo?view=parcelas${includeInactive ? "&all=1" : ""}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setParcelas(d.parcelas ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [includeInactive]);
  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    const area = parcelas.reduce((a, p) => a + (p.areaHa ?? 0), 0);
    const alDia = parcelas.filter((p) => p.laborStatus === "al_dia").length;
    const pend = parcelas.reduce((a, p) => a + p.labores.pendientes + p.labores.vencidos, 0);
    return { total: parcelas.length, area, alDia, pend };
  }, [parcelas]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Secciones" value={String(kpis.total)} icon={Grid3x3} emphasis="neutral" />
        <StatCard label="Hectáreas" value={`${n1(kpis.area)} ha`} icon={Square} emphasis="neutral" />
        <StatCard label="Al día" value={`${kpis.alDia}/${kpis.total}`} icon={Trees} emphasis={kpis.total > 0 && kpis.alDia === kpis.total ? "success" : "neutral"} />
        <StatCard label="Labores pendientes" value={String(kpis.pend)} icon={ClipboardList} emphasis={kpis.pend > 0 ? "warning" : "success"} />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* Toolbar + leyenda */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-2xl border-2 border-[var(--rule-base)] p-0.5">
          <button type="button" onClick={() => setVista("grilla")} className={`inline-flex h-10 items-center gap-1.5 rounded-[13px] px-3 text-sm font-bold ${vista === "grilla" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)]"}`}><LayoutGrid className="h-4 w-4" />Grilla</button>
          <button type="button" onClick={() => setVista("mapa")} className={`inline-flex h-10 items-center gap-1.5 rounded-[13px] px-3 text-sm font-bold ${vista === "mapa" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)]"}`}><MapIcon className="h-4 w-4" />Mapa</button>
        </div>
        <div className="mr-auto flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
          {(["al_dia", "pendiente", "vencido", "sin_labores"] as CacaoParcelaStatus[]).map((s) => {
            const m = PARCELA_STATUS[s];
            return <span key={s} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: m.ring }} />{m.label}</span>;
          })}
        </div>
        <button type="button" onClick={() => setIncludeInactive((v) => !v)} className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold ${includeInactive ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"} hover:bg-[var(--surface-canvas)]`}>{includeInactive ? "Todas" : "Activas"}</button>
        <button type="button" onClick={load} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" />Actualizar</button>
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nueva sección</button>
      </div>

      {/* Mapa: dibujar/dividir el terreno en secciones (fase 2) */}
      {vista === "mapa" ? (
        <CacaoCampoMapa parcelas={parcelas} onOpenParcela={setDrawerId} onChanged={load} />
      ) : loading && parcelas.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : parcelas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Trees className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">Dibujá tu chacra</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">Agregá cada sección de tu terreno (ej. una hectárea = un código). Después registrás poda, fertilización, cosecha y las ves acá por color.</p>
          <button type="button" onClick={() => setShowNew(true)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Nueva sección</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {parcelas.map((p) => {
            const m = PARCELA_STATUS[p.laborStatus];
            return (
              <button key={p.id} type="button" onClick={() => setDrawerId(p.id)} aria-label={`Sección ${p.codigo} — ${m.label}`}
                className={`flex flex-col gap-2 rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${p.status === "inactiva" ? "opacity-50" : ""}`}
                style={{ borderColor: m.ring, background: m.bg }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-extrabold text-[var(--text-primary)]">{p.codigo}</span>
                  <m.icon className="h-5 w-5 shrink-0" style={{ color: m.fg }} />
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {p.areaHa != null ? `${n1(p.areaHa)} ha` : "—"}{p.variedad ? ` · ${p.variedad}` : ""}
                </div>
                <div className="mt-auto flex items-center gap-1.5 pt-1">
                  {CACAO_LABORES.map((l) => {
                    const t = p.porTipo[l.tipo];
                    return <l.icon key={l.tipo} className="h-4 w-4" style={{ color: tipoTone(t) }} aria-hidden />;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNew && <NuevaParcelaModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {drawerId && <CacaoParcelaDrawer parcelaId={drawerId} onClose={() => setDrawerId(null)} onChanged={load} />}
    </div>
  );
}

function NuevaParcelaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ codigo: "", nombre: "", areaHa: "", variedad: "", anioSiembra: "", nPlantas: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valido = f.codigo.trim().length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !valido) { if (!valido) setError("El código es obligatorio (ej. A-01)."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null,
        areaHa: f.areaHa ? Number(f.areaHa) : null, variedad: f.variedad || null,
        anioSiembra: f.anioSiembra ? Number(f.anioSiembra) : null, nPlantas: f.nPlantas ? Number(f.nPlantas) : null,
      };
      const r = await fetch("/api/admin/cacao/campo?type=parcela", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="default" icon={Trees} title="Nueva sección" description="Una parte de tu chacra con su propio código (ej. una hectárea).">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Código *<input value={f.codigo} onChange={set("codigo")} placeholder="A-01" className={`mt-1 ${I}`} autoFocus /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Nombre<input value={f.nombre} onChange={set("nombre")} placeholder="Lote alto" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Área (ha)<input type="number" step="0.01" min="0" value={f.areaHa} onChange={set("areaHa")} placeholder="1.0" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Variedad<select value={f.variedad} onChange={set("variedad")} className={`mt-1 ${I}`}><option value="">—</option>{VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Año de siembra<input type="number" min="1900" max="2200" value={f.anioSiembra} onChange={set("anioSiembra")} placeholder="2019" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">N° de plantas<input type="number" min="0" value={f.nPlantas} onChange={set("nPlantas")} placeholder="1100" className={`mt-1 ${I}`} /></label>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="submit" disabled={!valido || submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Crear sección</button>
        </div>
      </form>
    </AdminModal>
  );
}
