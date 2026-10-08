"use client";

/**
 * Selector de fórmula del Cubicador de trozas — «Smalian (m³) | Oxapampina
 * (PT)» — y el interruptor «2 diámetros». Cada fórmula es su propio lote
 * (`cubicacion-trozas-formula.ts`): cambiar acá cambia de lote, no convierte.
 */
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  FORMULAS_TROZAS, UNIDADES_FORMULA, type DiametrosPorTroza, type FormulaTrozas,
} from "@/lib/forestal/cubicacion-trozas-formula";

export default function FormulaTrozasControl({
  formula,
  onFormula,
  diametros,
  onDiametros,
}: {
  formula: FormulaTrozas;
  onFormula: (f: FormulaTrozas) => void;
  diametros: DiametrosPorTroza;
  onDiametros: (d: DiametrosPorTroza) => void;
}) {
  const u = UNIDADES_FORMULA[formula];
  const dos = diametros === 2;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        value={formula}
        onChange={onFormula}
        size="sm"
        label="Fórmula con la que se cubica el patio"
        options={FORMULAS_TROZAS.map((f) => ({ value: f, label: UNIDADES_FORMULA[f].etiqueta }))}
      />
      <InfoTip
        title="Dos fórmulas, dos lotes"
        what={<span>Smalian: Ø en cm y largo en m, da m³ (lo que declara la GTF). Oxapampina: Ø en pulgadas y largo en pies, da pie tablar: {UNIDADES_FORMULA.oxapampina.cuenta}.</span>}
        affects={<span>Cada fórmula guarda su propio patio: cambiar de fórmula no convierte las medidas, abre el otro lote.</span>}
        example={<span>20″ × 12′ = 195.92 PT. Con 18″ y 22″ el Ø es 20″: también 195.92 PT.</span>}
        side="bottom"
      />
      <button
        type="button"
        role="switch"
        aria-checked={dos}
        onClick={() => onDiametros(dos ? 1 : 2)}
        title={dos ? "Mides las dos puntas: se promedian. Clic para medir un solo Ø al medio." : "Mides un Ø al medio de la troza. Clic para medir las dos puntas."}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          dos
            ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span
          aria-hidden
          className={`relative inline-block h-4 w-7 rounded-full transition-colors ${dos ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]"}`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--surface-raised)] transition-all ${dos ? "left-3.5" : "left-0.5"}`} />
        </span>
        2 diámetros
        <span className="sr-only">{dos ? `: Ø menor y mayor en ${u.diametro}, se promedian` : `: un Ø al medio, en ${u.diametro}`}</span>
      </button>
    </div>
  );
}
