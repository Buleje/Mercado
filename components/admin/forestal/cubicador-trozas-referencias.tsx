/**
 * Referencias del patio de trozas: el total en la fórmula del lote, su lectura
 * de compra-venta y el EQUIVALENTE en la otra fórmula (15-10, Brandon: «cuando
 * saco a Smalian, que saque su versión a Oxapampina, y viceversa»).
 *
 * El equivalente es un derivado: las mismas medidas pasadas de unidad (cm ↔
 * pulgadas, m ↔ pies) y cubicadas con la otra fórmula (`totalEquivalente`).
 * No es lo medido; se rotula con «≈».
 */
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { OTRA_FORMULA, UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { formatNumber } from "@/lib/format";

const HINT_EQUIVALENTE: Record<FormulaTrozas, string> = {
  smalian: "derivado: cm ÷ 2,54 · m ÷ 0,3048",
  oxapampina: "derivado: pulg × 2,54 · pies × 0,3048",
};

export default function ReferenciasPatio({
  formula, totales, totalEquivalente,
}: {
  formula: FormulaTrozas;
  totales: { trozas: number; volumen: number };
  /** El patio entero en la otra fórmula (`totalEquivalente` de la lib). */
  totalEquivalente: number;
}) {
  const u = UNIDADES_FORMULA[formula];
  const otra = UNIDADES_FORMULA[OTRA_FORMULA[formula]];
  const fmtVol = (v: number) => formatNumber(v, u.decimales);
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-vista="referencias-patio">
      {formula === "oxapampina" ? (
        <>
          <Ref label="Total" value={`${fmtVol(totales.volumen)} PT`} />
          <Ref label="Por troza" value={`${fmtVol(totales.trozas > 0 ? totales.volumen / totales.trozas : 0)} PT`} hint="promedio del patio" />
        </>
      ) : (
        <>
          <Ref label="Total rolliza" value={`${fmtVol(totales.volumen)} m³`} />
          <Ref label="Equivalente volumétrico" value={`${formatNumber(totales.volumen * PT_POR_M3, { max: 0 })} PT`} hint={`1 m³ = ${PT_POR_M3} PT — el factor con el que se compra y se vende`} />
        </>
      )}
      <Ref
        label={`En ${otra.nombre}`}
        value={`≈ ${formatNumber(totalEquivalente, otra.decimales)} ${otra.volumen}`}
        hint={HINT_EQUIVALENTE[formula]}
        dato="total-equivalente"
      />
      <Ref label="Fórmula" value={u.nombre} hint={u.cuenta} />
    </div>
  );
}

function Ref({ label, value, hint, dato }: { label: string; value: string; hint?: string; dato?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center" data-dato={dato}>
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
