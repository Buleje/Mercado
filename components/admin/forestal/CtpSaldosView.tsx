"use client";

/**
 * CtpSaldosView — balance de planta del Libro CTP (ADR-127): materia prima
 * (m³) y stock de productos transformados. Hermana de CtpEntriesView
 * (Producción/Despacho), que vive en su propio archivo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, AlertCircle, Boxes, Scale, PackageCheck, Layers, Clock, TreePine, FileDown, Truck,
} from "@buleje/design-system/icons";
import { StatCard, CardTitle } from "@buleje/design-system";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";
import CtpSaldosGraficos from "./CtpSaldosGraficos";
import { printExistencias } from "@/lib/forestal/ctp-existencias-print";
import { applyCtpPeriodParams, ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpKardexModal from "./CtpKardexModal";
import CtpPatioAging from "./CtpPatioAging";
import { Th, Td, n2 } from "./ctp-section-shared";

/**
 * La fila del stock viene etiquetada "tipo · especie" (`productLabel` de
 * `forest-ctp.db`). El formulario de despacho pide los dos por separado, así que
 * se parte acá — con el "—" del vacío traducido a `null`, no a un texto que
 * después el select no encuentra.
 */
function partirProducto(label: string): [string, string | null] {
  const [tipo, especie] = label.split(" · ");
  const limpia = (v: string | undefined) => (v && v !== "—" ? v.trim() : null);
  return [limpia(tipo) ?? "", limpia(especie)];
}

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

export function CtpSaldosView({
  period,
  onDespachar,
}: {
  period: CtpPeriod;
  /** Atajo "del stock a la guía": lleva a Despacho con producto y especie ya elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
}) {
  const [data, setData] = useState<SaldosData | null>(null);
  const [concil, setConcil] = useState<Concil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
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

  // Reporte de existencias imprimible (PDF) para fiscalización: misma data del
  // panel + identidad del CTP (best-effort desde la Ficha).
  const handleReport = useCallback(async () => {
    if (!data) return;
    setReportError(null);
    const ficha = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.ficha ?? null)
      .catch((err) => {
        console.warn("[ctp-existencias] ficha fetch failed", err);
        return null;
      });
    try {
      printExistencias({
        periodLabel: period.label,
        materiaPrima: data.materiaPrima,
        porEspecie: data.porEspecie,
        productos: data.productos,
        concil,
        ficha,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }, [data, concil, period.label]);

  const mp = data?.materiaPrima;

  // Existencia heredada del cierre anterior. Es la que hace que la cascada
  // arranque donde terminó el mes pasado en vez de en cero; sin conciliación
  // no se conoce, y `null` es distinto de 0 (ver `pasosDeBalance`).
  const apertura = useMemo(
    () => (concil ? concil.materiaPrima.reduce((a, s) => a + s.apertura, 0) : null),
    [concil],
  );

  return (
    <div className="space-y-4">
      <VistaHeader
        titulo="Existencias del Libro (LO-CTP)"
        meta={ctpPeriodShortLabel(period)}
        hint="Materia prima que entra vs. producto que sale. Es el saldo que se declara ante SERFOR — va en la hoja «Existencias» del export oficial."
      >
        <Btn variant="dark" size="md" onClick={() => void handleReport()} disabled={!data}>
          <FileDown className="h-4 w-4" /> Descargar reporte
        </Btn>
        <Btn variant="secondary" size="md" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </Btn>
      </VistaHeader>

      {reportError && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>No se pudo abrir el reporte:</strong> {reportError}</div></div>}

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {data && mp && (
        <>
          {/* La alerta que importa: el balance global puede tapar una especie en rojo. */}
          {mp.especiesEnNegativo > 0 && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
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
            <StatCard label="Pendiente de validar" value={`${n2(mp.pendienteM3)} m³`} subValue={mp.pendienteM3 > 0 ? "no computa como saldo" : "todo el ingreso está validado"} icon={Clock} emphasis={mp.pendienteM3 > 0 ? "warning" : "neutral"} />
          </div>

          {/* Los derivados y los tres gráficos: rotación, cobertura, de qué
              especie depende el patio y en qué estado está cada volumen. */}
          <CtpSaldosGraficos
            materiaPrima={mp}
            porEspecie={data.porEspecie}
            productos={data.productos}
            apertura={apertura}
            aperturaPendiente={loading}
            period={period}
          />


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
                    className={`cursor-pointer border-t border-[var(--rule-soft)] outline-none transition-colors hover:bg-[var(--surface-canvas)] focus-visible:bg-[var(--surface-canvas)] ${s.saldoM3 < 0 ? "bg-[var(--data-error-50)] dark:bg-[var(--surface-sunken)]" : ""}`}
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
                <tr><Th>Producto · Especie</Th><Th className="text-right">Producido</Th><Th className="text-right">Despachado</Th><Th className="text-right">Stock</Th>{onDespachar && <Th className="text-right">&nbsp;</Th>}</tr>
              </thead>
              <tbody>
                {data.productos.map((p) => (
                  <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
                    <Td className="font-medium text-[var(--text-primary)]">{p.producto}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.producido)}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.despachado)}</Td>
                    <Td className="text-right"><span className={`font-mono font-bold tabular-nums ${p.stock < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n2(p.stock)}</span></Td>
                    {/* Con stock en patio, el siguiente paso natural es la guía:
                        se abre el despacho con este producto ya elegido en vez
                        de ir a Despacho y volver a buscarlo. */}
                    {onDespachar && (
                      <Td className="text-right">
                        {p.stock > 0 && (
                          <Btn size="sm" variant="secondary" onClick={() => onDespachar(...partirProducto(p.producto))}>
                            <Truck className="h-4 w-4" />
                            Despachar
                          </Btn>
                        )}
                      </Td>
                    )}
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
      {loading && !data && <PanelSkeleton kpis={4} />}

      {kardexEspecie && <CtpKardexModal especie={kardexEspecie} period={period} onClose={() => setKardexEspecie(null)} />}
    </div>
  );
}
