"use client";

/**
 * CacaoLoteDrawer — ficha de detalle de un lote de acopio (ADR-128).
 * Drawer derecho (AdminModal variant="side"). Muestra calidad desglosada
 * (cut test), liquidación, beneficio vinculado y botón de recibo imprimible.
 */
import { useEffect, useState } from "react";
import {
  Leaf, Loader2, Printer, Droplets, Scale, Coins, Beaker, X as XIcon, FlaskConical,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { GRADO_LABEL, type CacaoGrado } from "@/lib/cacao/cacao-quality";
import { printCacaoRecibo } from "@/lib/cacao/cacao-recibo";

interface LoteFull {
  id: string; loteCode: string; fecha: string; productorNombre: string | null; variedad: string | null;
  tipoGrano: string; pesoKg: string; humedadPct: string | null; precioPorKg: string | null; premioPorKg: string | null;
  totalPagado: string | null; cutGranos: number | null; pctBienFermentado: string | null; pctVioleta: string | null;
  pctPizarroso: string | null; pctMohoso: string | null; granosPor100g: number | null; pctCascara: string | null;
  pctImpurezas: string | null; indiceFermentacion: string | null; grado: string | null; destino: string | null;
  observaciones: string | null; status: string; annulledReason: string | null;
}
interface Beneficio {
  id: string; estado: string; fermDias: number | null; fermVolteos: number | null; fermTempMaxC: string | null;
  tipoFermentador: string | null; secDias: number | null; metodoSecado: string | null; humedadInicial: string | null;
  humedadFinal: string | null; pesoHumedoKg: string | null; pesoSecoKg: string | null; mermaPct: string | null; observaciones: string | null;
}

const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n2 = (v: string | number | null) => (v == null || v === "" ? "—" : Number(v).toFixed(2));
const pct = (v: string | number | null) => (v == null || v === "" ? "—" : `${Number(v).toFixed(1)}%`);

export default function CacaoLoteDrawer({ loteId, acopiador, onClose }: { loteId: string; acopiador?: string; onClose: () => void }) {
  const [lote, setLote] = useState<LoteFull | null>(null);
  const [beneficio, setBeneficio] = useState<Beneficio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`/api/admin/cacao?view=lote-detail&id=${encodeURIComponent(loteId)}`, { credentials: "include" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        const d = await r.json();
        if (cancel) return;
        setLote(d.lote ?? null); setBeneficio(d.beneficio ?? null);
      } catch (e) { if (!cancel) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [loteId]);

  const cut = lote ? [
    { label: "Bien fermentado", sub: "marrón · fino aroma", v: lote.pctBienFermentado, tone: "success" as const },
    { label: "Violeta", sub: "parcial", v: lote.pctVioleta, tone: "warning" as const },
    { label: "Pizarroso", sub: "sin fermentar", v: lote.pctPizarroso, tone: "danger" as const },
    { label: "Mohoso", sub: "defecto", v: lote.pctMohoso, tone: "danger" as const },
  ] : [];
  const hasCut = lote && cut.some((c) => c.v != null && c.v !== "");

  return (
    <AdminModal open onClose={onClose} variant="side" hideCloseButton className="!max-w-[480px]">
      <div className="flex h-full max-h-screen flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Leaf className="h-5 w-5" /></span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ficha de lote</p>
              <h2 className="font-mono text-base font-extrabold text-[var(--text-primary)]">{lote?.loteCode ?? "…"}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><XIcon className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
          {loading && <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-tertiary)]"><Loader2 className="h-5 w-5 animate-spin" /> Cargando ficha…</div>}
          {error && <div className="rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-3 text-[var(--data-danger-900)]">{error}</div>}

          {lote && !loading && (
            <>
              {lote.status === "anulado" && (
                <div className="rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-3 text-[var(--data-danger-900)]">
                  <strong>Lote anulado.</strong> {lote.annulledReason ?? ""}
                </div>
              )}

              {/* Resumen */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-[var(--text-primary)]">{lote.productorNombre ?? "Productor no asignado"}</p>
                  <p className="text-[var(--text-tertiary)]">{fdate(lote.fecha)} · {lote.variedad ?? "—"} · {lote.tipoGrano === "humedo" ? "húmedo" : "seco"}</p>
                </div>
                <GradoBadge grado={lote.grado} />
              </div>

              {/* Liquidación */}
              <Section icon={Coins} title="Liquidación al productor">
                <Row label="Peso acopiado" value={`${n2(lote.pesoKg)} kg`} strong />
                <Row label="Precio por kg" value={lote.precioPorKg ? `S/ ${n2(lote.precioPorKg)}` : "—"} />
                <Row label="Premio por kg" value={lote.premioPorKg ? `S/ ${n2(lote.premioPorKg)}` : "—"} hint="calidad / fino de aroma" />
                <div className="mt-1 flex items-center justify-between rounded-xl bg-[var(--data-success-50)] px-3 py-2.5">
                  <span className="font-bold text-[var(--data-success-900)]">Total pagado</span>
                  <span className="font-mono text-lg font-extrabold tabular-nums text-[var(--data-success-700)]">{lote.totalPagado ? `S/ ${n2(lote.totalPagado)}` : "—"}</span>
                </div>
              </Section>

              {/* Calidad */}
              <Section icon={Beaker} title="Calidad — prueba de corte (NTP-ISO 1114)">
                {hasCut ? (
                  <div className="space-y-2.5">
                    {cut.map((c) => <CutBar key={c.label} {...c} />)}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <MiniStat label="Índice ferm." value={lote.indiceFermentacion ? `${Number(lote.indiceFermentacion).toFixed(0)}%` : "—"} />
                      <MiniStat label="Humedad" value={pct(lote.humedadPct)} warn={lote.humedadPct != null && Number(lote.humedadPct) > 7} />
                      <MiniStat label="Granos eval." value={lote.cutGranos != null ? String(lote.cutGranos) : "—"} />
                    </div>
                  </div>
                ) : <p className="text-[var(--text-tertiary)]">Sin prueba de corte registrada. Humedad: {pct(lote.humedadPct)}.</p>}
                {(lote.granosPor100g != null || lote.pctCascara || lote.pctImpurezas) && (
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--rule-soft)] pt-2">
                    <MiniStat label="Granos/100g" value={lote.granosPor100g != null ? String(lote.granosPor100g) : "—"} />
                    <MiniStat label="Cáscara" value={pct(lote.pctCascara)} />
                    <MiniStat label="Impurezas" value={pct(lote.pctImpurezas)} />
                  </div>
                )}
              </Section>

              {/* Beneficio vinculado */}
              {beneficio ? (
                <Section icon={Droplets} title="Beneficio (fermentación + secado)">
                  <div className="mb-2"><span className="inline-flex rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold capitalize text-[var(--text-secondary)]">{beneficio.estado}</span></div>
                  <Row label="Fermentación" value={`${beneficio.fermDias ?? "—"} días · ${beneficio.fermVolteos ?? "—"} volteos${beneficio.tipoFermentador ? ` · ${beneficio.tipoFermentador}` : ""}`} />
                  {beneficio.fermTempMaxC && <Row label="Temp. máx." value={`${Number(beneficio.fermTempMaxC).toFixed(0)} °C`} />}
                  <Row label="Secado" value={`${beneficio.secDias ?? "—"} días${beneficio.metodoSecado ? ` · ${beneficio.metodoSecado}` : ""}`} />
                  <Row label="Humedad inicial → final" value={`${pct(beneficio.humedadInicial)} → ${pct(beneficio.humedadFinal)}`} />
                  <Row label="Peso húmedo → seco" value={`${n2(beneficio.pesoHumedoKg)} → ${n2(beneficio.pesoSecoKg)} kg`} strong />
                  {beneficio.mermaPct && (
                    <div className="mt-1 flex items-center justify-between rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
                      <span className="font-bold text-[var(--text-primary)]">Merma húmedo→seco</span>
                      <span className="font-mono font-extrabold tabular-nums text-[var(--text-primary)]">{pct(beneficio.mermaPct)}</span>
                    </div>
                  )}
                </Section>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] p-3 text-[var(--text-tertiary)]">
                  <FlaskConical className="h-4 w-4" /> Sin beneficio registrado para este lote.
                </div>
              )}

              {(lote.destino || lote.observaciones) && (
                <Section icon={Scale} title="Trazabilidad y notas">
                  {lote.destino && <Row label="Destino" value={lote.destino} />}
                  {lote.observaciones && <p className="text-[var(--text-secondary)]">{lote.observaciones}</p>}
                </Section>
              )}
            </>
          )}
        </div>

        {lote && !loading && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cerrar</button>
            <button type="button" onClick={() => printCacaoRecibo(lote, acopiador)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90"><Printer className="h-4 w-4" /> Recibo</button>
          </footer>
        )}
      </div>
    </AdminModal>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Leaf; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Icon className="h-4 w-4 text-[var(--accent)]" /> {title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[var(--text-tertiary)]">{label}{hint && <span className="ml-1 text-xs">· {hint}</span>}</span>
      <span className={`text-right font-mono tabular-nums ${strong ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{value}</span>
    </div>
  );
}
function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className={`font-mono text-base font-extrabold tabular-nums ${warn ? "text-[var(--data-warning-700)]" : "text-[var(--text-primary)]"}`}>{value}</div>
    </div>
  );
}
function CutBar({ label, sub, v, tone }: { label: string; sub: string; v: string | null; tone: "success" | "warning" | "danger" }) {
  const val = v == null || v === "" ? 0 : Number(v);
  const bar = tone === "success" ? "bg-[var(--data-success-500)]" : tone === "warning" ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-danger-500)]";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[var(--text-secondary)]">{label} <span className="text-xs text-[var(--text-tertiary)]">{sub}</span></span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v == null || v === "" ? "—" : `${val.toFixed(0)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(val, 100)}%` }} /></div>
    </div>
  );
}
function GradoBadge({ grado }: { grado: string | null }) {
  if (!grado) return <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-tertiary)]">sin clasificar</span>;
  const g = grado as CacaoGrado;
  const cls = g === "I" ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : g === "II" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" : "bg-[var(--data-danger-100)] text-[var(--data-danger-900)]";
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${cls}`}>{GRADO_LABEL[g] ?? grado}</span>;
}
