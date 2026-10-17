import "server-only";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { invalidate, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { toNumOrZero } from "@/lib/decimal-utils";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import type { Prisma } from "@/lib/generated/prisma/client";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";
import {
  diaDeCaja, egresoDeCajaEnTx, etiquetaGasto, etiquetaGastoBorrado, etiquetaPagoAProveedor,
  idDevolucionDeGasto, idRetiroDeGasto,
} from "@/lib/caja/egreso-de-caja";
import { CashRegistersMovementsDB } from "./cash-registers-movements.db";
import { contratoPropio } from "./contrato-propio.db";
import { ExpensesDB, PayablesDB, revalidarGastosAlInstante, type DbExpense } from "./finance.db";
import { invalidarIgvDelMes } from "./igv-del-mes.db";
import type { DbPayable, DbPayment } from "./misc.db";

/**
 * GastoConCajaDB — el gasto (o el pago a un proveedor) Y su salida de la caja,
 * en UNA transacción (contrato «sale de la caja», ver `lib/caja/egreso-de-caja.ts`).
 *
 * Sin `salidaDeCaja` delega tal cual en `ExpensesDB.add` / `PayablesDB.addPayment`:
 * ese camino no cambia. Con `salidaDeCaja` repite la escritura de esos dos
 * métodos con el cliente de la transacción, porque ninguno acepta uno. Si algún
 * día lo aceptan, esta clase se reduce a llamarlos con `tx` (receta en el
 * reporte del carril GAS, 2026-10-09).
 *
 * Orden de locks: la cuenta por pagar (`FOR UPDATE`) primero, la caja
 * (`FOR SHARE`, `egresoDeCajaEnTx`) al final, pegada al commit — el mismo orden
 * global de `lib/adelantos/movimiento-caja.ts`.
 *
 * El retiro de un gasto lleva un id derivado del gasto (`idRetiroDeGasto`): así
 * corregir el monto o borrar el gasto encuentra su retiro sin columna nueva.
 * Mientras la caja siga abierta, el retiro acompaña al gasto (se ajusta, o la
 * plata vuelve con un «Gasto borrado»); con la caja ya cerrada no se toca y la
 * respuesta lo avisa, porque el arqueo de ese día ya se contó.
 */

/** Lo que la pantalla necesita saber de la caja después del pago. */
export interface CajaDelPago {
  /** `true` = no había caja abierta: el gasto quedó, el cajón no se tocó. */
  sinCaja: boolean;
}

/** Qué pasó con el retiro de caja al corregir o borrar su gasto. */
export interface CajaDelCambio {
  /** `ajustado`/`devuelto` = caja abierta, se movió con el gasto; `cerrada` = no se tocó. */
  retiro: "ajustado" | "devuelto" | "cerrada";
  /** Para la pantalla, en palabras. */
  aviso: string;
}

/** No se puede hacer este cambio sin descuadrar la caja abierta (→ 409). */
export class RetiroEnCajaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "RetiroEnCajaError";
  }
}

type CorreccionGasto = Parameters<typeof ExpensesDB.update>[2];

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const redondear = (n: number) => Math.round(n * 100) / 100;
const queDelGasto = (descripcion: string | null | undefined, categoria: string) =>
  decodeExpenseDescription(descripcion ?? "").description.trim() || categoria;

/** El retiro de caja de un gasto, si salió del cajón (`null` = no salió). */
async function leerRetiro(tenantId: string, gastoId: string) {
  const mov = await prisma.cashMovement.findFirst({
    where: { id: idRetiroDeGasto(gastoId), cashRegister: { tenantId } },
    select: { amount: true, cashRegisterId: true, cashRegister: { select: { status: true, openedAt: true } } },
  });
  if (!mov) return null;
  return {
    monto: toNumOrZero(mov.amount),
    cajaId: mov.cashRegisterId,
    abierta: mov.cashRegister.status === "abierta",
    dia: diaDeCaja(mov.cashRegister.openedAt),
  };
}

/** Anota en la caja ABIERTA con un id elegido (el `moverCajaEnTx` de adelantos no lo acepta). */
async function anotarEnCajaAbiertaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  mov: { id: string; monto: number; etiqueta: string },
): Promise<{ sinCaja: boolean }> {
  const caja = await CashRegistersMovementsDB.bloquearCajaAbiertaEnTx(tx, tenantId);
  if (!caja) {
    logger.warn("[gasto-con-caja] sin caja abierta: el retiro no se anota", { tenantId, etiqueta: mov.etiqueta });
    return { sinCaja: true };
  }
  await tx.cashMovement.create({
    data: { id: mov.id, cashRegisterId: caja.id, type: "egreso", amount: redondear(mov.monto), method: "efectivo", description: mov.etiqueta },
  });
  return { sinCaja: false };
}

