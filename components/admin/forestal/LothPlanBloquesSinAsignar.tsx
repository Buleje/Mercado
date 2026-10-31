"use client";

/**
 * «Sin bloque asignado» (Brandon 25-10): lo registrado en el libro que no se
 * sabe de qué bloque salió. El libro no guarda el bloque; se sabe sólo por la GTF
 * preliminar con el mismo N.º. Lo de acá cuenta en el saldo del PLAN (arriba),
 * no en el de un bloque: nunca se reparte a ojo entre los bloques.
 *
 * 26-10: se ve DISTINTO de un bloque a primera vista —gris, punteado, insignia
 * «?» y sin barra (no tiene autorizado propio)—, con sus m³ en cifra grande y
 * qué especies son.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { NoCuadra, SaldoPorBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import { Btn } from "./ctp-shared";
import { CifraGrande, InsigniaSinBloque, varDeTono } from "./LothPlanBloqueBarra";
import LothPlanBloqueGuias from "./LothPlanBloqueGuias";

const NUM = "font-mono tabular-nums";

/** Las guías de una especie suman más que lo que mide el libro: se dice, no se descarta. */
function NoCuadraAviso({ filas }: { filas: readonly NoCuadra[] }) {
  if (filas.length === 0) return null;
  return (
    <p role="status" data-testid="bloques-no-cuadra" className="flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        No cuadra:{" "}
        {filas.map((f) => `${f.especie}, las guías suman ${fmtM3(f.guiasM3)} m³ y el libro mide ${fmtM3(f.usadoM3)}`).join(" · ")}. Revisa los despachos de esas guías.
      </span>
    </p>
  );
}

export default function LothPlanBloquesSinAsignar({ sinBloque, noCuadra = [] }: { sinBloque: SaldoPorBloques["sinBloque"]; noCuadra?: readonly NoCuadra[] }) {
  const [ver, setVer] = useState(false);
  if (sinBloque.especies.length === 0) return <NoCuadraAviso filas={noCuadra} />;
  const guias = sinBloque.especies.flatMap((e) => e.guias);
  return (
    <div
      data-testid="sin-bloque"
      style={varDeTono("var(--text-tertiary)")}
      className="space-y-3 rounded-xl border border-dashed border-[var(--rule-strong)] bg-[var(--surface-sunken)] p-3"
    >
      <NoCuadraAviso filas={noCuadra} />
      <div className="flex items-start gap-3">
        <InsigniaSinBloque />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-base font-bold leading-tight text-[var(--text-secondary)]">
            Sin bloque asignado
            <InfoTip
              title="Sin bloque asignado"
              what="Lo que el libro registró de este plan y no se sabe de qué bloque salió. El libro no guarda el bloque: se sabe sólo si la guía tiene su GTF preliminar con el mismo N.º y el bloque elegido."
              affects="Cuenta en el saldo del plan (el de arriba, el que mide el freno), pero no en el de ningún bloque: no se reparte a ojo."
              example="GTF 19-000016 con 10 m³ de tornillo en el libro y sin preliminar: queda acá. Anota su preliminar con el bloque y pasa a ese bloque."
            />
          </p>
          {/* Qué especies son: «Tornillo 2.761 · Azúcar huayo 3.061». */}
          <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
            {sinBloque.especies.map((e, i) => (
              <span key={e.clave}>
                {i > 0 && " · "}
                {e.especie} <span className={NUM}>{fmtM3(e.usadoM3 + e.pendienteM3)}</span>
              </span>
            ))}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <CifraGrande t="En el libro" v={fmtM3(sinBloque.usadoM3)} unidad="m³" />
        {sinBloque.pendienteM3 > 0 && <CifraGrande t="Preliminares" v={fmtM3(sinBloque.pendienteM3)} unidad="m³" />}
      </dl>
      <div>
        <Btn variant="ghost" size="sm" onClick={() => setVer((v) => !v)} aria-expanded={ver}>
          <ChevronDown className={`h-4 w-4 transition-transform ${ver ? "rotate-180" : ""}`} aria-hidden="true" />
          Ver guías ({guias.length})
        </Btn>
        {ver && <LothPlanBloqueGuias guias={guias} vacio="Nada sin bloque." />}
      </div>
    </div>
  );
}
