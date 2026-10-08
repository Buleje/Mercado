"use client";

/**
 * Rendimiento › Simulador — del lote de rolliza del «Cubicador de trozas» al
 * PT aserrado que debería salir, con el rendimiento REAL de cada especie (sus
 * corridas terminadas) o, si todavía no tiene, con la referencia general
 * rotulada como tal. Es una vista previa: no se guarda nada.
 *
 * El lote Oxapampina viene en PT, no en m³: se pasa a m³ geométricos con el
 * factor Oxapampa (÷ 424 ÷ 0,624) y se avisa con «≈».
 */
import { DataTable } from "@buleje/design-system";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { claveLoteTrozas, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { FACTOR_OXAPAMPA_GEOMETRICO } from "@/lib/forestal/rendimiento-plata";
import { simularAserrado, type FuenteSimulacion, type ResumenEspecie } from "@/lib/forestal/rendimiento-especie";
import { fmtM3, fmtPct } from "./rendimiento-compartido";

type Entrada = { especie: string; m3: number; trozas: number };

function leerLote(formula: FormulaTrozas): Entrada[] {
  try {
    const slug = localStorage.getItem("active-tenant-slug") ?? "main";
    const v: unknown = JSON.parse(localStorage.getItem(claveLoteTrozas(slug, formula)) ?? "[]");
    if (!Array.isArray(v)) return [];
    return (v as { especie?: string; m3?: number; pt?: number }[]).map((t) => ({
      especie: t.especie?.trim() || "Sin especie",
      m3: formula === "smalian" ? Number(t.m3) || 0 : (Number(t.pt) || 0) / (PT_POR_M3 * FACTOR_OXAPAMPA_GEOMETRICO),
      trozas: 1,
    }));
  } catch {
    return [];
  }
}

const FUENTE: Record<FuenteSimulacion, string> = {
  propio: "tus corridas",
  provisional: "rango provisional",
  referencia: "referencia general",
};

export default function RendimientoSimulador({ especies }: { especies: readonly ResumenEspecie[] }) {
  const [lotes, setLotes] = useState<Record<FormulaTrozas, Entrada[]>>({ smalian: [], oxapampina: [] });
  const [formula, setFormula] = useState<FormulaTrozas>("smalian");
  const [manual, setManual] = useState({ especie: especies[0]?.especie ?? "", m3: "" });
  const recargar = useCallback(() => {
    const l = { smalian: leerLote("smalian"), oxapampina: leerLote("oxapampina") };
    setLotes(l);
    setFormula((f) => (l[f].length > 0 ? f : l.smalian.length > 0 ? "smalian" : l.oxapampina.length > 0 ? "oxapampina" : f));
  }, []);
  useEffect(recargar, [recargar]);

  const entradas = useMemo<Entrada[]>(
    () =>
      lotes[formula].length > 0
        ? lotes[formula]
        : Number(manual.m3) > 0
          ? [{ especie: manual.especie || "Sin especie", m3: Number(manual.m3), trozas: 0 }]
          : [],
    [lotes, formula, manual],
  );
  const filas = useMemo(() => simularAserrado(entradas, especies), [entradas, especies]);
  const total = filas.reduce((a, f) => ({ m3: a.m3 + f.m3, pt: a.pt + f.ptEsperado, min: a.min + f.ptMin, max: a.max + f.ptMax }), { m3: 0, pt: 0, min: 0, max: 0 });
  const ox = formula === "oxapampina" && lotes.oxapampina.length > 0;
  const hayLote = lotes.smalian.length + lotes.oxapampina.length > 0;
  const BTN = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {hayLote ? (
          (["smalian", "oxapampina"] as const)
            .filter((f) => lotes[f].length > 0)
            .map((f) => (
              <button key={f} type="button" aria-pressed={formula === f} onClick={() => setFormula(f)}
                className={`${BTN} ${formula === f ? "border-[var(--accent)] bg-[var(--accent-soft)]" : ""}`}>
                Lote {f === "smalian" ? "Smalian" : "Oxapampina"} · {lotes[f].length} trozas
              </button>
            ))
        ) : (
          <>
            <span className="text-sm text-[var(--text-secondary)]">Sin lote en el Cubicador de trozas. Prueba con:</span>
            <select value={manual.especie} onChange={(e) => setManual((m) => ({ ...m, especie: e.target.value }))} aria-label="Especie"
              className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)]">
              {especies.map((e) => <option key={e.especie} value={e.especie}>{e.especie}</option>)}
              {especies.length === 0 && <option value="">Sin especie</option>}
            </select>
            <input type="number" inputMode="decimal" min={0} value={manual.m3} onChange={(e) => setManual((m) => ({ ...m, m3: e.target.value }))}
              placeholder="m³ rolliza" aria-label="m³ de rolliza"
              className="h-9 w-36 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 font-mono text-sm text-[var(--text-primary)]" />
          </>
        )}
        <button type="button" onClick={recargar} className={`${BTN} ml-auto`} title="Volver a leer el lote del cubicador">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Releer lote
        </button>
      </div>

      {filas.length === 0 ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-[var(--text-tertiary)]">
          <Calculator className="h-4 w-4" aria-hidden /> Cubica trozas en «Cubicador de trozas» o pon los m³ arriba.
        </p>
      ) : (
        <DataTable className="text-sm">
          <thead className="border-b border-[var(--rule-base)]">
            <tr className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <th scope="col" className="px-3 py-2 text-left">Especie</th>
              <th scope="col" className="px-3 py-2 text-right">Rolliza (m³)</th>
              <th scope="col" className="px-3 py-2 text-right">Rendimiento usado</th>
              <th scope="col" className="px-3 py-2 text-right">PT aserrado esperado</th>
              <th scope="col" className="px-3 py-2 text-right">Entre</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.especie}>
                <th scope="row" className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">
                  {f.especie}
                  {f.trozas > 0 && <span className="block text-xs font-normal text-[var(--text-tertiary)]">{f.trozas} trozas</span>}
                </th>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{ox ? "≈ " : ""}{fmtM3(f.m3)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="font-mono font-bold tabular-nums">{fmtPct(f.pct)}</span>
                  <span className={`block text-xs ${f.fuente === "referencia" ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
                    {FUENTE[f.fuente]}{f.corridas > 0 ? ` · ${f.corridas} ${f.corridas === 1 ? "corrida" : "corridas"}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(f.ptEsperado, 0)} PT</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">{formatNumber(f.ptMin, 0)} – {formatNumber(f.ptMax, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" className="px-3 py-2 text-left">Total</th>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{ox ? "≈ " : ""}{fmtM3(total.m3)}</td>
              <td className="px-3 py-2 text-right">
                <InfoTip
                  title="Cómo se simula"
                  what="PT aserrado = m³ de rolliza × rendimiento de la especie × 424. El rendimiento es el ponderado de tus corridas TERMINADAS de esa especie; sin ninguna, la referencia general del aserrío (56 %, entre 40 y 65 %)."
                  affects="Es una vista previa: no se guarda ni toca el Libro. Las corridas en proceso no cuentan (su número todavía no es todo)."
                  example="10 m³ de tornillo con tus corridas al 51 % → ≈ 2 162 PT."
                />
              </td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums">{formatNumber(total.pt, 0)} PT</td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{formatNumber(total.min, 0)} – {formatNumber(total.max, 0)}</td>
            </tr>
          </tfoot>
        </DataTable>
      )}
    </div>
  );
}
