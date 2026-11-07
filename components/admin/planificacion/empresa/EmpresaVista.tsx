"use client";

/**
 * Planificación › Empresa (ADR-497): ficha, identidad, modelo de negocio y
 * papeles. Cuatro bloques en `?sub=`; se ve uno a la vez y la vista recuerda
 * el último.
 */
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { estadoLicencia } from "@/lib/planificacion/calculos";
import { limaDateKey } from "@/lib/utils";
import { FichaEmpresa } from "./FichaEmpresa";
import { IdentidadEmpresa } from "./IdentidadEmpresa";
import { LicenciasTabla } from "./LicenciasTabla";
import { LienzoNegocio } from "./LienzoNegocio";

export type SubEmpresa = "ficha" | "identidad" | "lienzo" | "licencias";
const SUBS: readonly SubEmpresa[] = ["ficha", "identidad", "lienzo", "licencias"];
const ROTULO: Record<SubEmpresa, string> = {
  ficha: "Ficha",
  identidad: "Misión y valores",
  lienzo: "Modelo de negocio",
  licencias: "Licencias",
};
const ID_PANEL = "plan-empresa-panel";

export function EmpresaVista() {
  const { vista: sub, irA } = useSubvistaModulo<SubEmpresa>("planificacion-empresa", SUBS, "ficha");
  const { datos: licencias } = useSeccionPlan("licencias");
  const hoy = limaDateKey();
  const porAtender = licencias.items.filter((l) => {
    const e = estadoLicencia(l, hoy).estado;
    return e === "vencida" || e === "por-vencer";
  }).length;
  const secciones = SUBS.map((clave) => ({ clave, rotulo: ROTULO[clave], cuenta: clave === "licencias" ? porAtender : undefined }));

  return (
    <div className="space-y-4">
      <BarraDeSecciones secciones={secciones} activa={sub} onCambiar={irA} etiqueta="Secciones de Empresa" idPanel={ID_PANEL} />
      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, sub)} className="space-y-4">
        {sub === "ficha" && <FichaEmpresa />}
        {sub === "identidad" && <IdentidadEmpresa />}
        {sub === "lienzo" && <LienzoNegocio />}
        {sub === "licencias" && <LicenciasTabla />}
      </div>
    </div>
  );
}
