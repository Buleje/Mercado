"use client";

/**
 * CacaoBeneficioForm — registra el beneficio (fermentación + secado) de un lote
 * de cacao (ADR-128 v2). Picker de lote + merma húmedo→seco en vivo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Leaf, Loader2, X, Search, Check, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { CACAO_FERMENTADORES, CACAO_SECADO, cacaoMerma, cumpleHumedad } from "@/lib/cacao/cacao-quality";

interface LoteOpt { id: string; loteCode: string; variedad: string | null; pesoKg: string; tipoGrano: string }
interface Props { onClose: () => void; onSaved: () => void }
const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const FERM_LABEL: Record<string, string> = { cajon: "Cajón", saco: "Saco", monton: "Montón", tina: "Tina" };
const SEC_LABEL: Record<string, string> = { solar: "Solar", tunel: "Túnel", mecanico: "Mecánico" };

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
  const humOk = humedadFinal ? cumpleHumedad(Number(humedadFinal)) : null;
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

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[660px]">
      <div className="flex h-full max-h-[88vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Leaf className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Beneficio del lote</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Fermentación + secado (post-cosecha)</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>

        <form id="cacao-beneficio-form" onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && <div className="rounded-xl border border-[var(--data-danger-200)] bg-[var(--data-danger-50)] px-4 py-3 text-sm text-[var(--data-danger-900)]">{error}</div>}

          {/* Picker de lote */}
          <div className="space-y-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">Lote a beneficiar</span>
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

          {/* Fermentación */}
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Fermentación (típico 5-7 días)</span>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Inicio"><input type="date" value={fermInicio} onChange={(e) => setFermInicio(e.target.value)} className={I} /></Field>
              <Field label="Días"><input type="number" value={fermDias} onChange={(e) => setFermDias(e.target.value)} placeholder="6" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Volteos"><input type="number" value={fermVolteos} onChange={(e) => setFermVolteos(e.target.value)} placeholder="3" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Fermentador"><select value={tipoFermentador} onChange={(e) => setTipoFerm(e.target.value)} className={I}><option value="">—</option>{CACAO_FERMENTADORES.map((f) => <option key={f} value={f}>{FERM_LABEL[f]}</option>)}</select></Field>
              <Field label="Temp. máx (°C)"><input type="number" step="0.1" value={fermTempMaxC} onChange={(e) => setTemp(e.target.value)} placeholder="48" className={`${I} font-mono tabular-nums`} /></Field>
            </div>
          </div>

          {/* Secado */}
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Secado (meta ≤ 7% humedad)</span>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Inicio"><input type="date" value={secInicio} onChange={(e) => setSecInicio(e.target.value)} className={I} /></Field>
              <Field label="Días"><input type="number" value={secDias} onChange={(e) => setSecDias(e.target.value)} placeholder="7" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Método"><select value={metodoSecado} onChange={(e) => setMetodo(e.target.value)} className={I}><option value="">—</option>{CACAO_SECADO.map((s) => <option key={s} value={s}>{SEC_LABEL[s]}</option>)}</select></Field>
              <Field label="Humedad inicial %"><input type="number" step="0.1" value={humedadInicial} onChange={(e) => setHumIni(e.target.value)} placeholder="55" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Humedad final %"><input type="number" step="0.1" value={humedadFinal} onChange={(e) => setHumFin(e.target.value)} placeholder="7.0" className={`${I} font-mono tabular-nums ${humOk === false ? "border-[var(--data-warning-400)]" : ""}`} /></Field>
            </div>
          </div>

          {/* Pesos + merma */}
          <div className="grid grid-cols-3 items-end gap-3">
            <Field label="Peso húmedo (kg)"><input type="number" step="0.01" value={pesoHumedoKg} onChange={(e) => setPesoH(e.target.value)} placeholder="100" className={`${I} font-mono tabular-nums`} /></Field>
            <Field label="Peso seco (kg)"><input type="number" step="0.01" value={pesoSecoKg} onChange={(e) => setPesoS(e.target.value)} placeholder="40" className={`${I} font-mono tabular-nums`} /></Field>
            <div className="rounded-lg bg-[var(--surface-sunken)] p-2 text-center"><div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Merma</div><div className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{merma != null ? `${merma}%` : "—"}</div></div>
          </div>

          <Field label="Observaciones"><textarea value={observaciones} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Notas del beneficio…" className={`${I} h-auto resize-none py-2.5`} /></Field>
        </form>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] px-5 py-3.5">
          <span className="hidden text-xs text-[var(--text-tertiary)] sm:flex sm:items-center sm:gap-1.5"><Scale className="h-3.5 w-3.5" /> Estado y merma se calculan solos</span>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" form="cacao-beneficio-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar beneficio"}</button>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">{label}</span>{children}</label>;
}
