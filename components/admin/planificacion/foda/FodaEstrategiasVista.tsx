"use client";

/**
 * Planificación › FODA y estrategias (ADR-497): dos secciones en `?sub=`. El
 * FODA se escribe en su grilla; las estrategias lo cruzan y cada una puede
 * volverse un objetivo.
 */
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { VistaConSecciones } from "../piezas/VistaConSecciones";
import { EstrategiasMatriz } from "./EstrategiasMatriz";
import { FodaGrilla } from "./FodaGrilla";
import { ORDEN_GRILLA } from "./foda-config";

export const SUBS_FODA = ["foda", "estrategias"] as const;
export type SubFoda = (typeof SUBS_FODA)[number];

const ROTULO: Record<SubFoda, string> = { foda: "FODA", estrategias: "Estrategias" };

export function FodaEstrategiasVista() {
  const { datos: foda } = useSeccionPlan("foda");
  const { datos: estrategias } = useSeccionPlan("estrategias");
  const puntos = ORDEN_GRILLA.reduce((n, c) => n + foda[c].length, 0);

  return (
    <VistaConSecciones
      moduleId="planificacion-foda"
      claves={SUBS_FODA}
      rotulos={ROTULO}
      cuentas={{ foda: puntos, estrategias: estrategias.items.length }}
      etiqueta="Secciones de FODA y estrategias"
      idPanel="plan-foda-panel"
    >
      {(sub, irA) => (sub === "foda" ? <FodaGrilla /> : <EstrategiasMatriz irAFoda={() => irA("foda")} />)}
    </VistaConSecciones>
  );
}
