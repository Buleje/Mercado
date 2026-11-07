"use client";

/**
 * El total por m³ (Σ de los tres costos) y, si el formulario conoce el
 * volumen, el costo estimado del plan entero. VISTA PREVIA: no se guarda; lo
 * que se guarda son los tres costos, que Analítica usa para el margen.
 */

import { Calculator } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { costoEstimado, costoPorM3 } from "@/lib/forestal/loth-plan-costeo";
import { fmtM3, fmtSoles } from "@/lib/forestal/cubicacion-formato";

export default function LothPlanCosteoTotales({
  costos,
  volumenM3,
  base,
}: {
  costos: readonly string[];
  /** Σ m³ que el formulario conoce (especies de una plantación); `null` si no sabe. */
  volumenM3: number | null;
  /** «autorizado» o «registrado». */
  base: string;
}) {
  const c = costoPorM3(costos);
  const estimado = c ? costoEstimado(c.total, volumenM3) : null;
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm lg:col-span-4">
      <Calculator className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      {c ? (
        <>
          <span className="text-[var(--text-secondary)]">
            Total{" "}
            <b className="font-mono font-bold tabular-nums text-[var(--text-primary)]">S/ {fmtSoles(c.total)}</b> por m³
            {c.cargados < 3 && <span className="text-[var(--text-tertiary)]"> ({c.cargados} de 3 costos)</span>}
          </span>
          {estimado != null && volumenM3 != null && (
            <span className="text-[var(--text-secondary)]">
              ≈ <b className="font-mono font-bold tabular-nums text-[var(--text-primary)]">S/ {fmtSoles(estimado)}</b> para los{" "}
              {fmtM3(volumenM3)} m³ {base === "registrado" ? "registrados" : "autorizados"}
            </span>
          )}
        </>
      ) : (
        <span className="text-[var(--text-tertiary)]">Carga un costo para ver el total por m³.</span>
      )}
      <InfoTip
        title="Total por m³"
        what="La suma de extracción, transformación y flete. Es una vista previa: se guardan los tres costos, no el total."
        affects="El estimado del plan sale cuando el formulario conoce el volumen: las especies de un registro de plantación."
        example="S/ 40 + S/ 30 + S/ 15 = S/ 85 por m³; con 200 m³ registrados ≈ S/ 17 000."
      />
    </div>
  );
}
