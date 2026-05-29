"use client";

/**
 * CacaoLoteForm — alta de lote de acopio de cacao (ADR-128).
 * Picker de productor data-driven + prueba de corte (NTP-ISO 1114) con grado
 * (NTP-ISO 2451) y liquidación al productor calculados EN VIVO.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Leaf, Loader2, X, Search, Check, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CACAO_VARIEDADES, CACAO_TIPO_GRANO, cacaoGrade, cacaoFermentationIndex, cacaoLiquidacion,
  cumpleHumedad, GRADO_LABEL,
} from "@/lib/cacao/cacao-quality";

interface Producer { id: string; codigo: string | null; nombre: string; variedad: string | null; sector: string | null }
interface Props { onClose: () => void; onSaved: (o?: { keepOpen?: boolean }) => void }

const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";

export default function CacaoLoteForm({ onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [productorId, setProductorId] = useState<string | null>(null);
  const [productorNombre, setProductorNombre] = useState("");
  const [variedad, setVariedad] = useState<string>("");
  const [tipoGrano, setTipoGrano] = useState<"humedo" | "seco">("seco");
  const [pesoKg, setPesoKg] = useState("");
  const [humedadPct, setHumedadPct] = useState("");
  const [precioPorKg, setPrecioPorKg] = useState("");
  const [premioPorKg, setPremioPorKg] = useState("");
  // Prueba de corte
  const [cutGranos, setCutGranos] = useState("");
  const [pctBienFermentado, setBien] = useState("");
  const [pctVioleta, setVioleta] = useState("");
  const [pctPizarroso, setPizarroso] = useState("");
  const [pctMohoso, setMohoso] = useState("");
  const [observaciones, setObs] = useState("");

  const [producers, setProducers] = useState<Producer[]>([]);
  const [pq, setPq] = useState("");
  const [loadingP, setLoadingP] = useState(false);

  const loadProducers = useCallback(async () => {
    setLoadingP(true);
    try {
      const r = await fetch("/api/admin/cacao?view=producers", { credentials: "include" });
      setProducers(r.ok ? (await r.json()).producers ?? [] : []);
    } catch { setProducers([]); } finally { setLoadingP(false); }
  }, []);
  useEffect(() => { loadProducers(); }, [loadProducers]);

  const filtered = useMemo(() => {
    const q = pq.trim().toLowerCase();
    return (q ? producers.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q)) : producers).slice(0, 40);
  }, [producers, pq]);

  function pick(p: Producer) {
    setProductorId(p.id); setProductorNombre(p.nombre);
    if (p.variedad && !variedad) setVariedad(p.variedad);
  }

  // Cálculos en vivo
  const cut = {
    pctBienFermentado: pctBienFermentado ? Number(pctBienFermentado) : null,
    pctVioleta: pctVioleta ? Number(pctVioleta) : null,
    pctPizarroso: pctPizarroso ? Number(pctPizarroso) : null,
    pctMohoso: pctMohoso ? Number(pctMohoso) : null,
    humedadPct: humedadPct ? Number(humedadPct) : null,
  };
  const grado = cacaoGrade(cut);
  const indice = cacaoFermentationIndex(cut);
  const liquidacion = cacaoLiquidacion(pesoKg ? Number(pesoKg) : 0, precioPorKg ? Number(precioPorKg) : 0, premioPorKg ? Number(premioPorKg) : 0);
  const humOk = humedadPct ? cumpleHumedad(Number(humedadPct)) : null;

  const isValid = Number(pesoKg) > 0;

  async function submit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("Ingresá el peso en kg."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        fecha: new Date(fecha).toISOString(), productorId, productorNombre: productorNombre.trim() || null,
        variedad: variedad || null, tipoGrano, pesoKg: Number(pesoKg),
        humedadPct: humedadPct ? Number(humedadPct) : null,
        precioPorKg: precioPorKg ? Number(precioPorKg) : null, premioPorKg: premioPorKg ? Number(premioPorKg) : null,
        cutGranos: cutGranos ? Number(cutGranos) : null,
        pctBienFermentado: cut.pctBienFermentado, pctVioleta: cut.pctVioleta,
        pctPizarroso: cut.pctPizarroso, pctMohoso: cut.pctMohoso,
        observaciones: observaciones.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=lote", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      if (keepOpen) {
        setPesoKg(""); setHumedadPct(""); setBien(""); setVioleta(""); setPizarroso(""); setMohoso(""); setCutGranos(""); setObs("");
        setSubmitting(false); onSaved({ keepOpen: true });
      } else onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[680px]">
      <div className="flex h-full max-h-[88vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Leaf className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Nuevo lote de acopio</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Cacao · calidad NTP-ISO + liquidación</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>

        <form id="cacao-lote-form" onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={I} /></Field>
            <Field label="Tipo de grano"><select value={tipoGrano} onChange={(e) => setTipoGrano(e.target.value as "humedo" | "seco")} className={I}>{CACAO_TIPO_GRANO.map((t) => <option key={t} value={t}>{t === "seco" ? "Seco" : "Húmedo"}</option>)}</select></Field>
          </div>

          {/* Picker de productor */}
          <div className="space-y-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">Productor</span>
            {productorNombre && <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Check className="h-4 w-4 text-[var(--accent)]" /> {productorNombre}</div>}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Buscar productor…" className={`${I} h-9 pl-8`} />
            </div>
            <div className="max-h-32 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
              {loadingP ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
                : filtered.length === 0 ? <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">Sin productores. Registralos en la pestaña Productores (o dejá el nombre libre abajo).</div>
                : filtered.map((p) => (
                  <button key={p.id} type="button" onClick={() => pick(p)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]/60 ${productorId === p.id ? "bg-[var(--accent-soft)]/60" : ""}`}>
                    <span className="truncate"><span className="font-mono text-xs font-bold text-[var(--text-tertiary)]">{p.codigo ?? "—"}</span> <span className="font-medium text-[var(--text-primary)]">{p.nombre}</span></span>
                    {p.variedad && <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{p.variedad}</span>}
                  </button>
                ))}
            </div>
            <input value={productorNombre} onChange={(e) => { setProductorNombre(e.target.value); setProductorId(null); }} placeholder="o escribí el nombre del productor…" className={`${I} h-9`} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Variedad"><select value={variedad} onChange={(e) => setVariedad(e.target.value)} className={I}><option value="">—</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
            <Field label="Peso (kg)" required><input type="number" step="0.01" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} placeholder="50.00" className={`${I} font-mono tabular-nums`} /></Field>
            <Field label="Humedad (%)" hint="meta ≤ 7%"><input type="number" step="0.1" value={humedadPct} onChange={(e) => setHumedadPct(e.target.value)} placeholder="7.0" className={`${I} font-mono tabular-nums ${humOk === false ? "border-[var(--data-warning-400)]" : ""}`} /></Field>
          </div>

          {/* Prueba de corte */}
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-3">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Prueba de corte (NTP-ISO 1114) — % de granos</span>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Bien ferm. (marrón)"><input type="number" step="1" value={pctBienFermentado} onChange={(e) => setBien(e.target.value)} placeholder="%" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Violeta (parcial)"><input type="number" step="1" value={pctVioleta} onChange={(e) => setVioleta(e.target.value)} placeholder="%" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Pizarroso"><input type="number" step="1" value={pctPizarroso} onChange={(e) => setPizarroso(e.target.value)} placeholder="%" className={`${I} font-mono tabular-nums`} /></Field>
              <Field label="Mohoso"><input type="number" step="1" value={pctMohoso} onChange={(e) => setMohoso(e.target.value)} placeholder="%" className={`${I} font-mono tabular-nums`} /></Field>
            </div>
            <div className="mt-2"><Field label="Granos evaluados"><input type="number" value={cutGranos} onChange={(e) => setCutGranos(e.target.value)} placeholder="100" className={`${I} h-9 w-32 font-mono tabular-nums`} /></Field></div>
          </div>

          {/* Liquidación */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio S//kg"><input type="number" step="0.01" value={precioPorKg} onChange={(e) => setPrecioPorKg(e.target.value)} placeholder="9.50" className={`${I} font-mono tabular-nums`} /></Field>
            <Field label="Premio S//kg" hint="calidad / fino de aroma"><input type="number" step="0.01" value={premioPorKg} onChange={(e) => setPremioPorKg(e.target.value)} placeholder="0.50" className={`${I} font-mono tabular-nums`} /></Field>
          </div>

          {/* Preview en vivo */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
            <Metric label="Grado" value={grado ? GRADO_LABEL[grado] : "—"} tone={grado === "I" ? "success" : grado === "II" ? "warning" : grado === "fuera_norma" ? "danger" : "muted"} />
            <Metric label="Índice ferm." value={indice ? `${indice}%` : "—"} tone="muted" />
            <Metric label="A pagar" value={liquidacion ? `S/ ${liquidacion.toFixed(2)}` : "—"} tone="success" />
          </div>

          <Field label="Observaciones"><textarea value={observaciones} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Notas del acopio…" className={`${I} h-auto resize-none py-2.5`} /></Field>
        </form>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] px-5 py-3.5">
          <span className="hidden text-xs text-[var(--text-tertiary)] sm:flex sm:items-center sm:gap-1.5"><Scale className="h-3.5 w-3.5" /> Grado y pago se calculan al vuelo</span>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="button" onClick={(e) => submit(e, true)} disabled={!isValid || submitting} className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50">Guardar y otro</button>
            <button type="submit" form="cacao-lote-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar lote"}</button>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{label}{required && <span className="text-[var(--data-error-600)]">*</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "muted" }) {
  const cls = tone === "success" ? "text-[var(--data-success-700)]" : tone === "warning" ? "text-[var(--data-warning-700)]" : tone === "danger" ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]";
  return (
    <div>
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</div>
      <div className={`text-base font-extrabold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
