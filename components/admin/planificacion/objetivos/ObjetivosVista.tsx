"use client";

/**
 * Planificación › Objetivos (ADR-497): la lista con filtros, avance y
 * acciones, y la línea de tiempo por trimestre. Dos secciones en `?sub=`.
 */
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { VistaConSecciones } from "../piezas/VistaConSecciones";
import { LineaDeTiempo } from "./LineaDeTiempo";
import { ObjetivosLista } from "./ObjetivosLista";

export const SUBS_OBJETIVOS = ["lista", "linea"] as const;
export type SubObjetivos = (typeof SUBS_OBJETIVOS)[number];

const ROTULO: Record<SubObjetivos, string> = { lista: "Lista", linea: "Línea de tiempo" };

export function ObjetivosVista() {
  const { datos } = useSeccionPlan("objetivos");
  return (
    <VistaConSecciones
      moduleId="planificacion-objetivos"
      claves={SUBS_OBJETIVOS}
      rotulos={ROTULO}
      cuentas={{ lista: datos.items.length }}
      etiqueta="Secciones de Objetivos"
      idPanel="plan-objetivos-panel"
    >
      {(sub, irA) => (sub === "lista" ? <ObjetivosLista /> : <LineaDeTiempo irALista={() => irA("lista")} />)}
    </VistaConSecciones>
  );
}
