"use client";

/**
 * Planificación › Políticas y atención (ADR-497): las políticas por
 * categoría, el protocolo de atención y las preguntas frecuentes. Tres
 * secciones en `?sub=`, todas sobre la misma sección del plan.
 */
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { VistaConSecciones } from "../piezas/VistaConSecciones";
import { PoliticasLista } from "./PoliticasLista";
import { PreguntasFrecuentes } from "./PreguntasFrecuentes";
import { ProtocoloAtencion } from "./ProtocoloAtencion";

export const SUBS_POLITICAS = ["politicas", "protocolo", "preguntas"] as const;
export type SubPoliticas = (typeof SUBS_POLITICAS)[number];

const ROTULO: Record<SubPoliticas, string> = { politicas: "Políticas", protocolo: "Protocolo de atención", preguntas: "Preguntas frecuentes" };

export function PoliticasVista() {
  const { datos } = useSeccionPlan("politicas");
  return (
    <VistaConSecciones
      moduleId="planificacion-politicas"
      claves={SUBS_POLITICAS}
      rotulos={ROTULO}
      cuentas={{ politicas: datos.items.length, protocolo: datos.protocolo.length, preguntas: datos.preguntas.length }}
      etiqueta="Secciones de Políticas"
      idPanel="plan-politicas-panel"
    >
      {(sub) => (sub === "politicas" ? <PoliticasLista /> : sub === "protocolo" ? <ProtocoloAtencion /> : <PreguntasFrecuentes />)}
    </VistaConSecciones>
  );
}
