import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";

/**
 * Una guía, una sola plata (ADR-478 §7) — la regla al revés, en UN lugar para
 * las tres puertas que escriben `WoodEntry.costoTotal`: el modal de la plata de
 * la guía (`GuiaPlataDB.guardarCompra`), el costo de un ingreso
 * (`WoodEntriesDB.setCosto`) y la tanda de precios
 * (`WoodEntriesPrecioDB.ponerPrecio`). Si la madera de la guía ya se pagó con
 * una cubicación de trozas aplicada, ponerle costo la valoriza dos veces: en el
 * libro y en Finanzas como costo, y en el adelanto como entrega (revisión M,
 * 08-10: sólo la miraba el modal).
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

/** El mensaje, igual en las tres puertas. */
export const mensajeGuiaPagadaPorCubicacion = (gtf: string, codigo: string): string =>
  `La madera de la guía ${gtf} ya se pagó con la cubicación ${codigo}. Anúlala (Herramientas › Cubicador de trozas) antes de ponerle costo a la guía.`;
