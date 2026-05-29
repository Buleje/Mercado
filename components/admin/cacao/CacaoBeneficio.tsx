"use client";

/**
 * CacaoBeneficio — gestión del beneficio (fermentación + secado) (ADR-128 v2).
 * Self-fetch de beneficios. KPIs (en proceso / terminados / kg seco / merma),
 * filtro por estado, export CSV, anular, y click → ficha del lote vinculado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Droplets, Plus, Search, RefreshCw, Download, AlertCircle, AlertTriangle, Beaker, Sun, Scale, TrendingUp, Clock, ArrowRight, CheckCircle2,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { cacaoRendimiento, cacaoMerma, cacaoBeneficioAlerta } from "@/lib/cacao/cacao-quality";
import CacaoBeneficioForm from "./CacaoBeneficioForm";
import CacaoLoteDrawer from "./CacaoLoteDrawer";

interface Beneficio {
  id: string; loteId: string | null; loteCode: string | null; estado: string;
  fermDias: number | null; fermVolteos: number | null; tipoFermentador: string | null;
  secDias: number | null; metodoSecado: string | null; humedadFinal: string | null;
  pesoHumedoKg: string | null; pesoSecoKg: string | null; mermaPct: string | null;
  fermInicio: string | null; secInicio: string | null; createdAt: string;
}

const daysSince = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null;

/** Nivel de alerta + días en la etapa actual de un beneficio. */
function alertaOf(b: Beneficio) {
  const dias = b.estado === "fermentando" ? daysSince(b.fermInicio ?? b.createdAt)
    : b.estado === "secando" ? daysSince(b.secInicio ?? b.createdAt) : null;
  return { ...cacaoBeneficioAlerta(b.estado, dias), dias };
}
const ALERTA_CLS: Record<string, string> = {
  atencion: "text-[var(--data-warning-700)]",
  urgente: "text-[var(--data-error-600)]",
};

