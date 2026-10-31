"use client";

/**
 * En las observaciones del plan (Brandon 25-10): el bloque que se pasa de su
 * volumen autorizado —«Bloque 2 · Tornillo se pasa por 13,261 m³ — revisa y
 * corrige»— con un botón que lleva a las preliminares que lo hacen pasar (o al
 * bloque, si ya lo pasa con lo registrado). Es un aviso: el freno del despacho
 * sigue midiendo por especie del plan y no cambia.
 */

import { AlertTriangle, ArrowRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { textoDeExceso, type ExcesoDeBloque } from "@/lib/forestal/loth-plan-bloques-saldo";
import { Btn } from "./ctp-shared";

export default function LothPlanBloquesExcesoAviso({
  excesos,
  onVer,
}: {
  excesos: readonly ExcesoDeBloque[] | null | undefined;
  /** `ids` vacíos = no hay preliminar que corregir: va al bloque. */
  onVer: (ids: string[]) => void;
}) {
  if (!excesos?.length) return null;
  /* Con un solo bloque, título y detalle van en UNA línea (26-10, «más
     compacto»): eran dos renglones para una sola frase. */
  const uno = excesos.length === 1;
  const ayuda = (
    <InfoTip
      title="No te pases del volumen de cada bloque"
      what="Lo registrado en el libro (atado al bloque por su GTF preliminar) más las preliminares pendientes pasa lo autorizado de esa especie en ese bloque."
      affects="Es un aviso para corregir antes de registrar en SERFOR: corrige los m³ o el bloque de la preliminar, o anúlala. El freno del despacho no cambia."
      example="Bloque 2 con 30 m³ de tornillo y una preliminar de 43,261 m³: se pasa por 13,261 m³."
    />
  );
  return (
    <div
      data-testid="aviso-bloques-excedidos"
      data-aviso-nivel="rojo"
      role="status"
      className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
    >
      <AlertTriangle className="mt-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {!uno && (
          <p className="flex items-center gap-1 pt-2 font-bold">
            {excesos.length} veces se pasa el volumen de un bloque
            {ayuda}
          </p>
        )}
        <ul className="font-medium">
          {excesos.map((x) => (
            <li key={`${x.bloque}|${x.clave}`} className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1">
                {uno && <span className="font-bold">Un bloque se pasa del volumen autorizado:</span>}
                <span>
                  {textoDeExceso(x, fmtM3)}
                  {x.excedeHoy && " (ya con lo registrado)"}
                </span>
                {uno && ayuda}
              </span>
              <Btn variant="ghost" size="sm" className="shrink-0" onClick={() => onVer(x.preliminarIds)}>
                {x.preliminarIds.length > 0 ? "Corregir" : "Ver bloque"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Btn>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
