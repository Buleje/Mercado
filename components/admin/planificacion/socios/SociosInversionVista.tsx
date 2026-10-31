"use client";

/**
 * Planificación › Socios e inversión (ADR-497): quiénes son dueños y cuánto
 * puso cada uno, y en qué se invirtió y de dónde salió la plata. Son datos
 * sensibles: el servidor los esconde a quien no es admin o dueño, y la vista
 * sólo muestra los bloques que llegaron.
 */
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { usePlanEmpresa } from "@/hooks/use-plan-empresa";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { InversionTabla } from "./InversionTabla";
import { SociosTabla } from "./SociosTabla";

export type SubSocios = "socios" | "inversion";
const SUBS: readonly SubSocios[] = ["socios", "inversion"];
const ROTULO: Record<SubSocios, string> = { socios: "Socios", inversion: "Inversión inicial" };
const ID_PANEL = "plan-socios-panel";

export function SociosInversionVista() {
  const { ocultas } = usePlanEmpresa();
  const visibles = SUBS.filter((s) => !ocultas.includes(s));
  const validas = visibles.length > 0 ? visibles : SUBS;
  const { vista: sub, irA } = useSubvistaModulo<SubSocios>("planificacion-socios", validas, validas[0]);

  return (
    <div className="space-y-4">
      {validas.length > 1 ? (
        <BarraDeSecciones
          secciones={validas.map((clave) => ({ clave, rotulo: ROTULO[clave] }))}
          activa={sub}
          onCambiar={irA}
          etiqueta="Secciones de Socios e inversión"
          idPanel={ID_PANEL}
        />
      ) : null}
      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, sub)} className="space-y-4">
        {sub === "socios" ? <SociosTabla /> : <InversionTabla />}
      </div>
    </div>
  );
}