const n2 = (v: string | number | null) => (v == null || v === "" ? "—" : Number(v).toFixed(2));
const ESTADO: Record<string, { label: string; cls: string }> = {
  fermentando: { label: "Fermentando", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" },
  secando: { label: "Secando", cls: "bg-[var(--data-info-100)] text-[var(--data-info-900)]" },
  terminado: { label: "Terminado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]" },
};
const FILTERS: { v: string; label: string }[] = [
  { v: "todos", label: "Todos" }, { v: "fermentando", label: "Fermentando" }, { v: "secando", label: "Secando" }, { v: "terminado", label: "Terminado" }, { v: "atencion", label: "⚠ Atención" },
];

export default function CacaoBeneficio() {
  const [items, setItems] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [showNew, setShowNew] = useState(false);
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulBusy, setAnnulBusy] = useState(false);
  const [advance, setAdvance] = useState<Beneficio | null>(null);
  const [advBusy, setAdvBusy] = useState(false);
  const [advPesoSeco, setAdvPesoSeco] = useState("");
  const [advHumedad, setAdvHumedad] = useState("");
  const [advMetodo, setAdvMetodo] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao?view=beneficios", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((await r.json()).beneficios ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function annul() {
    if (!annulId) return;
    setAnnulBusy(true);
    try {
      const r = await fetch("/api/admin/cacao", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "annul_beneficio", id: annulId }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAnnulBusy(false); }
  }

  function openAdvance(b: Beneficio) {
    setAdvance(b); setAdvPesoSeco(b.pesoSecoKg ?? ""); setAdvHumedad(b.humedadFinal ?? ""); setAdvMetodo(b.metodoSecado ?? "");
  }
  async function doAdvance() {
    if (!advance) return;
    setAdvBusy(true);
    try {
      const body: Record<string, unknown> = { action: "advance_beneficio", id: advance.id };
      if (advance.estado === "fermentando" && advMetodo) body.metodoSecado = advMetodo;
      if (advance.estado === "secando") { body.pesoSecoKg = advPesoSeco === "" ? null : Number(advPesoSeco); if (advHumedad !== "") body.humedadFinal = Number(advHumedad); }
      const r = await fetch("/api/admin/cacao", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAdvance(null); load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAdvBusy(false); }
  }

  const kpis = useMemo(() => {
    let enProceso = 0, terminados = 0, kgSeco = 0, mermaSum = 0, mermaN = 0, atencion = 0;
    for (const b of items) {
      if (b.estado === "terminado") { terminados++; if (b.pesoSecoKg) kgSeco += Number(b.pesoSecoKg); }
      else enProceso++;
      if (b.mermaPct != null) { mermaSum += Number(b.mermaPct); mermaN++; }
      if (alertaOf(b).nivel !== "ok") atencion++;
    }
    return { enProceso, terminados, kgSeco: Math.round(kgSeco * 100) / 100, mermaProm: mermaN ? Math.round((mermaSum / mermaN) * 10) / 10 : null, atencion };
  }, [items]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((b) =>
      (filter === "todos" || (filter === "atencion" ? alertaOf(b).nivel !== "ok" : b.estado === filter))
      && (!q || (b.loteCode ?? "").toLowerCase().includes(q)));
  }, [items, search, filter]);

  function exportCsv() {
    const head = ["Lote", "Estado", "Ferm dias", "Volteos", "Fermentador", "Secado dias", "Metodo", "Humedad final", "Peso humedo", "Peso seco", "Merma %"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = view.map((b) => [b.loteCode, b.estado, b.fermDias, b.fermVolteos, b.tipoFermentador, b.secDias, b.metodoSecado, b.humedadFinal, n2(b.pesoHumedoKg), n2(b.pesoSecoKg), b.mermaPct].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `cacao-beneficios-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="En proceso" value={String(kpis.enProceso)} subValue="fermentando / secando" icon={Clock} emphasis={kpis.enProceso > 0 ? "warning" : "neutral"} />
        <StatCard label="Terminados" value={String(kpis.terminados)} subValue="beneficios completos" icon={Sun} emphasis="success" />
        <StatCard label="Kg seco producido" value={`${n2(kpis.kgSeco)} kg`} subValue="de beneficios terminados" icon={Scale} emphasis="success" />
        <StatCard label="Merma promedio" value={kpis.mermaProm != null ? `${kpis.mermaProm}%` : "—"} subValue="húmedo → seco" icon={TrendingUp} emphasis="neutral" />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {kpis.atencion > 0 && filter !== "atencion" && (
        <button type="button" onClick={() => setFilter("atencion")} className="flex w-full items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-left text-sm text-[var(--data-warning-900)] transition hover:bg-[var(--data-warning-100)]">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-700)]" />
          <span className="flex-1"><strong>{kpis.atencion} {kpis.atencion === 1 ? "lote requiere" : "lotes requieren"} atención</strong> — llevan demasiados días en fermentación o secado.</span>
          <span className="shrink-0 font-bold underline">Ver</span>
        </button>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 min-w-[180px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código de lote…" className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <div className="inline-flex rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
          {FILTERS.map((f) => <button key={f.v} type="button" onClick={() => setFilter(f.v)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${filter === f.v ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{f.label}</button>)}
        </div>
        <button type="button" onClick={exportCsv} disabled={view.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo beneficio</button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Lote</Th><Th>Estado</Th><Th>Fermentación</Th><Th>Secado</Th>
              <Th className="text-right">Hum. final</Th><Th className="text-right">Húmedo→Seco</Th><Th className="text-right">Merma</Th><Th className="text-right">Rend.</Th><Th className="text-right">Acción</Th>
            </tr>
          </thead>
          <tbody>
            {view.map((b) => {
              const est = ESTADO[b.estado] ?? { label: b.estado, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
              const rend = cacaoRendimiento(b.pesoHumedoKg == null ? null : Number(b.pesoHumedoKg), b.pesoSecoKg == null ? null : Number(b.pesoSecoKg));
              const al = alertaOf(b);
              return (
                <tr key={b.id} onClick={() => b.loteId && setLoteDrawerId(b.loteId)} className={`border-t border-[var(--rule-soft)] transition ${b.loteId ? "cursor-pointer hover:bg-[var(--surface-sunken)]" : ""}`}>
                  <Td><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{b.loteCode ?? "—"}</span></Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${est.cls}`}>{est.label}{al.dias != null && b.estado !== "terminado" ? ` · ${al.dias}d` : ""}</span>
                      {al.nivel !== "ok" && <span title={al.motivo} className="inline-flex"><AlertTriangle className={`h-4 w-4 ${ALERTA_CLS[al.nivel]}`} aria-label={al.motivo} /></span>}
                    </span>
                  </Td>
                  <Td className="text-[var(--text-secondary)]">{b.fermDias != null ? `${b.fermDias}d` : "—"}{b.fermVolteos != null ? ` · ${b.fermVolteos} volteos` : ""}{b.tipoFermentador ? ` · ${b.tipoFermentador}` : ""}</Td>
                  <Td className="text-[var(--text-secondary)]">{b.secDias != null ? `${b.secDias}d` : "—"}{b.metodoSecado ? ` · ${b.metodoSecado}` : ""}</Td>
                  <Td className="text-right font-mono tabular-nums"><span className={b.humedadFinal && Number(b.humedadFinal) > 7 ? "text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>{b.humedadFinal ? `${Number(b.humedadFinal).toFixed(1)}%` : "—"}</span></Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.pesoHumedoKg ? n2(b.pesoHumedoKg) : "—"} → {b.pesoSecoKg ? n2(b.pesoSecoKg) : "—"}</Td>
                  <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{b.mermaPct ? `${Number(b.mermaPct).toFixed(1)}%` : "—"}</Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{rend != null ? `${rend}%` : "—"}</Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {b.estado !== "terminado" && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openAdvance(b); }} className="inline-flex h-8 items-center gap-1 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 text-xs font-bold text-[var(--accent)] hover:opacity-90">
                          {b.estado === "fermentando" ? "Secar" : "Terminar"}<ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setAnnulId(b.id); }} className="inline-flex h-8 items-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]">Anular</button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
        ) : view.length === 0 && (
          (search || filter !== "todos") ? <div className="p-12 text-center text-[var(--text-tertiary)]"><Search className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-base font-medium">Sin beneficios para ese filtro.</p></div>
          : <div className="p-12 text-center text-[var(--text-tertiary)]">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Droplets className="h-7 w-7" /></span>
              <p className="text-base font-bold text-[var(--text-primary)]">Sin beneficios registrados</p>
              <p className="mx-auto mt-1 max-w-sm text-sm">Registrá la fermentación y secado de un lote para controlar la merma húmedo→seco y el rendimiento.</p>
              <button type="button" onClick={() => setShowNew(true)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Nuevo beneficio</button>
            </div>
        )}
      </div>

      {showNew && <CacaoBeneficioForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {loteDrawerId && <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />}

      {advance && (() => {
        const aSecado = advance.estado === "fermentando"; // fermentando → secando
        const pesoHum = advance.pesoHumedoKg == null ? null : Number(advance.pesoHumedoKg);
        const pesoSec = advPesoSeco === "" ? null : Number(advPesoSeco);
        const mermaPrev = !aSecado ? cacaoMerma(pesoHum, pesoSec) : null;
        const rendPrev = !aSecado ? cacaoRendimiento(pesoHum, pesoSec) : null;
        const METODOS = [{ v: "solar", label: "Solar" }, { v: "tunel", label: "Túnel" }, { v: "mecanico", label: "Mecánico" }];
        const canSubmit = aSecado || (pesoSec != null && pesoSec > 0);
        return (
          <AdminModal open onClose={() => setAdvance(null)} variant="centered-sm" hideCloseButton>
            <div className="bg-[var(--surface-raised)] p-5">
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${aSecado ? "bg-[var(--data-info-100)] text-[var(--data-info-700)]" : "bg-[var(--data-success-100)] text-[var(--data-success-700)]"}`}>
                  {aSecado ? <Sun className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">{aSecado ? "Pasar a secado" : "Terminar beneficio"} {advance.loteCode ?? ""}</h3>
                  <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{aSecado ? "Cierra la fermentación e inicia el secado. Se anotan los días fermentados automáticamente." : "Cierra el secado. Ingresa el peso seco final para calcular la merma y el rendimiento del lote."}</p>
                </div>
              </div>

              {aSecado ? (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Método de secado <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span></label>
                  <div className="inline-flex w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
                    {METODOS.map((m) => <button key={m.v} type="button" onClick={() => setAdvMetodo(advMetodo === m.v ? "" : m.v)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${advMetodo === m.v ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{m.label}</button>)}
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Peso seco final (kg) <span className="text-[var(--data-error-600)]">*</span></label>
                      <input autoFocus type="number" inputMode="decimal" step="0.01" min="0" value={advPesoSeco} onChange={(e) => setAdvPesoSeco(e.target.value)} placeholder={pesoHum != null ? `≤ ${pesoHum}` : "0.00"} className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Humedad final (%) <span className="font-normal text-[var(--text-tertiary)]">opc.</span></label>
                      <input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={advHumedad} onChange={(e) => setAdvHumedad(e.target.value)} placeholder="≤ 7" className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                    </div>
                  </div>
                  {pesoHum != null && <p className="text-xs text-[var(--text-tertiary)]">Húmedo registrado: <strong className="text-[var(--text-secondary)]">{n2(pesoHum)} kg</strong></p>}
                  {(mermaPrev != null || rendPrev != null) && (
                    <div className="flex gap-2">
                      {mermaPrev != null && <div className="flex-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2"><div className="text-xs text-[var(--text-tertiary)]">Merma</div><div className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{mermaPrev.toFixed(1)}%</div></div>}
                      {rendPrev != null && <div className="flex-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2"><div className="text-xs text-[var(--text-tertiary)]">Rendimiento</div><div className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{rendPrev}%</div></div>}
                    </div>
                  )}
                  {advHumedad !== "" && Number(advHumedad) > 7.5 && <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--data-warning-700)]"><AlertTriangle className="h-3.5 w-3.5" />Humedad sobre 7.5% — fuera de la meta NTP (≤7%).</p>}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setAdvance(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
                <button type="button" disabled={advBusy || !canSubmit} onClick={doAdvance} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{advBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{advBusy ? "Guardando…" : aSecado ? "Pasar a secado" : "Terminar beneficio"}</button>
              </div>
            </div>
          </AdminModal>
        );
      })()}

      {annulId && (
        <AdminModal open onClose={() => setAnnulId(null)} variant="centered-sm" hideCloseButton>
          <div className="bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-error-50)] text-[var(--data-error-600)]"><AlertTriangle className="h-6 w-6" /></span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Anular beneficio {items.find((b) => b.id === annulId)?.loteCode ?? ""}</h3>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">Sale del inventario y los totales. <strong className="text-[var(--text-secondary)]">No se borra</strong> — queda en el historial. El lote vuelve a estar disponible para beneficiar.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
              <button type="button" disabled={annulBusy} onClick={annul} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"><AlertTriangle className="h-4 w-4" />{annulBusy ? "Anulando…" : "Anular beneficio"}</button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
