/**
 * «La guía llena el viaje» (Brandon 28-10): con el N° de GTF de salida de un
 * viaje, la placa, el chofer y el destino salen de la guía emitida (la misma
 * búsqueda de la ficha). Sólo se llenan los VACÍOS; lo escrito nunca se pisa.
 * La guía no trae «a quién» (su destinatario no se guarda como campo).
 */
import type { CampoLlenable, GuiaParaFicha } from "./cubicacion-desde-guia";

export type CampoDelViaje = Extract<CampoLlenable, "placa" | "chofer" | "destino">;
export type DatosLlenables = Record<CampoDelViaje, string>;

const ORIGEN: Record<CampoDelViaje, (g: GuiaParaFicha) => string | null> = {
  placa: (g) => g.placaVehiculo,
  chofer: (g) => g.conductor,
  destino: (g) => g.destino,
};

export function llenarViajeDesdeGuia(actual: DatosLlenables, guia: GuiaParaFicha): { patch: Partial<DatosLlenables>; campos: CampoDelViaje[] } {
  const patch: Partial<DatosLlenables> = {};
  const campos: CampoDelViaje[] = [];
  for (const k of Object.keys(ORIGEN) as CampoDelViaje[]) {
    if (actual[k].trim()) continue;
    const v = ORIGEN[k](guia)?.trim().slice(0, 120);
    if (!v) continue;
    patch[k] = k === "placa" ? v.toUpperCase() : v;
    campos.push(k);
  }
  return { patch, campos };
}

/** Quita lo que puso la guía y sigue valiendo lo mismo (lo escrito después se queda). */
export function revertirViaje<T extends DatosLlenables>(actual: T, patch: Partial<DatosLlenables>): T {
  const sale = { ...actual };
  for (const k of Object.keys(patch) as CampoDelViaje[]) if (sale[k] === patch[k]) sale[k] = "";
  return sale;
}
