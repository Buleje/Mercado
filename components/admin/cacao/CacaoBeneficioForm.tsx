"use client";

/**
 * CacaoBeneficioForm — beneficio (fermentación + secado) de un lote (ADR-128 v2
 * rediseñado). Layout 2 columnas: formulario seccionado + ficha VIVA del
 * beneficio (estado, merma, rendimiento, húmedo→seco, humedad). Picker de lote.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Leaf, Loader2, X, Search, Check, Droplets, Beaker, Sun, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { CACAO_FERMENTADORES, CACAO_SECADO, cacaoMerma, cacaoRendimiento, cacaoProyeccionSeco, cumpleHumedad } from "@/lib/cacao/cacao-quality";

interface LoteOpt { id: string; loteCode: string; variedad: string | null; pesoKg: string; tipoGrano: string }
interface Props { onClose: () => void; onSaved: () => void }
const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const FERM_LABEL: Record<string, string> = { cajon: "Cajón", saco: "Saco", monton: "Montón", tina: "Tina" };
const SEC_LABEL: Record<string, string> = { solar: "Solar", tunel: "Túnel", mecanico: "Mecánico" };
const ESTADO_CFG: Record<string, { label: string; cls: string }> = {
  fermentando: { label: "Fermentando", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" },
  secando: { label: "Secando", cls: "bg-[var(--data-info-100)] text-[var(--data-info-900)]" },
  terminado: { label: "Terminado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]" },
};

export default function CacaoBeneficioForm({ onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [loteCode, setLoteCode] = useState("");
  const [fermInicio, setFermInicio] = useState("");
  const [fermDias, setFermDias] = useState("");
  const [fermVolteos, setFermVolteos] = useState("");
  const [tipoFermentador, setTipoFerm] = useState("");
  const [fermTempMaxC, setTemp] = useState("");
  const [secInicio, setSecInicio] = useState("");
  const [secDias, setSecDias] = useState("");
  const [metodoSecado, setMetodo] = useState("");
  const [humedadInicial, setHumIni] = useState("");
  const [humedadFinal, setHumFin] = useState("");
  const [pesoHumedoKg, setPesoH] = useState("");
  const [pesoSecoKg, setPesoS] = useState("");
  const [observaciones, setObs] = useState("");

  const [lotes, setLotes] = useState<LoteOpt[]>([]);
  const [lq, setLq] = useState("");
  const [loadingL, setLoadingL] = useState(false);

  const loadLotes = useCallback(async () => {
    setLoadingL(true);
    try { const r = await fetch("/api/admin/cacao?view=lotes-disponibles", { credentials: "include" }); setLotes(r.ok ? (await r.json()).lotes ?? [] : []); }
    catch { setLotes([]); } finally { setLoadingL(false); }
  }, []);
  useEffect(() => { loadLotes(); }, [loadLotes]);

  const filtered = useMemo(() => {
    const q = lq.trim().toLowerCase();
    return (q ? lotes.filter((l) => l.loteCode.toLowerCase().includes(q) || (l.variedad ?? "").toLowerCase().includes(q)) : lotes).slice(0, 40);
  }, [lotes, lq]);

  function pick(l: LoteOpt) { setLoteId(l.id); setLoteCode(l.loteCode); if (!pesoHumedoKg && l.tipoGrano === "humedo") setPesoH(String(Number(l.pesoKg))); }

  const merma = cacaoMerma(pesoHumedoKg ? Number(pesoHumedoKg) : null, pesoSecoKg ? Number(pesoSecoKg) : null);
  const rendimiento = cacaoRendimiento(pesoHumedoKg ? Number(pesoHumedoKg) : null, pesoSecoKg ? Number(pesoSecoKg) : null);
  const proyeccion = pesoHumedoKg && !pesoSecoKg ? cacaoProyeccionSeco(Number(pesoHumedoKg)) : null;
  const humOk = humedadFinal ? cumpleHumedad(Number(humedadFinal)) : null;
  // estado auto (mismo criterio que el backend)
  const estado = (humedadFinal || pesoSecoKg) ? "terminado" : secInicio ? "secando" : "fermentando";
  const isValid = !!loteCode.trim() || !!loteId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("Elegí o nombrá el lote."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        loteId, loteCode: loteCode.trim() || null,
        fermInicio: fermInicio ? new Date(fermInicio).toISOString() : null, fermDias: fermDias ? Number(fermDias) : null,
        fermVolteos: fermVolteos ? Number(fermVolteos) : null, tipoFermentador: tipoFermentador || null, fermTempMaxC: fermTempMaxC ? Number(fermTempMaxC) : null,
        secInicio: secInicio ? new Date(secInicio).toISOString() : null, secDias: secDias ? Number(secDias) : null, metodoSecado: metodoSecado || null,
        humedadInicial: humedadInicial ? Number(humedadInicial) : null, humedadFinal: humedadFinal ? Number(humedadFinal) : null,
        pesoHumedoKg: pesoHumedoKg ? Number(pesoHumedoKg) : null, pesoSecoKg: pesoSecoKg ? Number(pesoSecoKg) : null,
        observaciones: observaciones.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=beneficio", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const est = ESTADO_CFG[estado];

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="!max-w-[940px]">
      <div className="flex h-full max-h-[90vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Droplets className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Beneficio del lote</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Fermentación + secado · estado y merma al vuelo</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <form id="cacao-beneficio-form" onSubmit={submit} className="space-y-5 px-5 py-5">
              {error && <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">{error}</div>}

              {/* Picker de lote */}
              <div className="space-y-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
                <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]"><Leaf className="h-3.5 w-3.5" />Lote a beneficiar</span>
                {loteCode && <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Check className="h-4 w-4 text-[var(--accent)]" /> {loteCode}</div>}
                <div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" /><input value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Buscar lote…" className={`${I} h-9 pl-8`} /></div>
                <div className="max-h-32 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                  {loadingL ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
                    : filtered.length === 0 ? <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">Sin lotes pendientes de beneficio. Registrá un acopio primero (o escribí el código abajo).</div>
                    : filtered.map((l) => (
                      <button key={l.id} type="button" onClick={() => pick(l)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]/60 ${loteId === l.id ? "bg-[var(--accent-soft)]/60" : ""}`}>
                        <span className="truncate"><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{l.loteCode}</span> <span className="text-[var(--text-secondary)]">{l.variedad ?? ""}</span></span>
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{Number(l.pesoKg).toFixed(0)} kg {l.tipoGrano === "humedo" ? "húmedo" : "seco"}</span>
                      </button>
                    ))}
                </div>
                <input value={loteCode} onChange={(e) => { setLoteCode(e.target.value); setLoteId(null); }} placeholder="o código de lote…" className={`${I} h-9`} />
              </div>

              <Section icon={Beaker} title="Fermentación" hint="típico 5-7 días">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Inicio"><input type="date" value={fermInicio} onChange={(e) => setFermInicio(e.target.value)} className={I} /></Field>
                  <Field label="Días"><input type="number" value={fermDias} onChange={(e) => setFermDias(e.target.value)} placeholder="6" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Volteos"><input type="number" value={fermVolteos} onChange={(e) => setFermVolteos(e.target.value)} placeholder="3" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Fermentador"><select value={tipoFermentador} onChange={(e) => setTipoFerm(e.target.value)} className={I}><option value="">—</option>{CACAO_FERMENTADORES.map((f) => <option key={f} value={f}>{FERM_LABEL[f]}</option>)}</select></Field>
                  <Field label="Temp. máx (°C)"><input type="number" step="0.1" value={fermTempMaxC} onChange={(e) => setTemp(e.target.value)} placeholder="48" className={`${I} font-mono tabular-nums`} /></Field>
                </div>
              </Section>

              <Section icon={Sun} title="Secado" hint="meta ≤ 7% humedad">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Inicio"><input type="date" value={secInicio} onChange={(e) => setSecInicio(e.target.value)} className={I} /></Field>
                  <Field label="Días"><input type="number" value={secDias} onChange={(e) => setSecDias(e.target.value)} placeholder="7" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Método"><select value={metodoSecado} onChange={(e) => setMetodo(e.target.value)} className={I}><option value="">—</option>{CACAO_SECADO.map((s) => <option key={s} value={s}>{SEC_LABEL[s]}</option>)}</select></Field>
                  <Field label="Humedad inicial %"><input type="number" step="0.1" value={humedadInicial} onChange={(e) => setHumIni(e.target.value)} placeholder="55" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Humedad final %"><input type="number" step="0.1" value={humedadFinal} onChange={(e) => setHumFin(e.target.value)} placeholder="7.0" className={`${I} font-mono tabular-nums ${humOk === false ? "border-[var(--data-warning-400)]" : ""}`} /></Field>
                </div>
              </Section>

              <Section icon={Scale} title="Pesos & notas">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Peso húmedo (kg)"><input type="number" step="0.01" value={pesoHumedoKg} onChange={(e) => setPesoH(e.target.value)} placeholder="100" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Peso seco (kg)"><input type="number" step="0.01" value={pesoSecoKg} onChange={(e) => setPesoS(e.target.value)} placeholder="40" className={`${I} font-mono tabular-nums`} /></Field>
                </div>
                <Field label="Observaciones"><textarea value={observaciones} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Notas del beneficio…" className={`${I} h-auto resize-none py-2.5`} /></Field>
              </Section>
            </form>

            {/* Ficha viva */}
            <aside className="border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-5 py-5 lg:sticky lg:top-0 lg:self-start lg:border-l-2 lg:border-t-0">
              <p className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Vista previa del beneficio</p>

              <div className="flex items-center justify-between">
                <span className={`inline-flex rounded-full px-3 py-1.5 text-base font-extrabold ${est.cls}`}>{est.label}</span>
                {humedadFinal && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${humOk ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"}`}><Droplets className="h-3.5 w-3.5" />{Number(humedadFinal).toFixed(1)}%</span>}
              </div>

              <div className="mt-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Húmedo → seco</p>
                <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {pesoHumedoKg ? Number(pesoHumedoKg).toFixed(0) : "—"} <span className="text-base text-[var(--text-tertiary)]">kg</span>
                  <span className="mx-1.5 text-base text-[var(--text-tertiary)]">→</span>
                  {pesoSecoKg ? Number(pesoSecoKg).toFixed(0) : proyeccion != null ? `~${proyeccion.toFixed(0)}` : "—"} <span className="text-base text-[var(--text-tertiary)]">kg</span>
                </p>
                {proyeccion != null && !pesoSecoKg && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">proyectado (merma típica ~60%)</p>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
                  <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Merma</div>
                  <div className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{merma != null ? `${merma}%` : "—"}</div>
                </div>
                <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
                  <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Rendimiento</div>
                  <div className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{rendimiento != null ? `${rendimiento}%` : "—"}</div>
                </div>
              </div>

              {(fermDias || secDias) && (
                <p className="mt-3 text-xs text-[var(--text-secondary)]">{fermDias ? `Fermentación ${fermDias}d` : ""}{fermDias && secDias ? " · " : ""}{secDias ? `secado ${secDias}d` : ""}</p>
              )}
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">El estado se define solo: hay peso seco/humedad final → terminado; hay inicio de secado → secando; si no → fermentando.</p>
            </aside>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" form="cacao-beneficio-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar beneficio"}</button>
        </footer>
      </div>
    </AdminModal>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Leaf; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[var(--accent)]"><Icon className="h-4 w-4" /></span>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {hint && <span className="text-xs text-[var(--text-tertiary)]">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">{label}</span>{children}</label>;
}
