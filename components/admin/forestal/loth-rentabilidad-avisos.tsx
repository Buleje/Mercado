"use client";

/**
 * Lo que pide mirar primero en «Rentabilidad y rendimiento»: el veredicto del
 * libro, las especies fuera del plan y las anomalías. Cada aviso es UNA línea;
 * el detalle va en su ⓘ (ley de la vista, regla 9).
 */

import { AlertTriangle, Ban } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Veredicto } from "@/lib/forestal/loth-analitica";
import { VeredictoBanner } from "./loth-analitica-piezas";
import type { Anomalia } from "./loth-rentabilidad-datos";

const ERROR =
  "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]";
const ALERTA =
  "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";

export default function LothRentabilidadAvisos({
  veredicto,
  anomalias,
  fueraDePlan,
}: {
  veredicto: Veredicto;
  anomalias: Anomalia[];
  fueraDePlan: string[];
}) {
  const ordenadas = [...anomalias].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <div className="space-y-2">
      <VeredictoBanner v={veredicto} />
      {fueraDePlan.length > 0 && (
        <div className={`flex items-start gap-2 rounded-xl border-2 px-4 py-2.5 text-sm ${ERROR}`}>
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <b>Fuera del plan autorizado:</b> {fueraDePlan.join(", ")}
          </span>
          <InfoTip
            title="Especies fuera del plan"
            what="Hay operaciones de una especie que no figura en la resolución del plan."
            affects="Aprovechar una especie no autorizada es infracción: regulariza el plan o el registro."
            example="Talaste Cedro y el plan sólo autoriza Tornillo y Shihuahuaco."
            side="bottom"
          />
        </div>
      )}
      {ordenadas.map((a, i) => (
        <div key={`${a.code}-${i}`} className={`flex items-start gap-2 rounded-xl border-2 px-4 py-2.5 text-sm ${a.level === "error" ? ERROR : ALERTA}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <b className="text-[length:var(--ts-2xs)] uppercase tracking-wide">{a.level === "error" ? "Grave" : "Alerta"}</b> · {a.message}
          </span>
        </div>
      ))}
    </div>
  );
}
