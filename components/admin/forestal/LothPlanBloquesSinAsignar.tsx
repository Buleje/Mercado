"use client";

/**
 * «Sin bloque asignado» (Brandon 25-10): lo registrado en el libro que no se
 * sabe de qué bloque salió. El libro no guarda el bloque; se sabe sólo por la GTF
 * preliminar con el mismo N.º. Lo de acá cuenta en el saldo del PLAN (arriba),
 * no en el de un bloque: nunca se reparte a ojo entre los bloques.
 */

import { useState } from "react";
import { ChevronDown, HelpCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SaldoPorBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import { Btn } from "./ctp-shared";
import LothPlanBloqueGuias from "./LothPlanBloqueGuias";

const NUM = "font-mono tabular-nums";

export default function LothPlanBloquesSinAsignar({ sinBloque }: { sinBloque: SaldoPorBloques["sinBloque"] }) {
  const [ver, setVer] = useState(false);
  if (sinBloque.especies.length === 0) return null;
  const guias = sinBloque.especies.flatMap((e) => e.guias);
  return (
    <div data-testid="sin-bloque" className="space-y-1 rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <HelpCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="font-semibold text-[var(--text-primary)]">Sin bloque asignado</span>
        <span className={`${NUM} text-[var(--text-secondary)]`}>
          {fmtM3(sinBloque.usadoM3)} m³ en el libro
          {sinBloque.pendienteM3 > 0 && ` · ${fmtM3(sinBloque.pendienteM3)} m³ preliminares`}
        </span>
        <InfoTip
          title="Sin bloque asignado"
          what="Lo que el libro registró de este plan y no se sabe de qué bloque salió. El libro no guarda el bloque: se sabe sólo si la guía tiene su GTF preliminar con el mismo N.º y el bloque elegido."
          affects="Cuenta en el saldo del plan (el de arriba, el que mide el freno), pero no en el de ningún bloque: no se reparte a ojo."
          example="GTF 19-000016 con 10 m³ de tornillo en el libro y sin preliminar: queda acá. Anota su preliminar con el bloque y pasa a ese bloque."
        />
        <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => setVer((v) => !v)} aria-expanded={ver}>
          <ChevronDown className={`h-4 w-4 transition-transform ${ver ? "rotate-180" : ""}`} aria-hidden="true" />
          Ver guías ({guias.length})
        </Btn>
      </div>
      {ver && <LothPlanBloqueGuias guias={guias} vacio="Nada sin bloque." />}
    </div>
  );
}
