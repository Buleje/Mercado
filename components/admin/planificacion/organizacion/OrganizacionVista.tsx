"use client";

/**
 * Planificación › Organización (ADR-497): el organigrama (áreas y cargos) y
 * los espacios (croquis y zonas). Dos secciones en `?sub=`.
 */
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { VistaConSecciones } from "../piezas/VistaConSecciones";
import { Espacios } from "./Espacios";
import { Organigrama } from "./Organigrama";

export const SUBS_ORGANIZACION = ["organigrama", "espacios"] as const;
export type SubOrganizacion = (typeof SUBS_ORGANIZACION)[number];

const ROTULO: Record<SubOrganizacion, string> = { organigrama: "Organigrama", espacios: "Espacios" };

export function OrganizacionVista() {
  const organizacion = useSeccionPlan("organizacion").datos;
  const espacios = useSeccionPlan("espacios").datos;
  return (
    <VistaConSecciones
      moduleId="planificacion-organizacion"
      claves={SUBS_ORGANIZACION}
      rotulos={ROTULO}
      cuentas={{ organigrama: organizacion.cargos.length, espacios: espacios.croquis.length + espacios.zonas.length }}
      etiqueta="Secciones de Organización"
      idPanel="plan-organizacion-panel"
    >
      {(sub) => (sub === "organigrama" ? <Organigrama /> : <Espacios />)}
    </VistaConSecciones>
  );
}
