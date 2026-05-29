"use client";

/**
 * CacaoAcopio — Módulo admin de Acopio & Beneficio de Cacao (ADR-128).
 * Gating: spec:agricola:cacao-acopio. Sub-vistas: Acopio · Productores · Resumen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Leaf, Plus, RefreshCw, Search, Users, Scale, Coins, PackageCheck, AlertCircle, X as XIcon, BarChart3, Droplets,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { csrfHeaders } from "@/lib/csrf-client";
import { GRADO_LABEL, type CacaoGrado } from "@/lib/cacao/cacao-quality";
import CacaoLoteForm from "./CacaoLoteForm";
import CacaoProducerForm from "./CacaoProducerForm";
import CacaoBeneficioForm from "./CacaoBeneficioForm";
import CacaoLoteDrawer from "./CacaoLoteDrawer";
import CacaoProducerDrawer from "./CacaoProducerDrawer";

type View = "acopio" | "beneficio" | "productores" | "resumen";
interface Beneficio {
  id: string; loteCode: string | null; estado: string; fermDias: number | null; secDias: number | null;
  metodoSecado: string | null; humedadFinal: string | null; pesoHumedoKg: string | null; pesoSecoKg: string | null; mermaPct: string | null;
}
interface Lote {
  id: string; loteCode: string; fecha: string; productorNombre: string | null; variedad: string | null;
  tipoGrano: string; pesoKg: string; humedadPct: string | null; precioPorKg: string | null; totalPagado: string | null;
  indiceFermentacion: string | null; grado: string | null; status: string; annulledReason: string | null;
}
interface Producer { id: string; codigo: string | null; nombre: string; dni: string | null; sector: string | null; parcelaHa: string | null; variedad: string | null; certificacion: string | null }
interface Stats {
  lotes: number; productoresActivos: number; kgAcopiados: number; valorPagado: number; indiceFermentacionProm: number; pctHumedadEnNorma: number;
  porVariedad: { variedad: string; kg: number }[]; porGrado: { grado: string; count: number }[];
}

const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n2 = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(2));
const VIEWS: { key: View; label: string; icon: typeof Leaf; hint: string }[] = [
  { key: "acopio", label: "Acopio", icon: PackageCheck, hint: "Lotes recibidos" },
  { key: "beneficio", label: "Beneficio", icon: Droplets, hint: "Fermentación + secado" },
  { key: "productores", label: "Productores", icon: Users, hint: "Proveedores" },
  { key: "resumen", label: "Resumen", icon: BarChart3, hint: "KPIs de campaña" },
];
const ESTADO_BENEFICIO: Record<string, { label: string; cls: string }> = {
  fermentando: { label: "Fermentando", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" },
  secando: { label: "Secando", cls: "bg-[var(--data-info-100)] text-[var(--data-info-900)]" },
  terminado: { label: "Terminado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]" },
};

export default function CacaoAcopio() {
  const [view, setView] = useState<View>("acopio");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLote, setShowLote] = useState(false);
  const [showProducer, setShowProducer] = useState(false);
  const [showBeneficio, setShowBeneficio] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  const [producerDrawerId, setProducerDrawerId] = useState<string | null>(null);

  const load = useCallback(async (v: View) => {
    setLoading(true); setError(null);
    try {
      const param = v === "productores" ? "producers" : v === "resumen" ? "stats" : v === "beneficio" ? "beneficios" : "lotes";
      const q = new URLSearchParams({ view: param });
      if (search.trim() && v !== "resumen") q.set("search", search.trim());
      const r = await fetch(`/api/admin/cacao?${q}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const d = await r.json();
      if (v === "productores") setProducers(d.producers ?? []);
      else if (v === "resumen") setStats(d.stats ?? null);
      else if (v === "beneficio") setBeneficios(d.beneficios ?? []);
      else setLotes(d.lotes ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(view); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    try {
      const r = await fetch("/api/admin/cacao", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "annul_lote", id: annulId, reason: annulReason.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); setAnnulReason(""); load("acopio");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const kpis = useMemo(() => {
    const reg = lotes.filter((l) => l.status === "registrado");
    const kg = reg.reduce((a, l) => a + Number(l.pesoKg ?? 0), 0);
    const valor = reg.reduce((a, l) => a + Number(l.totalPagado ?? 0), 0);
    const gradoI = reg.filter((l) => l.grado === "I").length;
    return { count: reg.length, kg, valor, gradoI };
  }, [lotes]);

  return (
    <div className="space-y-6">
      <AdminModuleHeader eyebrow="Agrícola · Especialización" title="Acopio & Beneficio de Cacao" description="Libro de acopio de cacao en grano: productores, lotes, calidad (prueba de corte + humedad NTP-ISO) y liquidación al productor. Alineado a NTP 208.040." icon={Leaf}>
        <button type="button" onClick={() => load(view)} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60" aria-label="Recargar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span>Recargar</span></button>
        {view === "productores"
          ? <button type="button" onClick={() => setShowProducer(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo productor</button>
          : view === "acopio"
          ? <button type="button" onClick={() => setShowLote(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo lote</button>
          : view === "beneficio"
          ? <button type="button" onClick={() => setShowBeneficio(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo beneficio</button>
          : null}
      </AdminModuleHeader>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b-2 border-[var(--rule-soft)] pb-px">
        {VIEWS.map((v) => {
          const Icon = v.icon; const active = view === v.key;
          return (
            <button key={v.key} type="button" onClick={() => setView(v.key)} className={`inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
              <Icon className="h-4 w-4" /><span>{v.label}</span><span className="hidden text-xs font-normal text-[var(--text-tertiary)] sm:inline">· {v.hint}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* ACOPIO */}
      {view === "acopio" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Lotes acopiados" value={String(kpis.count)} icon={PackageCheck} emphasis="neutral" />
            <StatCard label="Kg acopiados" value={`${n2(kpis.kg)} kg`} icon={Scale} emphasis="success" />
            <StatCard label="Pagado a productores" value={`S/ ${n2(kpis.valor)}`} icon={Coins} emphasis="neutral" />
            <StatCard label="Lotes Grado I" value={String(kpis.gradoI)} subValue="mejor calidad" icon={Leaf} emphasis={kpis.gradoI > 0 ? "success" : "neutral"} />
          </div>
          <SearchBar value={search} onChange={setSearch} onEnter={() => load("acopio")} placeholder="Buscar por lote, productor o variedad…" />
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr>
                <Th>Lote</Th><Th>Fecha</Th><Th>Productor</Th><Th>Variedad</Th>
                <Th className="text-right">Peso (kg)</Th><Th className="text-right">Humedad</Th><Th>Grado</Th><Th className="text-right">Pagado</Th><Th className="text-right">Acción</Th>
              </tr></thead>
              <tbody>
                {lotes.map((l) => {
                  const annul = l.status === "anulado";
                  return (
                    <tr key={l.id} onClick={() => setLoteDrawerId(l.id)} className={`cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)] ${annul ? "opacity-50" : ""}`}>
                      <Td><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{l.loteCode}</span>{annul && <span className="ml-2 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">ANULADO</span>}</Td>
                      <Td className="text-[var(--text-secondary)]">{fdate(l.fecha)}</Td>
                      <Td className="font-medium text-[var(--text-primary)]">{l.productorNombre ?? "—"}</Td>
                      <Td className="text-[var(--text-secondary)]">{l.variedad ?? "—"} <span className="text-xs text-[var(--text-tertiary)]">{l.tipoGrano === "humedo" ? "(húmedo)" : ""}</span></Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n2(l.pesoKg)}</Td>
                      <Td className="text-right font-mono tabular-nums"><span className={l.humedadPct && Number(l.humedadPct) > 7 ? "text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>{l.humedadPct ? `${Number(l.humedadPct).toFixed(1)}%` : "—"}</span></Td>
                      <Td><GradoBadge grado={l.grado} /></Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}</Td>
                      <Td className="text-right">{annul ? <span className="text-xs text-[var(--text-tertiary)]">—</span> : <button type="button" onClick={(e) => { e.stopPropagation(); setAnnulId(l.id); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] px-3 text-xs font-bold text-[var(--data-danger-900)] hover:bg-[var(--data-danger-100)]">Anular</button>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={lotes.length === 0} icon={PackageCheck} msg="Sin lotes de acopio. Registrá el primero." />
          </div>
        </>
      )}

      {/* PRODUCTORES */}
      {view === "productores" && (
        <>
          <SearchBar value={search} onChange={setSearch} onEnter={() => load("productores")} placeholder="Buscar productor por nombre, código o sector…" />
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr><Th>Código</Th><Th>Nombre</Th><Th>DNI</Th><Th>Sector</Th><Th className="text-right">Ha</Th><Th>Variedad</Th><Th>Certificación</Th></tr></thead>
              <tbody>
                {producers.map((p) => (
                  <tr key={p.id} onClick={() => setProducerDrawerId(p.id)} className="cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)]">
                    <Td><span className="font-mono text-xs font-bold text-[var(--text-tertiary)]">{p.codigo ?? "—"}</span></Td>
                    <Td className="font-medium text-[var(--text-primary)]">{p.nombre}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.dni ?? "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.sector ?? "—"}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.parcelaHa ? Number(p.parcelaHa).toFixed(1) : "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.variedad ?? "—"}</Td>
                    <Td>{p.certificacion ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">{p.certificacion.replace("_", " ")}</span> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={producers.length === 0} icon={Users} msg="Sin productores registrados. Agregá el primero." />
          </div>
        </>
      )}

      {/* BENEFICIO */}
      {view === "beneficio" && (
        <>
          <SearchBar value={search} onChange={setSearch} onEnter={() => load("beneficio")} placeholder="Buscar por código de lote…" />
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr>
                <Th>Lote</Th><Th>Estado</Th><Th className="text-right">Ferm. (días)</Th><Th className="text-right">Secado (días)</Th><Th>Método</Th>
                <Th className="text-right">Hum. final</Th><Th className="text-right">Húmedo→Seco</Th><Th className="text-right">Merma</Th>
              </tr></thead>
              <tbody>
                {beneficios.map((b) => {
                  const est = ESTADO_BENEFICIO[b.estado] ?? { label: b.estado, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
                  return (
                    <tr key={b.id} className="border-t border-[var(--rule-soft)]">
                      <Td><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{b.loteCode ?? "—"}</span></Td>
                      <Td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${est.cls}`}>{est.label}</span></Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.fermDias ?? "—"}</Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.secDias ?? "—"}</Td>
                      <Td className="text-[var(--text-secondary)]">{b.metodoSecado ?? "—"}</Td>
                      <Td className="text-right font-mono tabular-nums"><span className={b.humedadFinal && Number(b.humedadFinal) > 7 ? "text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>{b.humedadFinal ? `${Number(b.humedadFinal).toFixed(1)}%` : "—"}</span></Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.pesoHumedoKg ? n2(b.pesoHumedoKg) : "—"} → {b.pesoSecoKg ? n2(b.pesoSecoKg) : "—"}</Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{b.mermaPct ? `${Number(b.mermaPct).toFixed(1)}%` : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={beneficios.length === 0} icon={Droplets} msg="Sin beneficios registrados. Registrá la fermentación/secado de un lote." />
          </div>
        </>
      )}

      {/* RESUMEN */}
      {view === "resumen" && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Kg acopiados" value={`${n2(stats.kgAcopiados)} kg`} subValue={`${stats.lotes} lotes`} icon={Scale} emphasis="success" />
            <StatCard label="Pagado a productores" value={`S/ ${n2(stats.valorPagado)}`} subValue={`${stats.productoresActivos} productores`} icon={Coins} emphasis="neutral" />
            <StatCard label="Índice ferm. prom." value={`${stats.indiceFermentacionProm}%`} icon={Leaf} emphasis={stats.indiceFermentacionProm >= 60 ? "success" : "warning"} />
            <StatCard label="Humedad en norma" value={`${stats.pctHumedadEnNorma}%`} subValue="≤ 7% (NTP 208.040)" icon={Scale} emphasis={stats.pctHumedadEnNorma >= 80 ? "success" : "warning"} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Kg por variedad">
              {stats.porVariedad.length === 0 ? <Muted /> : stats.porVariedad.map((v) => <Bar key={v.variedad} label={v.variedad} value={v.kg} max={stats.porVariedad[0].kg} unit="kg" />)}
            </Panel>
            <Panel title="Lotes por grado">
              {stats.porGrado.length === 0 ? <Muted /> : stats.porGrado.map((g) => (
                <div key={g.grado} className="flex items-center justify-between py-1.5 text-sm"><GradoBadge grado={g.grado === "sin_clasificar" ? null : g.grado} /><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{g.count}</span></div>
              ))}
            </Panel>
          </div>
        </div>
      )}
      {view === "resumen" && loading && !stats && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando resumen…</p></div>}

      {showLote && <CacaoLoteForm onClose={() => setShowLote(false)} onSaved={(o) => { if (!o?.keepOpen) setShowLote(false); load("acopio"); }} />}
      {showProducer && <CacaoProducerForm onClose={() => setShowProducer(false)} onSaved={() => { setShowProducer(false); load("productores"); }} />}
      {showBeneficio && <CacaoBeneficioForm onClose={() => setShowBeneficio(false)} onSaved={() => { setShowBeneficio(false); load("beneficio"); }} />}

      {loteDrawerId && <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />}
      {producerDrawerId && (
        <CacaoProducerDrawer
          producerId={producerDrawerId}
          onClose={() => setProducerDrawerId(null)}
          onChanged={() => load("productores")}
          onOpenLote={(id) => { setProducerDrawerId(null); setLoteDrawerId(id); }}
        />
      )}

      {annulId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAnnulId(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Anular lote</h3>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Motivo (queda en el historial, no se borra).</p>
            <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (min 3 caracteres)" className="mt-3 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm outline-none focus:border-[var(--data-danger-500)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3} onClick={annul} className="inline-flex h-10 items-center rounded-xl bg-[var(--data-danger-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirmar anulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
function SearchBar({ value, onChange, onEnter, placeholder }: { value: string; onChange: (v: string) => void; onEnter: () => void; placeholder: string }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
      <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter()} placeholder={placeholder} className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
    </div>
  );
}
function GradoBadge({ grado }: { grado: string | null }) {
  if (!grado) return <span className="text-xs text-[var(--text-tertiary)]">sin clasificar</span>;
  const g = grado as CacaoGrado;
  const cls = g === "I" ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : g === "II" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" : "bg-[var(--data-danger-100)] text-[var(--data-danger-900)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{GRADO_LABEL[g] ?? grado}</span>;
}
function EmptyOrLoading({ loading, empty, icon: Icon, msg }: { loading: boolean; empty: boolean; icon: typeof Leaf; msg: string }) {
  if (loading) return <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>;
  if (empty) return <div className="p-12 text-center text-[var(--text-tertiary)]"><Icon className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-base font-medium">{msg}</p></div>;
  return null;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"><h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">{title}</h3><div className="space-y-2">{children}</div></div>;
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
function Muted() { return <p className="text-sm text-[var(--text-tertiary)]">Sin datos todavía.</p>; }
