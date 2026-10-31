/**
 * La tarjeta de un bloque SIN saldo (plantación en «Registro y saldo»): lo que
 * dice el reparto —árboles, hectáreas y m³ de cada especie— con la misma
 * identidad que la tarjeta con saldo (franja, insignia, cifras grandes) y, por
 * especie, cuánto pesa en el bloque en una barra de su tono.
 */

import { formatNumber } from "@/lib/format";
import { subtotalDelBloque, type BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";
import { CifraGrande, InsigniaDelBloque, varDeTono } from "./LothPlanBloqueBarra";
import { idDeBloque, insigniaDelBloque, pct } from "./loth-plan-bloque-visual";

const NUM = "font-mono tabular-nums";
const m3 = (v: number) => formatNumber(v, 3);

export default function LothPlanBloqueTarjetaReparto({ bloque, tono }: { bloque: BloqueDelPlan; tono: string }) {
  const s = subtotalDelBloque(bloque);
  return (
    <li
      id={idDeBloque(bloque.nombre)}
      data-bloque={bloque.nombre}
      style={varDeTono(tono)}
      className="relative scroll-mt-4 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: "var(--bloque)" }} />
      <div className="space-y-3 py-3 pl-5 pr-3">
        <div className="flex items-start gap-3">
          <InsigniaDelBloque texto={insigniaDelBloque(bloque.nombre)} tono={tono} grande />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight text-[var(--text-primary)]">{bloque.nombre}</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {s.especies} {s.especies === 1 ? "especie" : "especies"}
              {s.arboles != null && ` · ${formatNumber(s.arboles, 0)} ${s.arboles === 1 ? "árbol" : "árboles"}`}
            </p>
          </div>
        </div>
        <dl className={`grid gap-2 ${s.ha != null ? "grid-cols-2" : "grid-cols-1"}`}>
          <CifraGrande t="Volumen" v={m3(s.m3)} unidad="m³" />
          {s.ha != null && <CifraGrande t="Superficie" v={formatNumber(s.ha, 2)} unidad="ha" />}
        </dl>
        <ul className="space-y-2.5">
          {bloque.especies.map((e) => (
            <li key={e.speciesCommon} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{e.speciesCommon}</span>
                <span className={`${NUM} text-[var(--text-secondary)]`}>
                  {e.arboles != null && `${formatNumber(e.arboles, 0)} ${e.arboles === 1 ? "árbol" : "árboles"} · `}
                  {e.superficieHa != null && `${formatNumber(e.superficieHa, 2)} ha · `}
                  <b className="text-[var(--text-primary)]">{m3(e.volumenM3)} m³</b>
                </span>
              </div>
              {/* Cuánto del bloque es esta especie. */}
              <div
                role="img"
                aria-label={`${e.speciesCommon}: ${formatNumber(pct(e.volumenM3, s.m3), 0)} % del volumen del bloque`}
                className="h-2 overflow-hidden rounded-full"
                style={{ background: "color-mix(in oklab, var(--text-primary) 9%, transparent)" }}
              >
                <span className="block h-full rounded-full" style={{ width: `${pct(e.volumenM3, s.m3)}%`, background: "var(--bloque)" }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
