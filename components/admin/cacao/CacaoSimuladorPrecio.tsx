"use client";

/**
 * CacaoSimuladorPrecio — "qué pasa si el ICE sube/baja X%" (ADR-128, vista Mercado).
 * 100% derivado: no hace fetch del precio (lo recibe del padre, que ya lo tiene
 * cargado) — sólo re-escala linealmente igual que hace cacao-precio-regional.
 * El impacto en margen es OPCIONAL: se auto-fetchea de campoAnalytics (mismo dato
 * que "Análisis de campo") y sólo aparece si hay ingresos ya valorizados que
 * re-escalar — sin eso, el simulador igual funciona mostrando sólo el precio.
 */
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, TrendingUp, TrendingDown, Minus, Info } from "@buleje/design-system/icons";
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR, COMPRA_LOCAL_PCT } from "@/lib/cacao/cacao-precio-regional";

const PRESETS = [-10, -5, 5, 10];
const MIN_PCT = -50, MAX_PCT = 50;
const sol = (v: number | null, d = 2) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const usdFmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const clampPct = (n: number) => Math.max(MIN_PCT, Math.min(MAX_PCT, n));

interface CampoTotales { ingresos: number; costos: number; margen: number }

export default function CacaoSimuladorPrecio({
  iceUsdHoy,
  oficialSolKgHoy,
}: {
  /** Precio ICE de HOY, USD/tonelada (mismo `p.value` del hero de arriba). */
  iceUsdHoy: number | null;
  /** Referencia oficial de HOY en S//kg seco, antes del factor de chacra (mismo `data.pricePenPerKg`). */
  oficialSolKgHoy: number | null;
}) {
  const [pct, setPct] = useState(0);
  const [campo, setCampo] = useState<CampoTotales | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/cacao/campo?view=analytics", { credentials: "include" });
        if (!r.ok) return; // spec sin habilitar u otro motivo: el simulador sigue sin margen
        const j = await r.json();
        if (alive && j?.totales) setCampo(j.totales);
      } catch { /* margen es opcional */ }
    })();
    return () => { alive = false; };
  }, []);

  const escenario = useMemo(() => {
    if (iceUsdHoy == null || oficialSolKgHoy == null) return null;
    const factor = 1 + pct / 100;
    const iceNuevo = iceUsdHoy * factor;
    const oficialNuevo = oficialSolKgHoy * factor;
    const chacraHoy = oficialSolKgHoy * CHACRA_CC_COMPRA_OFICIAL_FACTOR;
    const chacraNuevo = oficialNuevo * CHACRA_CC_COMPRA_OFICIAL_FACTOR;
    const diffSol = chacraNuevo - chacraHoy;
    const showMargen = campo != null && campo.ingresos > 0;
    const ingresosNuevos = showMargen ? campo!.ingresos * factor : null;
    const margenNuevo = showMargen ? ingresosNuevos! - campo!.costos : null;
    const diffMargen = showMargen ? margenNuevo! - campo!.margen : null;
    return { iceNuevo, chacraHoy, chacraNuevo, diffSol, showMargen, ingresosNuevos, margenNuevo, diffMargen };
  }, [iceUsdHoy, oficialSolKgHoy, pct, campo]);

  const up = pct > 0, down = pct < 0;

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Simulador de escenarios</h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning-700)]">
          Simulación
        </span>
      </div>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        Movés el % y ves de una qué pasaría con tu precio de compra{escenario?.showMargen ? " y tu margen" : ""} si el ICE cambiara desde hoy — antes de que pase.
      </p>

      {iceUsdHoy == null || oficialSolKgHoy == null ? (
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Esperando el precio internacional de hoy para simular…</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPct(preset)}
                className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold transition ${pct === preset ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
              >
                {preset > 0 ? "+" : ""}{preset}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPct(0)}
              className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold transition ${pct === 0 ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
            >
              Hoy (0%)
            </button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <input
              type="range"
              min={MIN_PCT}
              max={MAX_PCT}
              step={1}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--surface-sunken)] accent-[var(--accent)]"
              aria-label="Porcentaje de cambio hipotético sobre el precio ICE de hoy"
            />
            <div className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                min={MIN_PCT}
                max={MAX_PCT}
                step={1}
                value={pct}
                onChange={(e) => setPct(clampPct(Number(e.target.value) || 0))}
                aria-label="Porcentaje libre"
                className="h-9 w-16 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-center font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]"
              />
              <span className="text-sm font-bold text-[var(--text-tertiary)]">%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 sm:grid-cols-4">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">ICE hipotético</p>
              <p className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">USD {usdFmt(escenario?.iceNuevo ?? null)}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Compra local</p>
              <p className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-[var(--accent)]">S/ {sol(escenario?.chacraNuevo ?? null)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Diferencia vs hoy</p>
              <p className={`mt-0.5 inline-flex items-center gap-1 font-mono text-lg font-extrabold tabular-nums ${up ? "text-[var(--data-success-600)]" : down ? "text-[var(--data-error-600)]" : "text-[var(--text-primary)]"}`}>
                {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                {escenario ? `${escenario.diffSol >= 0 ? "+" : "-"}S/ ${sol(Math.abs(escenario.diffSol))} (${pct >= 0 ? "+" : ""}${pct}%)` : "—"}
              </p>
            </div>
          </div>

          {escenario?.showMargen && (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[var(--rule-soft)] p-3 sm:grid-cols-3">
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Margen actual del campo</p>
                <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">S/ {sol(campo!.margen)}</p>
              </div>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Margen hipotético</p>
                <p className={`mt-0.5 font-mono text-sm font-extrabold tabular-nums ${(escenario.margenNuevo ?? 0) >= 0 ? "text-[var(--data-success-600)]" : "text-[var(--data-error-600)]"}`}>S/ {sol(escenario.margenNuevo)}</p>
              </div>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Diferencia</p>
                <p className={`mt-0.5 font-mono text-sm font-extrabold tabular-nums ${(escenario.diffMargen ?? 0) >= 0 ? "text-[var(--data-success-600)]" : "text-[var(--data-error-600)]"}`}>
                  {(escenario.diffMargen ?? 0) >= 0 ? "+" : "-"}S/ {sol(Math.abs(escenario.diffMargen ?? 0))}
                </p>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Escenario hipotético, no una predicción: proyecta el precio de hoy (oficial S/ {sol(oficialSolKgHoy)}/kg, {COMPRA_LOCAL_PCT}% en chacra) con el % que elijas.
              {escenario?.showMargen ? " El margen re-escala los ingresos ya cosechados y valorizados sobre el mismo volumen del campo, sin tocar tus costos." : " Cargá cosechas valorizadas en Campo para ver también el impacto en tu margen."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
