/**
 * «La guía llena la ficha» (Brandon 24-10): con el N° de GTF escrito en el
 * modal «Guardar cubicación», la CCNN, el permiso, la placa, el chofer y el
 * destino salen de la guía emitida. Sólo se llenan los VACÍOS: lo escrito a
 * mano nunca se pisa.
 */
import { FICHA_MAX, type FichaCubicacion } from "@/lib/forestal/cubicacion-registro";

/** Lo único que el endpoint devuelve de la guía (sin piezas ni datos internos). */
export interface GuiaParaFicha {
  gtfNumber: string;
  titularName: string | null;
  tituloHabilitante: string | null;
  placaVehiculo: string | null;
  conductor: string | null;
  destino: string | null;
}

export type CampoLlenable = "comunidad" | "tituloHabilitante" | "placa" | "chofer" | "destino";

const ORIGEN: Record<CampoLlenable, (g: GuiaParaFicha) => string | null> = {
  comunidad: (g) => g.titularName,
  tituloHabilitante: (g) => g.tituloHabilitante,
  placa: (g) => g.placaVehiculo,
  chofer: (g) => g.conductor,
  destino: (g) => g.destino,
};

const limpio = (v: string | null | undefined) => v?.trim().slice(0, FICHA_MAX) || "";

/**
 * Lo que la guía aporta a la ficha: sólo los campos que la ficha tiene vacíos y
 * la guía trae. `campos` dice cuáles se llenaron (para el aviso y el deshacer).
 */
export function llenarFichaDesdeGuia(
  ficha: FichaCubicacion,
  guia: GuiaParaFicha,
): { patch: Partial<FichaCubicacion>; campos: CampoLlenable[] } {
  const patch: Partial<FichaCubicacion> = {};
  const campos: CampoLlenable[] = [];
  for (const k of Object.keys(ORIGEN) as CampoLlenable[]) {
    if (ficha[k]?.trim()) continue;
    const v = limpio(ORIGEN[k](guia));
    if (!v) continue;
    patch[k] = k === "placa" ? v.toUpperCase() : v;
    campos.push(k);
  }
  return { patch, campos };
}

/**
 * Deshace un llenado: quita cada campo que puso la guía y sigue valiendo lo
 * mismo (lo que escribiste después se queda).
 */
export function revertirLlenado(ficha: FichaCubicacion, patch: Partial<FichaCubicacion>): FichaCubicacion {
  const sale = { ...ficha };
  for (const k of Object.keys(patch) as (keyof FichaCubicacion)[]) {
    if (sale[k] === patch[k]) delete sale[k];
  }
  return sale;
}
