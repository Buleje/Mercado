"use client";

/**
 * CacaoAsesor — asesor híbrido "¿cuándo vender / aguantar?" (ADR-128).
 * Señal determinística (núcleo confiable) + narrativa IA grounded + checklist.
 * Progressive: la señal viene del endpoint junto con la narrativa (cacheada).
 */
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, AlertCircle, TrendingUp, TrendingDown, Minus, Sparkles, Clock, MapPin, AlertTriangle, ShoppingCart, ListChecks, Coins,
} from "@buleje/design-system/icons";

interface Donde { canal: string; nota: string }
interface Advisor {
  signal: "vender" | "aguantar" | "neutral"; fuerza: "fuerte" | "moderada" | "leve";
  titulo: string; resumen: string; motivos: string[]; cuando: string; donde: Donde[]; riesgos: string[]; compra: string;
  metrics: { pos52: number | null; trend30: number | null; trend7: number | null; volatilidad: number | null };
}
interface Local { miPrecioKg: number | null; kg: number; lotes: number; refKg: number | null; spreadPct: number | null }
interface Resp { advisor: Advisor | null; narrative: string | null; local?: Local; generatedAt?: string }

const SIGNAL = {
  vender: { label: "VENDER", Icon: TrendingUp, ring: "var(--data-success-500)", soft: "var(--data-success-50)", text: "var(--data-success-900)", accent: "var(--data-success-700)" },
  aguantar: { label: "AGUANTAR", Icon: Clock, ring: "var(--data-warning-500)", soft: "var(--data-warning-50)", text: "var(--data-warning-900)", accent: "var(--data-warning-700)" },
  neutral: { label: "NEUTRAL", Icon: Minus, ring: "var(--rule-strong)", soft: "var(--surface-sunken)", text: "var(--text-primary)", accent: "var(--text-secondary)" },
} as const;

