/**
 * El schema de la parte trasera que viaja con un ANEXO N° 04 emitido (Brandon,
 * 2026-10-03: «croquis al re-descargar»). Vive aparte del route para poder
 * testearlo (un `route.ts` sólo exporta sus handlers) y fuera de
 * `anexo04-registro` para que zod no entre al bundle del cliente por ahí.
 *
 * Lo justo para redibujar: medidas, unidades y especie de cada fila, el ancho
 * del camión y el catálogo de colores. Sin volumen: el croquis lo recalcula
 * desde las medidas, así que no hay número del cliente que creer.
 */
import { z } from "zod";
import { ANCHO_CAMION_M_MAX, ANCHO_CAMION_M_MIN } from "./camion-croquis";
import type { TraseraGuardada } from "./anexo04-registro";

/** Filas de la trasera por emitido: un camión real son decenas; esto protege el KV de la bandeja. */
export const MAX_FILAS_TRASERA = 600;

const unidad = z.enum(["pulg", "cm", "pies", "m"]);

export const traseraRegistroSchema = z.object({
  anchoM: z.coerce.number().min(ANCHO_CAMION_M_MIN).max(ANCHO_CAMION_M_MAX),
  catalogo: z.array(z.string().trim().max(60)).max(60).optional(),
  piezas: z.array(z.object({
    id: z.string().trim().max(60).optional(),
    cantidad: z.coerce.number().int().positive().max(99999),
    espesor: z.coerce.number().positive().max(999),
    ancho: z.coerce.number().positive().max(999),
    largo: z.coerce.number().positive().max(999),
    uEspesor: unidad.optional(),
    uAncho: unidad.optional(),
    uLargo: unidad.optional(),
    especie: z.string().trim().max(60).nullish(),
  })).min(1).max(MAX_FILAS_TRASERA),
});

export type TraseraDelBody = z.infer<typeof traseraRegistroSchema>;

/** La trasera validada, con las unidades por omisión del anexo (pulgadas y pies). */
export function traseraDelBody(t: TraseraDelBody): TraseraGuardada {
  return {
    anchoM: t.anchoM,
    piezas: t.piezas.map((p, i) => ({
      id: p.id ?? `t-${i}`,
      cantidad: p.cantidad,
      espesor: p.espesor, ancho: p.ancho, largo: p.largo,
      uEspesor: p.uEspesor ?? "pulg", uAncho: p.uAncho ?? "pulg", uLargo: p.uLargo ?? "pies",
      ...(p.especie ? { especie: p.especie } : {}),
    })),
    ...(t.catalogo && t.catalogo.length > 0 ? { catalogo: t.catalogo } : {}),
  };
}
