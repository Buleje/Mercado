/**
 * La planilla de la foto anota en otras unidades que el lote abierto (Smalian:
 * cm y m; Oxapampina: pulgadas y pies). Se avisa y se ofrece abrir el lote de
 * su fórmula; mientras no coincidan, el importador no deja agregar.
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";
import { Btn } from "../ctp-shared";

export default function AvisoOtraFormula({
  planilla,
  formulaLote,
  formulaHoja,
  onCambiar,
}: {
  planilla: PlanillaId;
  formulaLote: FormulaTrozas;
  formulaHoja: FormulaTrozas;
  onCambiar?: (f: FormulaTrozas) => void;
}) {
  const hoja = UNIDADES_FORMULA[formulaHoja];
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        La {planillaPorId(planilla)?.nombre ?? "planilla"} anota en {hoja.diametro} y {hoja.largo}; este lote es {UNIDADES_FORMULA[formulaLote].nombre}.
      </span>
      {onCambiar && (
        <Btn variant="secondary" onClick={() => onCambiar(formulaHoja)}>
          Abrir el lote {hoja.nombre}
        </Btn>
      )}
    </div>
  );
}
