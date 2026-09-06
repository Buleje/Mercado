"use client";

/**
 * CacaoTablaConversion — "Tabla de conversión del cacao" (brief Brandon 2026-07-14).
 * Día a día: ICE USD/t × tipo de cambio DEL DÍA → S//kg oficial → ×88% = precio
 * de compra equivalente acá (single source CHACRA_CC_COMPRA_OFICIAL_FACTOR).
 * La variación % se mide contra una fila BASE que se fija tocando la fila
 * (default: el día hábil anterior al último). Filtros: presets de período,
 * rango de fechas custom y agrupación día/semana.
 */
import { useMemo, useState } from "react";
import { Table } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR, COMPRA_LOCAL_PCT, ANCLA_CC_LABEL } from "@/lib/cacao/cacao-precio-regional";
import CacaoChartPresent from "./CacaoChartPresent";

interface PricePoint { t: number; c: number }
interface Row { key: string; label: string; t: number; usd: number; fx: number; solKg: number; compraKg: number }

const PRESETS = [
  { key: "1S", days: 7 }, { key: "2S", days: 14 }, { key: "1M", days: 30 }, { key: "3M", days: 90 }, { key: "1A", days: 9999 },
] as const;
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY_MS = 86_400_000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
const dayLabel = (t: number) => {
  const d = new Date(t);
  return `${cap(DIAS[d.getUTCDay()])}. ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}.`;
};
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function CacaoTablaConversion({
  series,
  fxSeries = [],
  usdPen = null,
  onPresent,
}: {
  series: PricePoint[];
  /** Serie diaria USD/PEN — FX real de cada día. Si falta un día, usa el último FX previo. */
  fxSeries?: PricePoint[];
  usdPen?: number | null;
  /** Abre la vista completa (modal de presentación del padre). Sin él no hay botón. */
  onPresent?: () => void;
}) {
  const [preset, setPreset] = useState<string>("1S");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [gran, setGran] = useState<"dia" | "semana">("dia");
  const [baseKey, setBaseKey] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!series.length) return [];
    // FX del día con merge de dos punteros (ambas series vienen ordenadas asc):
    // para cada día del cacao, el último FX conocido hasta ese día.
    const daily: Row[] = [];
    let fi = 0, lastFx = usdPen ?? null;
    // rango: custom (si hay alguna fecha) pisa al preset.
    const lastT = series[series.length - 1].t;
    const custom = desde !== "" || hasta !== "";
    const days = PRESETS.find((p) => p.key === preset)?.days ?? 7;
    const lo = custom ? (desde ? Date.parse(`${desde}T00:00:00Z`) : -Infinity) : lastT - (days - 1) * DAY_MS;
    const hi = custom && hasta ? Date.parse(`${hasta}T23:59:59Z`) : Infinity;
    for (const p of series) {
      while (fi < fxSeries.length && fxSeries[fi].t <= p.t + DAY_MS / 2) { lastFx = fxSeries[fi].c; fi++; }
      if (p.t < lo || p.t > hi || lastFx == null) continue;
      const solKg = (p.c / 1000) * lastFx;
      daily.push({
        key: isoDay(p.t), label: dayLabel(p.t), t: p.t, usd: p.c, fx: lastFx,
        solKg, compraKg: solKg * CHACRA_CC_COMPRA_OFICIAL_FACTOR,
      });
    }
    if (gran === "dia") return daily;
    // Semanas: promedio de USD y FX por semana ISO (lunes como inicio).
    const byWeek = new Map<string, { pts: Row[] }>();
    for (const r of daily) {
      const d = new Date(r.t);
      const monday = r.t - ((d.getUTCDay() + 6) % 7) * DAY_MS;
      const k = isoDay(monday);
      (byWeek.get(k) ?? byWeek.set(k, { pts: [] }).get(k)!).pts.push(r);
    }
    return Array.from(byWeek.entries()).map(([k, { pts }]) => {
      const usd = pts.reduce((a, b) => a + b.usd, 0) / pts.length;
      const fx = pts.reduce((a, b) => a + b.fx, 0) / pts.length;
      const solKg = (usd / 1000) * fx;
      const d1 = new Date(pts[0].t), d2 = new Date(pts[pts.length - 1].t);
      const label = `Sem. ${d1.getUTCDate()}${d1.getUTCMonth() !== d2.getUTCMonth() ? ` ${MESES[d1.getUTCMonth()]}.` : ""}–${d2.getUTCDate()} ${MESES[d2.getUTCMonth()]}.`;
      return { key: k, label, t: pts[0].t, usd, fx, solKg, compraKg: solKg * CHACRA_CC_COMPRA_OFICIAL_FACTOR };
    });
  }, [series, fxSeries, usdPen, preset, desde, hasta, gran]);

  // Base efectiva: la fijada por click si sigue visible; si no, la penúltima fila
  // (con la última = "hoy", la penúltima es el día hábil anterior — como la imagen).
  const effBaseKey = baseKey && rows.some((r) => r.key === baseKey)
    ? baseKey
    : rows.length > 1 ? rows[rows.length - 2].key : rows[0]?.key ?? null;
  const base = rows.find((r) => r.key === effBaseKey) ?? null;
  const picoKey = rows.length ? rows.reduce((a, b) => (b.solKg > a.solKg ? b : a)).key : null;
  const lastKey = rows.length ? rows[rows.length - 1].key : null;
  const esHoy = (t: number) => isoDay(t) === isoDay(series[series.length - 1]?.t ?? 0);

  const limites = series.length ? { min: isoDay(series[0].t), max: isoDay(series[series.length - 1].t) } : null;
  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-bold transition ${active ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`;

  return (
    <div className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Table className="h-4 w-4 text-[var(--accent)]" />
            Tabla de conversión del cacao
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Equivalente de compra local ({COMPRA_LOCAL_PCT}% del oficial, calibrado con {ANCLA_CC_LABEL}) según la variación internacional. Tocá una fila para fijarla como base.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => { setPreset(p.key); setDesde(""); setHasta(""); }} className={pill(!(desde || hasta) && preset === p.key)}>{p.key}</button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1">
            <input type="date" value={desde} min={limites?.min} max={hasta || limites?.max} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" className="bg-transparent text-xs font-bold text-[var(--text-secondary)] outline-none" />
            <span className="text-xs text-[var(--text-tertiary)]">→</span>
            <input type="date" value={hasta} min={desde || limites?.min} max={limites?.max} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" className="bg-transparent text-xs font-bold text-[var(--text-secondary)] outline-none" />
          </div>
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            <button type="button" onClick={() => setGran("dia")} className={pill(gran === "dia")}>Días</button>
            <button type="button" onClick={() => setGran("semana")} className={pill(gran === "semana")}>Semanas</button>
          </div>
          {onPresent && <CacaoChartPresent title="Tabla de conversión del cacao" onClick={onPresent} />}
        </div>
      </div>

      {!rows.length || !base ? (
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Sin datos de precio o tipo de cambio para este rango.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <DataTable className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--accent)] text-left text-white">
                <Th>Fecha</Th>
                <Th className="text-right">Cacao internacional</Th>
                <Th className="text-right">Tipo de cambio</Th>
                <Th className="text-right">Conversión internacional</Th>
                <Th className="text-right">Variación vs. {base.label.toLowerCase().replace(/\.$/, "")}</Th>
                <Th className="text-right">Precio de compra equivalente aquí</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const esBase = r.key === effBaseKey;
                const esUlt = r.key === lastKey;
                const varPct = ((r.solKg - base.solKg) / base.solKg) * 100;
                const tag = [r.key === picoKey ? "pico" : null, esBase ? "base" : null, esUlt ? (esHoy(r.t) && gran === "dia" ? "hoy" : "último") : null].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={r.key}
                    onClick={() => setBaseKey(r.key)}
                    title="Fijar esta fila como base de comparación"
                    className={`cursor-pointer border-t border-[var(--rule-soft)] transition-colors ${esUlt ? "bg-[var(--data-success-100)]/50" : esBase ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}`}
                  >
                    <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">
                      {r.label}
                      {tag && <span className="ml-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide text-[var(--accent)]">— {tag}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">US$ {fmt0(r.usd)}/t</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.fx.toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">S/ {r.solKg.toFixed(2)}/kg</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold tabular-nums ${esBase ? "text-[var(--text-secondary)]" : varPct > 0 ? "text-[var(--data-success-700)]" : varPct < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>
                      {esBase ? "0%" : `${varPct > 0 ? "+" : ""}${varPct.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-base font-extrabold tabular-nums text-[var(--data-success-700)]">S/ {r.compraKg.toFixed(2)}/kg</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      )}
      <p className="mt-2.5 text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
        Fuente: ICE cocoa + USD/PEN (Yahoo Finance), tipo de cambio real de cada día. Equivalente local = conversión × {COMPRA_LOCAL_PCT}% (calibrado con el precio real {ANCLA_CC_LABEL}). Estimado — el precio final depende de humedad, calidad y comprador.
      </p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wide ${className}`}>{children}</th>;
}
