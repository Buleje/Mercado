"use client";

/**
 * La barra de pasos del formulario del plan y el «Anterior / Siguiente» de
 * abajo (Brandon 24-10: «ir bloque a bloque»). El dibujo es el de
 * `components/admin/shared/barra-de-pasos` (lo comparte con la ficha del
 * Directorio); acá sólo se dice qué pasos tiene el plan y cómo está cada uno.
 * Reglas: `lib/forestal/loth-plan-pasos.ts`.
 */

import { estadoDelPaso } from "@/lib/forestal/loth-plan-pasos";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";
import { AnteriorSiguiente as AnteriorSiguienteComun, BarraDePasos as BarraComun } from "@/components/admin/shared/barra-de-pasos";

/** Arriba del formulario, pegada al borde: queda a la vista aunque el paso sea largo. */
export function BarraDePasos({ form }: { form: LothPlanFormEstado }) {
  const { pasos, paso, setPaso, esenciales, intentoGuardar } = form;
  return (
    <BarraComun
      etiqueta="Pasos del plan"
      pasos={pasos.map((p) => ({ ...p, estado: estadoDelPaso(p.id, esenciales, intentoGuardar) }))}
      actual={paso}
      onIr={setPaso}
    />
  );
}

/** Al final de cada paso: volver o seguir, diciendo a dónde. «Crear» está siempre en el pie. */
export function AnteriorSiguiente({ form }: { form: LothPlanFormEstado }) {
  return <AnteriorSiguienteComun pasos={form.pasos} actual={form.paso} onIr={form.setPaso} />;
}
