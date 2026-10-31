"use client";

/**
 * Una línea arriba de «Vendedores» con la regla que rige y sobre qué se paga
 * (auditoría 15-10, H04/M40/M43). El 2 % salía en cada fila como «por
 * defecto» sin decir que no había ninguna regla guardada ni sobre qué base.
 */
import { Percent } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BASE_COMISION, reglaVigente, type ReglaComision } from "@/lib/comisiones/calcular";

export default function ReglaVigente({ reglas, onVerReglas }: { reglas: ReglaComision[]; onVerReglas: () => void }) {
  const r = reglaVigente(reglas);
  return (
    <div data-qa="regla-vigente" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 text-sm">
      <Percent className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
      <span className="text-[var(--text-secondary)]">Regla vigente:</span>
      <span className="font-semibold text-[var(--text-primary)]">{r.texto}</span>
      <span className="text-[var(--text-secondary)]">· sobre {BASE_COMISION.corta}</span>
      <InfoTip
        title="Sobre qué se paga"
        what={BASE_COMISION.larga}
        affects={BASE_COMISION.tramo}
        example="María vende S/ 6,000 en el mes y le devuelven S/ 200: comisiona sobre S/ 5,800. Con 2 % por defecto gana S/ 116."
      />
      <button type="button" onClick={onVerReglas} className="ml-auto min-h-12 px-1 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
        {reglas.length === 0 ? "Poner una regla" : "Ver reglas"}
      </button>
    </div>
  );
}
