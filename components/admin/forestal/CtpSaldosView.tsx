"use client";

/**
 * CtpSaldosView — balance de planta del Libro CTP (ADR-127): materia prima
 * (m³) y stock de productos transformados. Hermana de CtpEntriesView
 * (Producción/Despacho), que vive en su propio archivo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, AlertCircle, Boxes, Scale, PackageCheck, Layers, Clock, TreePine,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpKardexModal from "./CtpKardexModal";
import CtpPatioAging from "./CtpPatioAging";
import { Th, Td, n2 } from "./ctp-section-shared";

interface SpeciesBalance {
  especie: string; scientific: string | null; cites: boolean;
  ingresoM3: number; pendienteM3: number; consumidoM3: number; saldoM3: number; ingresosCount: number;
}
interface SaldosData {
  materiaPrima: {
    ingresoM3: number; ingresosCount: number; consumidoM3: number; saldoM3: number;
    pendienteM3: number; especiesEnNegativo: number;
  };
  porEspecie: SpeciesBalance[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}

interface ConcilMP { especie: string; cites: boolean; apertura: number; ingreso: number; consumido: number; final: number; negativa: boolean }
interface Concil { fuenteApertura: "cierre" | "calculada" | "sin_apertura"; aperturaLabel: string | null; materiaPrima: ConcilMP[]; productos: { producto: string; apertura: number; producido: number; despachado: number; final: number; negativo: boolean }[] }

export function CtpSaldosView({ period }: { period: CtpPeriod }) {
  const [data, setData] = useState<SaldosData | null>(null);
  const [concil, setConcil] = useState<Concil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kardexEspecie, setKardexEspecie] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setData((await r.json()).saldos);
      // Conciliación (apertura + movimientos = final) — solo si el período tiene inicio.
      if (period.from) {
        const cp = applyCtpPeriodParams(new URLSearchParams({ conciliacion: "1" }), period);
        const cr = await fetch(`/api/admin/forestal/ctp?${cp}`, { credentials: "include" });
        setConcil(cr.ok ? (await cr.json()).conciliacion : null);
      } else { setConcil(null); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const mp = data?.materiaPrima;

  // Balance por especie, dibujado: lo que entró (validado) vs. lo que se consumió
  // en producción. Barras a la par = especie agotada; ingreso > consumo = stock en
  // patio. Es el balance que se fiscaliza, de un vistazo (el detalle en la tabla).
  const balanceChart = useMemo(
    () => (data?.porEspecie ?? []).map((s) => ({
      especie: s.especie.length > 14 ? s.especie.slice(0, 13) + "…" : s.especie,
      Ingreso: s.ingresoM3,
      Consumido: s.consumidoM3,
    })),
    [data],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]"><strong className="text-[var(--text-secondary)]">Existencias del Libro (LO-CTP)</strong> en {period.label}: materia prima que entra vs. producto que sale. Es el saldo que se declara ante SERFOR — va en la hoja «Existencias» del export oficial.</p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {data && mp && (
        <>
          {/* La alerta que importa: el balance global puede tapar una especie en rojo. */}
          {mp.especiesEnNegativo > 0 && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <strong>{mp.especiesEnNegativo} {mp.especiesEnNegativo === 1 ? "especie tiene" : "especies tienen"} saldo negativo.</strong>{" "}
                Se transformó más volumen del que ingresó validado. Revisá los ingresos sin validar o las cantidades cargadas en Producción.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ingresado (validado)" value={`${n2(mp.ingresoM3)} m³`} subValue={`${mp.ingresosCount} ingresos`} icon={Layers} emphasis="neutral" />
            <StatCard label="Consumido en producción" value={`${n2(mp.consumidoM3)} m³`} icon={Boxes} emphasis="neutral" />
            <StatCard label="Saldo de materia prima" value={`${n2(mp.saldoM3)} m³`} subValue={mp.saldoM3 < 0 ? "sobreconsumo" : "disponible"} icon={Scale} emphasis={mp.saldoM3 < 0 ? "error" : "success"} />
            <StatCard label="Pendiente de validar" value={`${n2(mp.pendienteM3)} m³`} subValue="no computa como saldo" icon={Clock} emphasis={mp.pendienteM3 > 0 ? "warning" : "neutral"} />
          </div>

          {/* Balance por especie, dibujado: entra (validado) vs. sale (consumido). */}
          {balanceChart.length > 0 && (
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Materia prima por especie · entra vs. consumido (m³)</CardTitle>
              <p className="mb-2 text-xs text-[var(--text-tertiary)]">Barras a la par = especie agotada en producción; ingreso por encima del consumo = stock en patio.</p>
              <BulejeComposedChart
                data={balanceChart}
                xKey="especie"
                bars={[
                  { key: "Ingreso", label: "Ingreso", color: "accent", yAxis: "left" },
                  { key: "Consumido", label: "Consumido", color: "amber", yAxis: "left" },
                ]}
                height={240}
                minDataPoints={1}
                leftAxisFormat={(v) => `${v}`}
                tooltipFormat={(v) => `${Number(v).toFixed(2)} m³`}
              />
            </div>
          )}

          {/* Conciliación: apertura (del cierre anterior) + movimientos = final (ADR-139 rollforward). */}
          {concil && concil.materiaPrima.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
                <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Conciliación del período · apertura → cierre</CardTitle>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Existencia de apertura {concil.fuenteApertura === "cierre" ? `(del cierre de ${concil.aperturaLabel})` : concil.fuenteApertura === "calculada" ? "(acumulada al inicio)" : "(sin cierre previo)"} + movimientos del período = existencia final. Así el saldo cuadra con el stock heredado.</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-left"><tr><Th>Especie</Th><Th className="text-right">Apertura (m³)</Th><Th className="text-right">+ Ingreso</Th><Th className="text-right">− Consumido</Th><Th className="text-right">= Final (m³)</Th></tr></thead>
                <tbody>
                  {concil.materiaPrima.map((s) => (
                    <tr key={s.especie} className="border-t border-[var(--rule-soft)]">
                      <td className="px-4 py-2 text-[var(--text-primary)]">{s.especie}{s.cites ? " · CITES" : ""}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{n2(s.apertura)}</td>
                      <td className="px-4 py-2 text-right text-[var(--data-success-700)]">{n2(s.ingreso)}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{n2(s.consumido)}</td>
                      <td className={`px-4 py-2 text-right font-bold ${s.negativa ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(s.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Balance POR ESPECIE — es lo que se fiscaliza; el global solo resume. */}
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
              <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Balance por especie</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Ingreso validado − consumo en producción. Es el balance que se fiscaliza.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <Th>Especie</Th>
                  <Th className="text-right">Ingresado (m³)</Th>
                  <Th className="text-right">Consumido (m³)</Th>
                  <Th className="text-right">Saldo (m³)</Th>
                  <Th className="text-right">Sin validar (m³)</Th>
                </tr>
              </thead>
              <tbody>
                {data.porEspecie.map((s) => (
                  <tr
                    key={s.especie}
                    tabIndex={0}
                    role="button"
                    title={`Ver kardex de ${s.especie}`}
                    onClick={() => setKardexEspecie(s.especie)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setKardexEspecie(s.especie); } }}
                    className={`cursor-pointer border-t border-[var(--rule-soft)] outline-none transition-colors hover:bg-[var(--surface-canvas)] focus-visible:bg-[var(--surface-canvas)] ${s.saldoM3 < 0 ? "bg-[var(--data-error-50)]" : ""}`}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-primary)]">{s.especie}</span>
                        {s.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· ver kardex</span>
                      </div>
                      {s.scientific && <div className="text-xs italic text-[var(--text-tertiary)]">{s.scientific}</div>}
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.ingresoM3)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.consumidoM3)}</Td>
                    <Td className="text-right">
                      <span className={`font-mono font-bold tabular-nums ${s.saldoM3 < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(s.saldoM3)}</span>
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">{s.pendienteM3 > 0 ? n2(s.pendienteM3) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
              {data.porEspecie.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                    <Td className="text-[var(--text-primary)]">Total ({data.porEspecie.length} especie{data.porEspecie.length === 1 ? "" : "s"})</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(mp.ingresoM3)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(mp.consumidoM3)}</Td>
                    <Td className="text-right"><span className={`font-mono tabular-nums ${mp.saldoM3 < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(mp.saldoM3)}</span></Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">{mp.pendienteM3 > 0 ? n2(mp.pendienteM3) : "—"}</Td>
                  </tr>
                </tfoot>
              )}
            </table>
            {data.porEspecie.length === 0 && <div className="p-10 text-center text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin movimientos de madera en {period.label}.</p></div>}
          </div>

          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <div className="border-b-2 border-[var(--rule-base)] px-4 py-3"><CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Stock de productos transformados</CardTitle></div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr><Th>Producto · Especie</Th><Th className="text-right">Producido</Th><Th className="text-right">Despachado</Th><Th className="text-right">Stock</Th></tr>
              </thead>
              <tbody>
                {data.productos.map((p) => (
                  <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
                    <Td className="font-medium text-[var(--text-primary)]">{p.producto}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.producido)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.despachado)}</Td>
                    <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${p.stock < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(p.stock)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.productos.length === 0 && <div className="p-10 text-center text-[var(--text-tertiary)]"><PackageCheck className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin productos transformados todavía.</p></div>}
          </div>

          {/* Gemelo del patio: materia prima parada por antigüedad (self-fetch). */}
          <CtpPatioAging />
        </>
      )}
      {loading && !data && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando saldos…</p></div>}

      {kardexEspecie && <CtpKardexModal especie={kardexEspecie} period={period} onClose={() => setKardexEspecie(null)} />}
    </div>
  );
}
