"use client";

/**
 * «Ficha al X %» en el pie del formulario del plan (Brandon 24-10, opción B):
 * cuánto de lo que la GTF, el libro TH y la fiscalización piden ya está
 * escrito. Tocarla lleva al paso del primero que falta; el ⓘ dice cada uno con
 * de dónde sale el requisito. No frena el guardado: sólo el titular es
 * obligatorio (y el relleno, que se rechaza aparte).
 */

import { AlertCircle, CheckCircle2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoFicha } from "@/lib/forestal/loth-plan-ficha";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormFicha({ form }: { form: LothPlanFormEstado }) {
  const { ficha, setPaso } = form;
  const completa = ficha.faltan.length === 0;
  const destino = ficha.faltan.find((x) => x.paso != null)?.paso ?? null;
  const tono = completa ? "text-[var(--data-success-ink)]" : "text-[var(--data-warning-ink)]";
  const Icono = completa ? CheckCircle2 : AlertCircle;
  return (
    <span className="inline-flex items-center gap-0.5" data-ficha-form={ficha.pct}>
      <button
        type="button"
        disabled={!destino}
        onClick={() => destino && setPaso(destino)}
        title={destino ? "Ir a lo primero que le falta a la ficha" : undefined}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors enabled:hover:bg-[var(--surface-sunken)] disabled:cursor-default ${tono}`}
      >
        <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
        {textoFicha(ficha)}
      </button>
      <InfoTip
        title={completa ? "Ficha completa" : `Lo que le falta a la ficha (${ficha.llenos} de ${ficha.total})`}
        ariaLabel="Qué cuenta la ficha del plan"
        ancho="w-96"
        body={
          <span className="block space-y-1.5 text-sm">
            {completa ? (
              <span className="block">Tiene todo lo que la GTF, el libro de operaciones y la fiscalización piden del plan.</span>
            ) : (
              ficha.faltan.map((x) => (
                <span key={x.id} className="block">
                  <span className="font-semibold">{x.falta}.</span>{" "}
                  <span className="text-[var(--text-tertiary)]">{x.fuente}</span>
                </span>
              ))
            )}
            <span className="block text-xs text-[var(--text-tertiary)]">
              No frena el guardado: el único obligatorio es el titular. Lo que parece relleno («ERERER», «xxx») sí se rechaza.
            </span>
          </span>
        }
      />
    </span>
  );
}
