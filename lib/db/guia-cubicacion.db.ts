import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { colaDeGtf, mismoNumeroGtf, puedeSerLaMismaGtf } from "@/lib/forestal/gtf-talonario";

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
 * La guía se compara con `puedeSerLaMismaGtf` («10-1-5» = «010-001-0000005», y
 * «065» escrito corto = «019-001-0000065»), nunca por el texto exacto: la base
 * trae las candidatas por la cola del número (la misma que el candado,
 * `claveCandadoGtf`) y el filtro fino es la regla de los frenos de plata.
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
  const igual = filas.find((f) => puedeSerLaMismaGtf(f.gtfNumber, gtf));
  return igual ? { codigo: igual.codigo } : null;
}

/**
 * Las líneas de despacho vivas con esa GTF de salida (la cola del N° y
 * `mismoNumeroGtf`), con el N° como está en el libro: la guía puede juntar
 * varias líneas (`mismaGuiaQue`), y una cubicación de venta de una cobra la
 * madera de todas. `paraElFreno`: con `puedeSerLaMismaGtf` («065» trae también
 * las de «019-001-0000065»), para los candados y frenos de plata; sin eso, la
 * regla estricta (nombrar la guía como la escribe el despacho no adivina serie).
 */
export async function despachosDeLaGuiaDeSalida(
  db: Pick<Prisma.TransactionClient, "forestCtpEntry">,
  tenantId: string,
  gtf: string,
  paraElFreno = false,
): Promise<{ id: string; gtfNumber: string }[]> {
  if (!tenantId) throw new Error("tenantId is required");
  const filas = await db.forestCtpEntry.findMany({
    where: { tenantId, section: "despacho", deletedAt: null, status: { not: "anulado" }, gtfNumber: filtroMismaGuia(gtf) ?? gtf },
    select: { id: true, gtfNumber: true },
    orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }, { id: "asc" }],
    take: 200,
  });
  return filas.flatMap((f) => (f.gtfNumber && (f.gtfNumber === gtf || (paraElFreno ? puedeSerLaMismaGtf : mismoNumeroGtf)(f.gtfNumber, gtf)) ? [{ id: f.id, gtfNumber: f.gtfNumber.trim() }] : []));
}

/**
 * Los candados `cub:{tenant}:despacho:{id}` de esas líneas, en orden de id
 * (sin orden, dos cobros se abrazan en deadlock). Siempre DESPUÉS de los de la
 * guía y ANTES de los de la persona (ADR-483 §7): los toman «aplicar» una
 * cubicación y «Anotar la venta de la guía».
 */
export async function bloquearLineasDeDespachoEnTx(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  ids: readonly string[],
): Promise<string[]> {
  if (!tenantId) throw new Error("tenantId is required");
  const orden = [...new Set(ids)].sort();
  for (const l of orden) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cub:${tenantId}:despacho:${l}`}))`;
  return orden;
}

/**
 * La cubicación de VENTA aplicada que ya cobró esa guía de salida, o `null`
 * (ADR-484): por su N° (`puedeSerLaMismaGtf`) o por una de sus líneas de despacho
 * —la cubicación pudo aplicarse cuando el despacho aún no tenía guía, o cuando
 * el adelanto cubrió todo y no dejó cargo en la cuenta—. Bajo el candado de la
 * guía y el de sus líneas.
 */
export async function cubicacionQueVendioLaGuia(
  db: Pick<Prisma.TransactionClient, "forestCubicacionTrozas">,
  tenantId: string,
  gtf: string,
  lineasIds: readonly string[],
  exceptoId?: string,
): Promise<{ codigo: string } | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const cuales: Prisma.ForestCubicacionTrozasWhereInput[] = [
    { sentido: "venta", gtfNumber: filtroMismaGuia(gtf) ?? gtf },
    ...(lineasIds.length > 0 ? [{ origen: "despacho", origenId: { in: [...lineasIds] } }] : []),
  ];
  const filas = await db.forestCubicacionTrozas.findMany({
    where: { tenantId, estado: "aplicada", deletedAt: null, OR: cuales, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
    select: { codigo: true, sentido: true, gtfNumber: true, origen: true, origenId: true },
    take: 200,
  });
  const cobro = filas.find(
    (f) => (f.origen === "despacho" && f.origenId != null && lineasIds.includes(f.origenId)) || (f.sentido === "venta" && (f.gtfNumber?.trim() === gtf || puedeSerLaMismaGtf(f.gtfNumber, gtf))),
  );
  return cobro ? { codigo: cobro.codigo } : null;
}

/** El mensaje, igual en las cinco puertas. */
export const mensajeGuiaPagadaPorCubicacion = (gtf: string, codigo: string): string =>
  `La madera de la guía ${gtf} ya se pagó con la cubicación ${codigo}. Anúlala (Herramientas › Cubicador de trozas) antes de ponerle costo a la guía.`;