/** Lo mismo que escribe `ExpensesDB.update`, para hacerlo dentro de la tx. */
function datosDeCorreccion(patch: CorreccionGasto, recurring: boolean): Prisma.ExpenseUpdateManyMutationInput {
  const data: Prisma.ExpenseUpdateManyMutationInput = {};
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.amount !== undefined) data.amount = patch.amount;
  if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
  if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.date !== undefined) {
    const fecha = new Date(patch.date);
    data.date = fecha;
    if (!recurring) data.paidAt = fecha;
  }
  return data;
}

/** El pago pasa el saldo de la cuenta (otro lo pagó mientras tanto). */
export class PagoExcedeSaldoError extends Error {
  constructor(public readonly restante: number) {
    super(`El pago excede el saldo pendiente (S/${restante.toFixed(2)})`);
    this.name = "PagoExcedeSaldoError";
  }
}

function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* fuera de un request (test/script): la invalidación no es crítica */
  }
}

/** Lo mismo que invalida `ExpensesDB.add` (privado allá) + la caja. */
function revalidarTrasEgreso(tenantId: string, gasto: boolean): void {
  if (gasto) {
    revalidarGastosAlInstante(tenantId);
    safeRevalidate(`tenant:${tenantId}:cash-flow`);
    try {
      invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
    } catch (err) {
      logger.warn("[gasto-con-caja] no se pudo invalidar el resultado del negocio", { error: String(err), tenantId });
    }
    invalidarIgvDelMes(tenantId);
  } else {
    safeRevalidate(`tenant:${tenantId}:payables`);
  }
  /* El aviso del panel cachea 60 s la cuenta de la caja abierta. */
  invalidate(`admin:alerts-summary:${tenantId}`);
}

