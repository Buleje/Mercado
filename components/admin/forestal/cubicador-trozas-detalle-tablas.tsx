"use client";

/**
 * Las tablas del detalle de una cubicación de trozas: los grupos (especie,
 * diámetro, largo) con su participación y, si se valorizó, los soles; y la
 * lista de las trozas una por una. Mismo estilo que Resúmenes › Trozas.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import type { TrozaCongelada } from "@/lib/forestal/cubicacion-cuenta";
import { fmtPct, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { numeroVolumen } from "@/lib/forestal/cubicacion-trozas-diferencias";
import type { GrupoTrozas } from "@/lib/forestal/cubicacion-trozas-resumen";
import { formatNumber } from "@/lib/format";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";

export function TablaGruposTrozas({ primeraCol, grupos, total, formula, valores, caption }: {
  primeraCol: string;
  grupos: readonly GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
  formula: FormulaTrozas;
  /** Soles por grupo (clave del grupo → S/), sólo si la cubicación se valorizó. */
  valores?: ReadonlyMap<string, number>;
  caption: string;
}) {
  const ox = formula === "oxapampina";
  const vol = (g: { m3: number; pt: number }) => numeroVolumen(ox ? g.pt : g.m3, formula);
  const unidad = UNIDADES_FORMULA[formula].volumen;
  const totalValor = valores ? [...valores.values()].reduce((a, v) => a + v, 0) : null;
  return (
    <DataTable className="w-full min-w-[420px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{primeraCol}</th>
          <th scope="col" className="text-right">Trozas</th>
          <th scope="col" className="text-right">{unidad}</th>
          <th scope="col" className="w-[26%]">Participación</th>
          {valores && <th scope="col" className="text-right">S/</th>}
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => (
          <tr key={g.clave}>
            <th scope="row" className="text-left font-bold">{g.label}</th>
            <td className={NUM}>{formatNumber(g.trozas)}</td>
            <td className={`${NUM} font-bold`}>{vol(g)}</td>
            <td>
              <div className="flex items-center gap-2">
                <div className="hidden h-2 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, g.pctM3)}%` }} />
                </div>
                <span className="w-16 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fmtPct(g.pctM3)} %</span>
              </div>
            </td>
            {valores && <td className={NUM}>{valores.has(g.clave) ? fmtSoles(valores.get(g.clave) ?? 0) : "—"}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold">
          <th scope="row" className="text-left text-[var(--accent-ink)] dark:text-[var(--accent)]">Total · {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}</th>
          <td className={NUM}>{formatNumber(total.trozas)}</td>
          <td className={NUM}>{vol(total)}</td>
          <td className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">100 %</td>
          {valores && <td className={NUM}>{totalValor !== null ? fmtSoles(totalValor) : "—"}</td>}
        </tr>
      </tfoot>
    </DataTable>
  );
}

/** Con cientos de trozas la lista entera empuja todo: las primeras y «Ver todas». */
const PRIMERAS = 40;

/** Las trozas una por una, como se guardaron (el volumen es el NETO si tuvo descuento). */
export function TablaTrozasUnaPorUna({ trozas, formula }: { trozas: readonly TrozaCongelada[]; formula: FormulaTrozas }) {
  const [todas, setTodas] = useState(false);
  const u = UNIDADES_FORMULA[formula];
  const visibles = todas ? trozas : trozas.slice(0, PRIMERAS);
  return (
    <>
      <DataTable className="w-full min-w-[520px]" wrapperClassName="max-h-[50vh] overflow-y-auto" stickyHeader>
        <caption className="sr-only">Las trozas de la cubicación, una por una</caption>
        <thead>
          <tr>
            <th scope="col" className="text-right">N°</th>
            <th scope="col">Código</th>
            <th scope="col">Especie</th>
            <th scope="col" className="text-right">Ø menor ({u.diametro})</th>
            <th scope="col" className="text-right">Ø mayor ({u.diametro})</th>
            <th scope="col" className="text-right">Largo ({u.largo})</th>
            <th scope="col" className="text-right">{u.volumen}</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((t) => (
            <tr key={t.n}>
              <td className={NUM}>{t.n}</td>
              <td className="font-mono">{t.codigo ?? "—"}</td>
              <td className="font-bold">{t.especie || "Sin especie"}</td>
              <td className={NUM}>{formatNumber(t.d1, 1)}</td>
              <td className={NUM}>{formatNumber(t.d2, 1)}</td>
              <td className={NUM}>{formatNumber(t.largo, 1)}</td>
              <td className={`${NUM} font-bold`}>{numeroVolumen(t.volumen, formula)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {trozas.length > PRIMERAS && (
        <button type="button" onClick={() => setTodas((v) => !v)} className={button({ variant: "link", className: "mt-2 text-[var(--accent-ink)] underline dark:text-[var(--accent)]" })}>
          {todas ? "Ver sólo las primeras" : `Ver las ${formatNumber(trozas.length)} trozas`}
        </button>
      )}
    </>
  );
}