export default function CacaoAsesor() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/advisor", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const a = data?.advisor;
  const cfg = a ? SIGNAL[a.signal] : SIGNAL.neutral;
  const trendIcon = (v: number | null) => (v == null ? Minus : v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">Recomendación basada en el precio internacional real, su tendencia y las noticias. La señal se calcula; el resumen lo redacta la IA.</p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudo cargar el asesor:</strong> {error}</div></div>}
      {loading && !data && <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Analizando el mercado…</p></div>}

      {a && (
        <>
          {/* Señal grande */}
          <div className="overflow-hidden rounded-2xl border-2" style={{ borderColor: cfg.ring, background: cfg.soft }}>
            <div className="flex items-start gap-4 p-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--surface-raised)", color: cfg.accent, boxShadow: `inset 0 0 0 2px ${cfg.ring}` }}>
                <cfg.Icon className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest" style={{ color: cfg.accent }}>Recomendación</span>
                  <span className="rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider" style={{ background: cfg.ring, color: "white" }}>señal {a.fuerza}</span>
                </div>
                <h2 className="mt-0.5 text-xl font-extrabold" style={{ color: cfg.text }}>{a.titulo}</h2>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: cfg.text }}>{a.resumen}</p>
              </div>
            </div>
          </div>

          {/* Narrativa IA */}
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--accent)]"><Sparkles className="h-4 w-4" /> Lectura de la IA</h3>
            {data?.narrative ? (
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{data.narrative}</p>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">{loading ? "Redactando…" : "La IA no está disponible ahora — la señal y el checklist de abajo siguen siendo válidos (se calculan, no dependen de la IA)."}</p>
            )}
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricChip label="En rango 52 sem" value={a.metrics.pos52 != null ? `${a.metrics.pos52}%` : "—"} />
            <MetricChip label="Tendencia mes" value={a.metrics.trend30 != null ? `${a.metrics.trend30 > 0 ? "+" : ""}${a.metrics.trend30}%` : "—"} Icon={trendIcon(a.metrics.trend30)} tone={a.metrics.trend30} />
            <MetricChip label="Tendencia semana" value={a.metrics.trend7 != null ? `${a.metrics.trend7 > 0 ? "+" : ""}${a.metrics.trend7}%` : "—"} Icon={trendIcon(a.metrics.trend7)} tone={a.metrics.trend7} />
            <MetricChip label="Volatilidad" value={a.metrics.volatilidad != null ? `${a.metrics.volatilidad}%` : "—"} />
          </div>

          {/* Tu precio vs mercado */}
          {data?.local && (
            <Card icon={Coins} title="Tu precio de compra vs. el mercado">
              {data.local.miPrecioKg != null && data.local.refKg != null ? (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="rounded-xl bg-[var(--surface-sunken)] px-4 py-2.5 text-center">
                    <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Tu compra (prom.)</div>
                    <div className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">S/ {data.local.miPrecioKg.toFixed(2)}<span className="text-sm font-normal text-[var(--text-tertiary)]">/kg</span></div>
                  </div>
                  <Minus className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <div className="rounded-xl bg-[var(--surface-sunken)] px-4 py-2.5 text-center">
                    <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Internacional</div>
                    <div className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">S/ {data.local.refKg.toFixed(2)}<span className="text-sm font-normal text-[var(--text-tertiary)]">/kg</span></div>
                  </div>
                  {data.local.spreadPct != null && (
                    <div className="flex-1 min-w-[180px]">
                      {(() => { const s = data.local.spreadPct; const below = s < 0;
                        return <p className="text-sm leading-relaxed" style={{ color: below ? "var(--data-success-700)" : "var(--data-warning-700)" }}>
                          <b>{below ? "Comprás" : "Comprás"} {Math.abs(s).toFixed(1)}% {below ? "por DEBAJO" : "por ENCIMA"}</b> del referencial internacional.{" "}
                          <span className="text-[var(--text-secondary)]">{below ? "Buen margen — el spread cubre tu beneficio/secado y ganancia." : "Cuidá tu margen: estás pagando caro vs. el precio de venta de referencia."}</span>
                        </p>;
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">Aún no registraste lotes de cacao <b>seco</b> con precio para comparar. Registrá tus compras y acá verás si comprás por debajo o por encima del mercado internacional.</p>
              )}
            </Card>
          )}

          {/* Motivos + Cuándo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card icon={ListChecks} title="Por qué">
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">{a.motivos.map((m, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{m}</li>)}</ul>
            </Card>
            <Card icon={Clock} title="¿Cuándo?">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{a.cuando}</p>
            </Card>
          </div>

          {/* Dónde vender */}
          <Card icon={MapPin} title="¿Dónde vender?">
            <ul className="space-y-2">
              {a.donde.map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
                  <span className="font-bold text-[var(--text-primary)]">{d.canal}</span>
                  <span className="text-right text-[var(--text-tertiary)]">{d.nota}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Riesgos + Compra */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card icon={AlertTriangle} title="Riesgos a tener en cuenta">
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">{a.riesgos.map((r, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-warning-500)]" />{r}</li>)}</ul>
            </Card>
            <Card icon={ShoppingCart} title="Para acopiar (comprar)">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{a.compra}</p>
            </Card>
          </div>

          <p className="text-center text-xs text-[var(--text-tertiary)]">Orientativo — no es asesoría financiera. Decidí según tu necesidad de caja, calidad de tu lote y compromisos de venta.</p>
        </>
      )}
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Icon className="h-4 w-4 text-[var(--accent)]" /> {title}</h3>
      {children}
    </div>
  );
}
function MetricChip({ label, value, Icon, tone }: { label: string; value: string; Icon?: typeof Minus; tone?: number | null }) {
  const color = tone == null ? "var(--text-primary)" : tone > 0 ? "var(--data-success-700)" : tone < 0 ? "var(--data-error-700)" : "var(--text-primary)";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 px-3 py-2.5 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-base font-extrabold tabular-nums" style={{ color }}>
        {Icon && <Icon className="h-3.5 w-3.5" />}{value}
      </div>
    </div>
  );
}
