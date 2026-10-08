import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";

/**
 * Una guía, una sola plata (ADR-478 §7) — la regla al revés, en UN lugar. Si la
 * madera de la guía ya se pagó con una cubicación de trozas aplicada, ponerle
 * costo la valoriza dos veces: en el libro y en Finanzas como costo, y en el
 * adelanto como entrega (revisión M, 08-10: sólo la miraba el modal).
 *
 * Las puertas por las que un costo llega a una guía (revisión 08-10: eran
 * cinco, no tres; el test `__tests__/guia-cubicacion-puertas.test.ts` exige que
 * toda escritura de `costoTotal` con valor pase por acá):
 *   1. `GuiaPlataDB.guardarCompra` — el modal de la plata de la guía;
 *   2. `WoodEntriesDB.setCosto` — el costo de un ingreso (la guía se relee
 *      bajo el lock: pudo mudarse de guía antes de la tx);
 *   3. `WoodEntriesPrecioDB.ponerPrecio` — la tanda de precios;
 *   4. `WoodEntriesDB.create` — el alta de un ingreso que trae `costoTotal`;
 *   5. `WoodEntriesDB.update` — mudar a otra guía un asiento que ya tiene costo
 *      (se mira la guía de DESTINO).
 * Y una sexta que se cerró sin esta consulta: `WoodEntriesDB.validate` ya no
 * revive un asiento rechazado o anulado (su costo volvía a contar en la guía).
 * Quitar el costo (null) nunca se frena: no pone plata.
 *
 * Se llama DENTRO de la tx y bajo el lock de la guía
 * (`ForestCuentaDB.bloquearGuiasEnTx`), el mismo que toma «aplicar».
 *
 * La guía se compara con `mismoNumeroGtf` («10-1-5» = «010-001-0000005»), nunca
 * por el texto exacto: la base trae las candidatas por la cola del número y el
 * filtro fino es la regla única del libro.
 */

/** El filtro amplio por N° de guía: lo que termina igual. `null` = no hay número. */
export function filtroMismaGuia(gtf: string | null | undefined): { endsWith: string; mode: "insensitive" } | null {
  const cola = colaDeGtf(gtf);
  return cola ? { endsWith: cola, mode: "insensitive" } : null;
}

/** La cubicación APLICADA que ya pagó la madera de esa guía, o `null`. */
export async function cubicacionQuePagoLaGuia(
  db: Pick<Prisma.TransactionClient, "forestCubicacionTrozas">,
  tenantId: string,
  gtf: string | null | undefined,
  exceptoId?: string,
): Promise<{ codigo: string } | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const filtro = filtroMismaGuia(gtf);
  if (!filtro) return null;
  const filas = await db.forestCubicacionTrozas.findMany({
    where: { tenantId, gtfNumber: filtro, estado: "aplicada", deletedAt: null, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    select: { codigo: true, gtfNumber: true },
    take: 200,
  });
  const igual = filas.find((f) => mismoNumeroGtf(f.gtfNumber, gtf));
  return igual ? { codigo: igual.codigo } : null;
}

/** El mensaje, igual en las cinco puertas. */
export const mensajeGuiaPagadaPorCubicacion = (gtf: string, codigo: string): string =>
  `La madera de la guía ${gtf} ya se pagó con la cubicación ${codigo}. Anúlala (Herramientas › Cubicador de trozas) antes de ponerle costo a la guía.`;
