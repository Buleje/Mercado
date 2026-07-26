"use client";

/**
 * CacaoCampoAgenda — cronograma de labores del campo (todas las secciones) con
 * filtros por estado, labor y sección + búsqueda. Vista operativa cuando hay
 * muchas secciones: qué se hizo, qué falta y qué está vencido, en el tiempo.
 * Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Search, RefreshCw, AlertCircle, CheckCircle2, Clock, AlertTriangle, Sparkles, Plus } from "@buleje/design-system/icons";
import { CACAO_LABORES, LABOR_LABEL, type CacaoLaborTipo } from "@/lib/cacao/cacao-labores";
import { csrfHeaders } from "@/lib/csrf-client";
import type { Parcela } from "./CacaoCampo";

interface LaborRow {
  id: string; parcelaId: string; parcelaCodigo: string; parcelaNombre: string | null;
  tipo: CacaoLaborTipo; estado: string; vencido: boolean; fecha: string;
  responsable: string | null; detalle: string | null; cantidad: number | null; unidad: string | null;
  insumo: string | null; dosis: string | null; costo: number | null; recurrenteDias: number | null;
}
interface Sugerida { parcelaId: string; codigo: string; tipo: CacaoLaborTipo; ultimaHecha: string | null; dueDate: string; diasRestantes: number; atrasada: boolean; nunca: boolean }
const money = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ICON = Object.fromEntries(CACAO_LABORES.map((l) => [l.tipo, l.icon])) as Record<CacaoLaborTipo, (typeof CACAO_LABORES)[number]["icon"]>;
const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
const monthKey = (iso: string) => { try { const d = new Date(iso); return d.toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }); } catch { return "—"; } };
const ESTADO = {
  hecho: { label: "Hecha", icon: CheckCircle2, bg: "var(--data-success-50)", fg: "var(--data-success-700)" },
  pendiente: { label: "Programada", icon: Clock, bg: "var(--data-warning-50)", fg: "var(--data-warning-700)" },
  vencido: { label: "Vencida", icon: AlertTriangle, bg: "var(--data-error-50)", fg: "var(--data-error-700)" },
} as const;

export default function CacaoCampoAgenda({ parcelas, onOpenParcela }: { parcelas: Parcela[]; onOpenParcela: (id: string) => void }) {
  const [labores, setLabores] = useState<LaborRow[]>([]);
  const [sugeridas, setSugeridas] = useState<Sugerida[]>([]);
  const [programando, setProgramando] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fEstado, setFEstado] = useState("todos");
  const [fTipo, setFTipo] = useState("todas");
  const [fSeccion, setFSeccion] = useState("todas");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rl, ra] = await Promise.all([
        fetch("/api/admin/cacao/campo?view=labores", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=analytics", { credentials: "include" }),
      ]);
      if (!rl.ok) throw new Error(`HTTP ${rl.status}`);
      setLabores((await rl.json()).labores ?? []);
      if (ra.ok) setSugeridas((await ra.json()).sugeridas ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Agenda una labor sugerida como pendiente (fechaPlan = fecha sugerida). */
  async function programar(s: Sugerida) {
    const key = `${s.parcelaId}:${s.tipo}`;
    setProgramando(key); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo?type=labor", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ parcelaId: s.parcelaId, tipo: s.tipo, estado: "pendiente", fechaPlan: s.dueDate }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setProgramando(null); }
  }

  const view = useMemo(() => {
    const query = q.trim().toLowerCase();
    return labores.filter((l) =>
      (fEstado === "todos" || l.estado === fEstado) &&
      (fTipo === "todas" || l.tipo === fTipo) &&
      (fSeccion === "todas" || l.parcelaId === fSeccion) &&
      (!query || l.parcelaCodigo.toLowerCase().includes(query) || LABOR_LABEL[l.tipo].toLowerCase().includes(query) || (l.responsable ?? "").toLowerCase().includes(query) || (l.detalle ?? "").toLowerCase().includes(query)),
    );
  }, [labores, fEstado, fTipo, fSeccion, q]);

  // Agrupa por mes para dar sensación de línea de tiempo.
  const groups = useMemo(() => {
    const m = new Map<string, LaborRow[]>();
    for (const l of view) { const k = monthKey(l.fecha); const arr = m.get(k) ?? []; arr.push(l); m.set(k, arr); }
    return [...m.entries()];
  }, [view]);

  const S = "h-11 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <div className="space-y-4">
      {sugeridas.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--accent-soft)] bg-[var(--surface-raised)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Próximas labores sugeridas</p>
              <p className="text-xs text-[var(--text-tertiary)]">Según el ciclo agronómico del cacao y la última labor hecha en cada sección.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sugeridas.slice(0, 9).map((s) => {
              const Icon = ICON[s.tipo]; const key = `${s.parcelaId}:${s.tipo}`;
              const tono = s.atrasada ? "text-[var(--data-error-700)]" : s.nunca ? "text-[var(--data-warning-700)]" : "text-[var(--text-tertiary)]";
              return (
                <div key={key} className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-raised)] text-[var(--accent)]"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]"><span className="font-mono">{s.codigo}</span> · {LABOR_LABEL[s.tipo]}</p>
                    <p className={`text-[length:var(--ts-2xs)] font-bold ${tono}`}>{s.atrasada ? `Atrasada ${Math.abs(s.diasRestantes)} d` : s.nunca ? "Nunca hecha" : `En ${s.diasRestantes} d`}</p>
                  </div>
                  <button type="button" onClick={() => programar(s)} disabled={programando === key} title="Programar esta labor" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50">{programando === key ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
                </div>
              );
            })}
          </div>
          {sugeridas.length > 9 && <p className="mt-2 text-xs text-[var(--text-tertiary)]">+{sugeridas.length - 9} sugerencias más (programá las de arriba para verlas actualizarse).</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-11 min-w-[180px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por sección, labor, responsable…" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none" />
        </div>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={S}><option value="todos">Todos los estados</option><option value="hecho">Hechas</option><option value="pendiente">Programadas</option><option value="vencido">Vencidas</option></select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={S}><option value="todas">Todas las labores</option>{CACAO_LABORES.map((l) => <option key={l.tipo} value={l.tipo}>{l.label}</option>)}</select>
        <select value={fSeccion} onChange={(e) => setFSeccion(e.target.value)} className={S}><option value="todas">Todas las secciones</option>{parcelas.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}</select>
        <button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {loading && labores.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : view.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Calendar className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">{labores.length === 0 ? "Aún no registraste labores" : "Sin resultados"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">{labores.length === 0 ? "Registrá labores en tus secciones y acá verás el cronograma completo." : "Ajustá los filtros para ver otras labores."}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([mes, rows]) => (
            <div key={mes}>
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><Calendar className="h-3.5 w-3.5" />{mes}</p>
              <ul className="space-y-2 border-l-2 border-[var(--rule-base)] pl-4">
                {rows.map((l) => {
                  const Icon = ICON[l.tipo];
                  const est = ESTADO[l.estado as keyof typeof ESTADO] ?? ESTADO.pendiente;
                  return (
                    <li key={l.id}>
                      <button type="button" onClick={() => onOpenParcela(l.parcelaId)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left transition hover:border-[var(--accent)] hover:shadow-sm">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: est.bg, color: est.fg }}><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]">{l.parcelaCodigo}</span>
                            <span className="text-sm font-bold text-[var(--text-primary)]">{LABOR_LABEL[l.tipo]}</span>
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: est.bg, color: est.fg }}><est.icon className="h-3 w-3" />{est.label}</span>
                          </div>
                          {(l.responsable || l.detalle || l.cantidad != null || l.insumo || l.costo != null) && (
                            <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{[l.detalle, l.responsable && `por ${l.responsable}`, l.cantidad != null && `${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""}`, l.insumo, l.costo != null && `S/ ${money(l.costo)}`].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-bold text-[var(--text-secondary)]">{fdate(l.fecha)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
