import "server-only";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";
import { diaDeCaja, idDevolucionDeGasto, idRetiroDeGasto } from "@/lib/caja/egreso-de-caja";
import { CashRegistersMovementsDB } from "./cash-registers-movements.db";

/**
 * La caja de un gasto, dentro de la transacción de quien llama: anotar su
 * egreso con un id elegido y devolverlo cuando el gasto se deshace.
 *
 * Una sola copia para los escritores de gastos que salen del cajón (pago al
 * repartidor; `gasto-con-caja.db.ts` tiene la suya privada y puede importar
 * ésta). Los dos usan los ids de `egreso-de-caja`: del gasto a su retiro de
 * caja (`gasto-caja-<gasto>`) y a su devolución (`…-devuelto`), sin columna nueva.
 *
 * Orden de locks: la caja (`FOR SHARE`) va SIEMPRE al final, pegada al commit.
 */

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Anota en la caja ABIERTA con un id elegido (el `moverCajaEnTx` de adelantos no lo acepta). */
export async function anotarEgresoConIdEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  mov: { id: string; monto: number; etiqueta: string },
): Promise<{ sinCaja: boolean }> {
  const caja = await CashRegistersMovementsDB.bloquearCajaAbiertaEnTx(tx, tenantId);
  if (!caja) {
    logger.warn("[caja-de-gasto] sin caja abierta: el retiro no se anota", { tenantId, etiqueta: mov.etiqueta });
    return { sinCaja: true };
  }
  await tx.cashMovement.create({
    data: { id: mov.id, cashRegisterId: caja.id, type: "egreso", amount: redondear(mov.monto), method: "efectivo", description: mov.etiqueta },
  });
  return { sinCaja: false };
}

export type DevolucionDeGasto =
  /** El gasto no salió del cajón: no hay nada que devolver. */
  | { estado: "sin-egreso" }
  /** Ingreso anotado en la caja (que sigue abierta) por el monto del egreso. */
  | { estado: "devuelto"; monto: number; dia: string }
  /** La caja de ese egreso ya cerró: no se toca y quien llama avisa. */
  | { estado: "cerrada"; monto: number; dia: string }
  /** Ya tenía su devolución (lo borraron antes desde Gastos y lo restauraron). */
  | { estado: "ya-devuelto"; monto: number; dia: string };

/**
 * Si el gasto salió de una caja que sigue abierta, la plata vuelve con un
 * ingreso «Gasto borrado · …» (el mismo camino que borrar un gasto en Gastos).
 * Llamarlo DESPUÉS de borrar el gasto en la misma tx: es el último lock.
 */
export async function devolverEgresoDeGastoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  gastoId: string,
  etiqueta: string,
): Promise<DevolucionDeGasto> {
  const idEgreso = idRetiroDeGasto(gastoId);
  const idDevolucion = idDevolucionDeGasto(gastoId);
  const movs = await tx.cashMovement.findMany({
    where: { id: { in: [idEgreso, idDevolucion] }, cashRegister: { tenantId } },
    select: { id: true, amount: true, cashRegisterId: true, cashRegister: { select: { openedAt: true } } },
  });
  const egreso = movs.find((m) => m.id === idEgreso);
  if (!egreso) return { estado: "sin-egreso" };
  const monto = redondear(Number(egreso.amount));
  const dia = diaDeCaja(egreso.cashRegister.openedAt);
  if (movs.some((m) => m.id === idDevolucion)) return { estado: "ya-devuelto", monto, dia };
  // Releída bajo el lock: si la cerraron recién, no se anota en una caja cerrada.
  const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, egreso.cashRegisterId);
  if (caja?.status !== "abierta") return { estado: "cerrada", monto, dia };
  await tx.cashMovement.create({
    data: { id: idDevolucion, cashRegisterId: egreso.cashRegisterId, type: "ingreso", amount: monto, method: "efectivo", description: etiqueta },
  });
  return { estado: "devuelto", monto, dia };
}