export const GastoConCajaDB = {
  /**
   * El retiro de caja de cada gasto de la lista (los que no salieron del cajón
   * no aparecen). Es lo que la confirmación de borrar le cuenta a la persona:
   * «vuelven al cajón» con la caja abierta, «esa caja no cambia» si ya cerró —
   * la misma regla que aplica `borrarGasto`. Una consulta por PK (`id in`).
   */
  async retirosDeGastos(
    tenantId: string,
    gastoIds: readonly string[],
  ): Promise<Record<string, { monto: number; abierta: boolean; dia: string }>> {
    if (!tenantId) throw new Error("tenantId is required");
    if (gastoIds.length === 0) return {};
    const porRetiro = new Map(gastoIds.map((id) => [idRetiroDeGasto(id), id]));
    const movs = await prisma.cashMovement.findMany({
      where: { id: { in: [...porRetiro.keys()] }, cashRegister: { tenantId } },
      select: { id: true, amount: true, cashRegister: { select: { status: true, openedAt: true } } },
    });
    const out: Record<string, { monto: number; abierta: boolean; dia: string }> = {};
    for (const m of movs) {
      const gastoId = porRetiro.get(m.id);
      if (!gastoId) continue;
      out[gastoId] = {
        monto: toNumOrZero(m.amount),
        abierta: m.cashRegister.status === "abierta",
        dia: diaDeCaja(m.cashRegister.openedAt),
      };
    }
    return out;
  },

  /** Registra un gasto; si `salidaDeCaja`, anota su egreso en la caja abierta. */
  async registrarGasto(
    tenantId: string,
    data: Omit<DbExpense, "id" | "createdAt">,
    opciones: { salidaDeCaja: boolean },
  ): Promise<{ gasto: DbExpense; caja: CajaDelPago | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!opciones.salidaDeCaja) {
      return { gasto: await ExpensesDB.add(tenantId, data), caja: null };
    }
    const fecha = new Date(data.date);
    const contratoId = await contratoPropio(tenantId, data.contratoId);
    const que = decodeExpenseDescription(data.description ?? "").description.trim() || data.category;
    const { id, sinCaja } = await prisma.$transaction(async (tx) => {
      const row = await tx.expense.create({
        data: {
          tenantId,
          category: data.category, description: data.description, amount: data.amount,
          date: fecha, recurring: false,
          frequency: data.frequency ?? null,
          paymentDay: data.paymentDay ?? null,
          paymentMethod: data.paymentMethod ?? null,
          supplierName: data.supplierName ?? null,
          supplierId: data.supplierId ?? null,
          documentType: data.documentType ?? null,
          documentNumber: data.documentNumber ?? null,
          supplierRuc: data.supplierRuc ?? null,
          igvAmount: data.igvAmount ?? null,
          afectoIgv: data.afectoIgv ?? false,
          attachmentUrl: data.attachmentUrl ?? null,
          costCenter: data.costCenter ?? null,
          createdBy: data.createdBy ?? null,
          notes: data.notes ?? null,
          templateId: data.templateId ?? null,
          contratoId,
          // Salió del cajón: el pago es ahora, o la fecha que diga el gasto.
          paidAt: data.paidAt ? new Date(data.paidAt) : fecha,
        },
        select: { id: true },
      });
      // La caja, ÚLTIMO lock. El id del retiro sale del gasto: corregir o borrar lo encuentra.
      const mov = await anotarEnCajaAbiertaEnTx(tx, tenantId, {
        id: idRetiroDeGasto(row.id), monto: data.amount, etiqueta: etiquetaGasto(que),
      });
      return { id: row.id, sinCaja: mov.sinCaja };
    });
    revalidarTrasEgreso(tenantId, true);
    if (!sinCaja) invalidarVentasOverview(tenantId);
    const gasto = await ExpensesDB.getById(tenantId, id);
    if (!gasto) throw new Error("El gasto se guardó pero no se pudo releer");
    return { gasto, caja: { sinCaja } };
  },

  /**
   * Corrige un gasto. Si salió de la caja y cambia el monto: con la caja abierta
   * el retiro se ajusta en la misma tx; con la caja cerrada no se toca y vuelve
   * el aviso. Pasarlo a otro medio con la caja abierta = `RetiroEnCajaError`
   * (la plata ya salió del cajón: se borra y se registra de nuevo).
   */
  async corregirGasto(
    tenantId: string,
    id: string,
    patch: CorreccionGasto,
  ): Promise<{ gasto: DbExpense | null; caja: CajaDelCambio | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    const retiro = await leerRetiro(tenantId, id);
    const nuevo = patch.amount !== undefined ? redondear(patch.amount) : null;
    const cambiaMonto = retiro != null && nuevo != null && nuevo !== retiro.monto;
    const dejaEfectivo = retiro != null && patch.paymentMethod !== undefined
      && String(patch.paymentMethod ?? "").trim().toLowerCase() !== "efectivo";
    if (!retiro || (!cambiaMonto && !dejaEfectivo)) {
      return { gasto: await ExpensesDB.update(tenantId, id, patch), caja: null };
    }
    const avisoCerrada = (): CajaDelCambio => ({
      retiro: "cerrada",
      aviso: `El retiro de ${soles(retiro.monto)} quedó en la caja del ${retiro.dia}, que ya se cerró: su arqueo no cambia con esta corrección.`,
    });
    if (!retiro.abierta) {
      const gasto = await ExpensesDB.update(tenantId, id, patch);
      return { gasto, caja: gasto ? avisoCerrada() : null };
    }
    if (dejaEfectivo) {
      throw new RetiroEnCajaError(
        `Este gasto sacó ${soles(retiro.monto)} del cajón en efectivo. Para cambiar el medio, bórralo (la plata vuelve a la caja) y regístralo de nuevo.`,
      );
    }
    const actual = await prisma.expense.findFirst({ where: { id, tenantId }, select: { recurring: true, description: true, category: true } });
    if (!actual || nuevo == null) return { gasto: null, caja: null };
    const que = queDelGasto(patch.description ?? actual.description, patch.category ?? actual.category);
    const estado = await prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({ where: { id, tenantId }, data: datosDeCorreccion(patch, actual.recurring) });
      // La caja, ÚLTIMO lock; releída bajo el lock por si la cerraron recién.
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, retiro.cajaId);
      if (caja?.status !== "abierta") return "cerrada" as const;
      await tx.cashMovement.updateMany({
        where: { id: idRetiroDeGasto(id), cashRegisterId: retiro.cajaId },
        data: { amount: nuevo, description: etiquetaGasto(que) },
      });
      return "ajustado" as const;
    });
    revalidarTrasEgreso(tenantId, true);
    if (estado === "ajustado") invalidarVentasOverview(tenantId);
    const gasto = await ExpensesDB.getById(tenantId, id);
    return {
      gasto,
      caja: estado === "cerrada" ? avisoCerrada() : {
        retiro: "ajustado",
        aviso: `La caja abierta también se corrigió: el retiro pasó de ${soles(retiro.monto)} a ${soles(nuevo)}.`,
      },
    };
  },

  /**
   * Borra un gasto y devuelve lo que borró (el «deshacer» lo re-crea). Si salió
   * de una caja que sigue abierta, la plata vuelve con un ingreso «Gasto
   * borrado» en la misma tx (como la anulación de un adelanto); si la caja ya
   * cerró, no se toca y vuelve el aviso.
   */
  async borrarGasto(tenantId: string, id: string): Promise<{ borrado: DbExpense | null; caja: CajaDelCambio | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    const retiro = await leerRetiro(tenantId, id);
    if (!retiro) return { borrado: await ExpensesDB.delete(tenantId, id), caja: null };
    const existente = await ExpensesDB.getById(tenantId, id);
    if (!existente) return { borrado: null, caja: null };
    const que = queDelGasto(existente.description, existente.category);
    const estado = await prisma.$transaction(async (tx) => {
      const { count } = await tx.expense.deleteMany({ where: { id, tenantId } });
      if (count === 0) return null;
      // La caja, ÚLTIMO lock; releída bajo el lock por si la cerraron recién.
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, retiro.cajaId);
      if (caja?.status !== "abierta") return "cerrada" as const;
      await tx.cashMovement.create({
        data: {
          id: idDevolucionDeGasto(id), cashRegisterId: retiro.cajaId, type: "ingreso",
          amount: retiro.monto, method: "efectivo", description: etiquetaGastoBorrado(que),
        },
      });
      return "devuelto" as const;
    });
    if (!estado) return { borrado: null, caja: null };
    revalidarTrasEgreso(tenantId, true);
    if (estado === "devuelto") invalidarVentasOverview(tenantId);
    return {
      borrado: existente,
      caja: estado === "devuelto"
        ? { retiro: "devuelto", aviso: `Los ${soles(retiro.monto)} vuelven a la caja abierta: se anotó «Gasto borrado» para que el arqueo cuadre.` }
        : {
          retiro: "cerrada",
          aviso: `El retiro de ${soles(retiro.monto)} quedó en la caja del ${retiro.dia}, que ya se cerró. Si la plata volvió al cajón, anótala como ingreso en la caja de hoy.`,
        },
    };
  },

  /**
   * Un pago de una cuenta por pagar; si `salidaDeCaja`, su egreso en la caja.
   * `null` en `cuenta` = la cuenta no existe en este negocio.
   */
  async pagarCuenta(
    tenantId: string,
    payableId: string,
    pago: DbPayment,
    opciones: { salidaDeCaja: boolean },
  ): Promise<{ cuenta: DbPayable | null; caja: CajaDelPago | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!opciones.salidaDeCaja) {
      return { cuenta: await PayablesDB.addPayment(tenantId, payableId, pago), caja: null };
    }
    const res = await prisma.$transaction(async (tx) => {
      // La cuenta bloqueada: dos pagos a la vez no pueden pasar el saldo.
      const filas = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Payable" WHERE "id" = ${payableId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      if (filas.length === 0) return null;
      const actual = await tx.payable.findFirst({ where: { id: payableId, tenantId } });
      if (!actual) return null;
      const total = toNumOrZero(actual.amount);
      const pagado = toNumOrZero(actual.paidAmount);
      const sumado = pagado + pago.amount;
      if (sumado > total + 0.01) throw new PagoExcedeSaldoError(Math.max(0, total - pagado));
      await tx.payment.create({
        data: { id: pago.id, payableId, amount: pago.amount, method: pago.method, date: new Date(pago.date), reference: pago.reference },
      });
      const status = sumado >= total - 0.01 ? "pagado" : sumado > 0 ? "parcial" : "pendiente";
      await tx.payable.updateMany({ where: { id: payableId, tenantId }, data: { paidAmount: sumado, status } });
      // La caja, ÚLTIMO lock.
      const mov = await egresoDeCajaEnTx(tx, tenantId, {
        monto: pago.amount,
        etiqueta: etiquetaPagoAProveedor(actual.supplierName, actual.description),
      });
      return { sinCaja: mov.sinCaja };
    });
    if (!res) return { cuenta: null, caja: null };
    revalidarTrasEgreso(tenantId, false);
    return { cuenta: await PayablesDB.getById(tenantId, payableId), caja: res };
  },
};
