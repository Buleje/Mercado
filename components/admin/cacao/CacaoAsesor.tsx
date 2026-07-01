"use client";

/**
 * CacaoAsesor — asesor híbrido "¿cuándo vender / aguantar?" (ADR-128).
 * Señal determinística (núcleo confiable) + narrativa IA grounded + checklist.
 * Progressive: la señal viene del endpoint junto con la narrativa (cacheada).
 */
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, AlertCircle, TrendingUp, TrendingDown, Minus, Sparkles, Clock, MapPin, AlertTriangle, ShoppingCart, ListChecks, Coins, LineChart, Newspaper, Gauge, Calendar, Activity, Bell, Printer, MessageCircle, Download,
} from "@buleje/design-system/icons";
import { mesNombre, type AdvisorResult } from "@/lib/cacao/cacao-advisor";
import { printCacaoAsesor, asesorTexto } from "@/lib/cacao/cacao-asesor-informe";
import { downloadCacaoAsesorPDF } from "@/lib/cacao/cacao-asesor-pdf";
import { shareCacaoText } from "@/lib/cacao/cacao-print";

type Advisor = AdvisorResult;
interface Local { miPrecioKg: number | null; kg: number; lotes: number; refKg: number | null; spreadPct: number | null; stockKg: number }
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
  const [pdfBusy, setPdfBusy] = useState(false);

  async function descargarPDF() {
    if (!data?.advisor) return;
    setPdfBusy(true);
    try {
      await downloadCacaoAsesorPDF(data.advisor, data.local ?? null, data.narrative ?? null);
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  }

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
        <p className="text-sm text-[var(--text-tertiary)]">Analiza precio, tendencia, velocidad, indicadores técnicos (RSI, Bollinger, soporte/resistencia), estacionalidad, proyección y noticias para decir cuándo vender o aguantar. Se calcula todo; el resumen lo redacta la IA.</p>
        <div className="flex shrink-0 items-center gap-2">
          {a && (
            <>
              <button type="button" onClick={descargarPDF} disabled={pdfBusy} title="Descargar PDF" className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{pdfBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">PDF</span></button>
              <button type="button" onClick={() => printCacaoAsesor(a, data?.local ?? null, data?.narrative ?? null)} title="Informe imprimible" className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-4 w-4" /><span className="hidden sm:inline">Imprimir</span></button>
              <button type="button" onClick={() => shareCacaoText("Asesor de cacao", asesorTexto(a, data?.local ?? null))} title="Compartir por WhatsApp" className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--data-success-400)] px-3 text-sm font-bold text-[var(--data-success-700)] hover:bg-[var(--data-success-50)]"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Compartir</span></button>
            </>
          )}
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudo cargar el asesor:</strong> {error}</div></div>}
      {loading && !data && <div className="p-12 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Analizando el mercado…</p></div>}

      {a && (
        <>
          {/* Notificación: señal fuerte + stock disponible */}
          {a.fuerza === "fuerte" && a.signal !== "neutral" && (data?.local?.stockKg ?? 0) > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
              <div className="text-sm leading-relaxed text-[var(--text-primary)]">
                <b>Notificación:</b> señal {a.signal === "vender" ? "FUERTE de VENTA" : "FUERTE de AGUANTAR"} con{" "}
                <b>{data?.local?.stockKg} kg</b> en stock.{" "}
                {a.signal === "vender"
                  ? "Buena ventana para asegurar ganancia — considerá vender por partes."
                  : "Conviene esperar la recuperación; revisá el mercado esta semana."}
              </div>
            </div>
          )}

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
                {typeof a.confianza === "number" && (
                  <div className="mt-3 flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.accent }} />
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider" style={{ color: cfg.accent }}>Confianza {a.confianza}%</span>
                    <div className="h-2 max-w-[160px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }}>
                      <div className="h-full rounded-full" style={{ width: `${a.confianza}%`, background: cfg.ring }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dirección probable (score compuesto) */}
          {a.direccion && (
            <Card icon={Activity} title="Dirección probable del precio">
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs font-bold">
                  <span className="text-[var(--data-success-700)]">↑ Suba {a.direccion.probabilidadSuba}%</span>
                  <span className="uppercase tracking-wider text-[var(--text-tertiary)]">
                    {a.direccion.sesgo === "suba" ? "sesgo alcista" : a.direccion.sesgo === "baja" ? "sesgo bajista" : "lateral"}
                  </span>
                  <span className="text-[var(--data-error-700)]">Baja {100 - a.direccion.probabilidadSuba}% ↓</span>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div style={{ width: `${a.direccion.probabilidadSuba}%`, background: "var(--data-success-500)" }} />
                  <div style={{ width: `${100 - a.direccion.probabilidadSuba}%`, background: "var(--data-error-400)" }} />
                </div>
              </div>
              <div className="space-y-1">
                {a.direccion.factores.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-2">
                      <VoteBadge voto={f.voto} />
                      <span className="font-bold text-[var(--text-primary)]">{f.nombre}</span>
                    </span>
                    <span className="text-right text-[var(--text-tertiary)]">{f.detalle}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Consenso ponderado de {a.direccion.factores.length} factores técnicos y fundamentales. No es garantía — es la probabilidad que sugieren los datos.
              </p>
            </Card>
          )}

          {/* Narrativa IA */}
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--accent)]"><Sparkles className="h-4 w-4" /> Lectura de la IA</h3>
            {data?.narrative ? (
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{data.narrative}</p>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">{loading ? "Redactando…" : "La IA no está disponible ahora — la señal y el checklist de abajo siguen siendo válidos (se calculan, no dependen de la IA)."}</p>
            )}
          </div>

          {/* Métricas — perspectiva de velocidad y ventana temporal */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricChip label="En rango 52 sem" value={a.metrics.pos52 != null ? `${a.metrics.pos52}%` : "—"} />
            <MetricChip label="Semana" value={a.metrics.trend7 != null ? `${a.metrics.trend7 > 0 ? "+" : ""}${a.metrics.trend7}%` : "—"} Icon={trendIcon(a.metrics.trend7)} tone={a.metrics.trend7} />
            <MetricChip label="Mes" value={a.metrics.trend30 != null ? `${a.metrics.trend30 > 0 ? "+" : ""}${a.metrics.trend30}%` : "—"} Icon={trendIcon(a.metrics.trend30)} tone={a.metrics.trend30} />
            <MetricChip label="3 meses" value={a.metrics.trend90 != null ? `${a.metrics.trend90 > 0 ? "+" : ""}${a.metrics.trend90}%` : "—"} Icon={trendIcon(a.metrics.trend90)} tone={a.metrics.trend90} />
            <MetricChip label="Velocidad" value={a.metrics.velocidadDia != null ? `${a.metrics.velocidadDia > 0 ? "+" : ""}${a.metrics.velocidadDia}%/d` : "—"} Icon={trendIcon(a.metrics.velocidadDia)} tone={a.metrics.velocidadDia} />
            <MetricChip label="Volatilidad" value={a.metrics.volatilidad != null ? `${a.metrics.volatilidad}%` : "—"} />
          </div>

          {/* Indicadores técnicos */}
          <Card icon={Activity} title="Indicadores técnicos">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <MetricChip label="RSI (14)" value={a.tecnico.rsi != null ? String(a.tecnico.rsi) : "—"} tone={a.tecnico.rsi == null ? null : a.tecnico.rsi >= 70 ? -1 : a.tecnico.rsi <= 30 ? 1 : 0} />
              <MetricChip label="Bollinger %B" value={a.tecnico.bollingerPctB != null ? `${a.tecnico.bollingerPctB}%` : "—"} />
              <MetricChip label="Soporte" value={a.tecnico.soporte != null ? a.tecnico.soporte.toLocaleString("es-PE") : "—"} />
              <MetricChip label="Resistencia" value={a.tecnico.resistencia != null ? a.tecnico.resistencia.toLocaleString("es-PE") : "—"} />
              <MetricChip label="Drawdown 52s" value={a.tecnico.drawdownPct != null ? `${a.tecnico.drawdownPct}%` : "—"} tone={a.tecnico.drawdownPct} />
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
              {a.tecnico.rsiZona && a.tecnico.rsiZona !== "neutral" && (
                <Reading>
                  <b>RSI {a.tecnico.rsi}</b>: {a.tecnico.rsiZona === "sobrecompra" ? "sobrecompra — subió rápido, puede corregir (favorece asegurar/vender)." : "sobreventa — cayó fuerte, suele rebotar (favorece aguantar/acopiar)."}
                </Reading>
              )}
              {a.tecnico.soporte != null && a.tecnico.resistencia != null && (
                <Reading>Vendé cerca del techo (<b>USD {a.tecnico.resistencia.toLocaleString("es-PE")}</b>) y acopiá cerca del piso (<b>USD {a.tecnico.soporte.toLocaleString("es-PE")}</b>).</Reading>
              )}
              {a.tecnico.trendR2 != null && (
                <Reading>Tendencia {a.tecnico.trendR2 >= 0.6 ? "limpia y sostenida" : "ruidosa / poco definida"} (R² {a.tecnico.trendR2}).</Reading>
              )}
              {a.tecnico.drawdownPct != null && (
                <Reading>Está a <b>{Math.abs(a.tecnico.drawdownPct)}%</b> de su máximo de 52 semanas.</Reading>
              )}
              {a.tecnico.macdHist != null && (
                <Reading><b>MACD</b>: histograma {a.tecnico.macdHist > 0 ? "positivo (momentum alcista)" : "negativo (momentum bajista)"}{a.tecnico.macdCruce ? ` · cruce ${a.tecnico.macdCruce} reciente` : ""}.</Reading>
              )}
              {a.tecnico.emaCruce && (
                <Reading>Cruce de medias: <b>{a.tecnico.emaCruce === "golden" ? "golden cross (alcista)" : "death cross (bajista)"}</b> (EMA 12 vs 26).</Reading>
              )}
              {a.tecnico.divergencia && (
                <Reading>Divergencia <b>{a.tecnico.divergencia}</b>: {a.tecnico.divergencia === "bajista" ? "el precio sube pero el impulso se debilita — puede girar a la baja." : "el precio baja pero el impulso mejora — posible piso."}</Reading>
              )}
            </ul>
          </Card>

          {/* Estacionalidad */}
          {a.estacionalidad && a.estacionalidad.desviacionPct != null && (
            <Card icon={Calendar} title="Estacionalidad (últimos 12 meses)">
              <p className="text-sm text-[var(--text-secondary)]">
                En <b className="text-[var(--text-primary)]">{mesNombre(a.estacionalidad.mesActual)}</b>, el cacao suele estar{" "}
                <b style={{ color: a.estacionalidad.desviacionPct >= 0 ? "var(--data-success-700)" : "var(--data-error-700)" }}>
                  {a.estacionalidad.desviacionPct > 0 ? "+" : ""}{a.estacionalidad.desviacionPct}%
                </b>{" "}
                {a.estacionalidad.desviacionPct >= 0 ? "sobre" : "bajo"} el promedio del año.
              </p>
              <div className="mt-3 flex items-end gap-1">
                {a.estacionalidad.porMes.map((m) => (
                  <div key={m.mes} className="flex flex-1 flex-col items-center gap-1" title={`${mesNombre(m.mes)}: ${m.idxPct > 0 ? "+" : ""}${m.idxPct}%`}>
                    <div className="w-full rounded-t" style={{ height: `${Math.min(44, Math.abs(m.idxPct) * 3 + 4)}px`, background: m.idxPct >= 0 ? "var(--data-success-400)" : "var(--data-error-400)", opacity: m.mes === a.estacionalidad!.mesActual ? 1 : 0.45 }} />
                    <span className="text-[length:var(--ts-2xs)] uppercase text-[var(--text-tertiary)]">{mesNombre(m.mes).slice(0, 1)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Mes más caro: <b>{mesNombre(a.estacionalidad.mejorMes)}</b> · más barato: <b>{mesNombre(a.estacionalidad.peorMes)}</b>. Basado en los últimos 12 meses (no es climatología multi-año).
              </p>
            </Card>
          )}

          {/* Proyección + Señal de noticias */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {a.forecast && a.forecast.length > 0 && (
              <Card icon={LineChart} title="Proyección (si sigue la tendencia)">
                <div className="space-y-2.5">
                  {a.forecast.map((f) => (
                    <div key={f.dias} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">En {f.dias} días</span>
                      <span className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">USD {f.mid.toLocaleString("es-PE")}</span>
                      <span className={`text-sm font-bold ${f.pct > 0 ? "text-[var(--data-success-700)]" : f.pct < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-tertiary)]"}`}>{f.pct > 0 ? "+" : ""}{f.pct}%</span>
                      <span className="ml-auto text-xs text-[var(--text-tertiary)]">rango {f.low.toLocaleString("es-PE")}–{f.high.toLocaleString("es-PE")}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">Extrapolación lineal de la tendencia reciente con banda por volatilidad. NO es una predicción garantizada — el mercado real puede moverse distinto.</p>
              </Card>
            )}
            {a.news && (
              <Card icon={Newspaper} title="Señal de las noticias">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                    a.news.senal === "alcista" ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
                      : a.news.senal === "bajista" ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                    {a.news.senal === "alcista" ? <TrendingUp className="h-4 w-4" /> : a.news.senal === "bajista" ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    Sesgo {a.news.senal}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">{a.news.alcista} alcistas · {a.news.bajista} bajistas · {a.news.total} titulares</span>
                </div>
                {a.news.destacados.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {a.news.destacados.map((t, i) => (
                      <li key={i} className="flex gap-2 text-xs text-[var(--text-secondary)]"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />{t}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sesgo estimado por palabras clave de los titulares (escasez/sequía = alcista, sobreoferta/cosecha = bajista).</p>
              </Card>
            )}
          </div>

          {/* Tu precio vs mercado */}
          {data?.local && (
            <Card
              icon={Coins}
              title={`Tu precio de compra vs. el mercado${data.local.stockKg > 0 ? ` · ${data.local.stockKg} kg en stock` : ""}`}
            >
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
function VoteBadge({ voto }: { voto: "suba" | "baja" | "neutral" }) {
  const meta =
    voto === "suba"
      ? { Icon: TrendingUp, cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" }
      : voto === "baja"
        ? { Icon: TrendingDown, cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" }
        : { Icon: Minus, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
      <meta.Icon className="h-3 w-3" />
    </span>
  );
}
function Reading({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
      <span>{children}</span>
    </li>
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
