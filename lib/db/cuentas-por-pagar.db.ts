import "server-only";

/**
 * lib/db/cuentas-por-pagar.db.ts — lo que «Compras › Por pagar» necesita además
 * del CRUD de `PayablesDB` (finance.db.ts): de qué orden o papel sale cada
 * deuda (C41-C42) y el estado de cuenta con un proveedor (C48).
 *
 * Todo SIN caché a propósito: frenar un duplicado o publicar un saldo con la
 * lista de hace 30 s (la de `PayablesDB.getAll`, que además se invalida con
 * «max» y sirve la vieja una vez) dejaría pasar justo la cuenta recién creada.
 */
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { revalidateTenantTag } from "@/lib/cache";
import {
  codigoDeOrden,
  descripcionALaVista,
  revisarAlta,
  type CuentaComparable,
  type OrdenSinCuenta,
} from "@/lib/compras/referencia-documento";
import { armarEstadoDeCuenta, type EstadoDeCuenta } from "@/lib/compras/estado-de-cuenta";
import { mapPayable } from "./finance.db";
import { candadoDelProveedor } from "./candado-proveedor";
import type { DbPayable } from "./misc.db";

export type { OrdenSinCuenta };

export type ResultadoVinculo =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string };

export type NuevaCuentaPorPagar = {
  supplierId: string;
  amount: number;
  purchaseOrderId?: string;
  description?: string;
  dueDate?: string;
};

export type ResultadoAlta =
  | { ok: true; cuenta: DbPayable }
  | { ok: false; status: 404 | 409; error: string; duplicada?: { id: string; detalle: string; monto: number } };

/**
 * Alta y vínculo de cuentas de UN proveedor van en fila (revisión de security
 * 17-10): ver `candado-proveedor.ts`. Una orden sólo se cuelga de cuentas de SU
 * proveedor, así que la clave del proveedor también ordena los vínculos.
 */
const candadoPorPagar = (tx: Prisma.TransactionClient, tenantId: string, supplierId: string) =>
  candadoDelProveedor(tx, tenantId, supplierId, "por-pagar");

const SELECT_COMPARABLE = {
  id: true, supplierId: true, description: true, amount: true, paidAmount: true, status: true, purchaseOrderId: true,
} as const;

/**
 * Las cuentas del proveedor (con el comprobante de su orden) y, si se eligió
 * una orden, la cuenta que ya la tenga (sea del proveedor que sea). Dentro de
 * la transacción del alta, después del candado.
 */
async function cuentasParaComparar(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string,
  purchaseOrderId?: string | null,
): Promise<CuentaComparable[]> {
  const cuentas = await tx.payable.findMany({ where: { tenantId, supplierId }, select: SELECT_COMPARABLE });
  const deLaOrden = purchaseOrderId && !cuentas.some((c) => c.purchaseOrderId === purchaseOrderId)
    ? await tx.payable.findFirst({ where: { tenantId, purchaseOrderId }, select: SELECT_COMPARABLE })
    : null;
  const filas = deLaOrden ? [...cuentas, deLaOrden] : cuentas;
  const ordenIds = filas.map((c) => c.purchaseOrderId).filter((x): x is string => !!x);
  const ordenes = ordenIds.length
    ? await tx.purchaseOrder.findMany({ where: { tenantId, id: { in: ordenIds } }, select: { id: true, invoiceNumber: true } })
    : [];
  const factura = new Map(ordenes.map((o) => [o.id, o.invoiceNumber]));
  return filas.map((c) => ({
    id: c.id,
    supplierId: c.supplierId,
    description: c.description,
    amount: toNumOrZero(c.amount),
    paidAmount: toNumOrZero(c.paidAmount),
    status: c.status,
    purchaseOrderId: c.purchaseOrderId,
    documentoDeLaOrden: c.purchaseOrderId ? (factura.get(c.purchaseOrderId) ?? null) : null,
  }));
}

const TIPO_COMPROBANTE: Record<string, string> = { factura: "Factura", boleta: "Boleta", guia: "Guía" };

function documentoDeOrden(tipo: string | null, numero: string | null): string | null {
  const n = numero?.trim();
  if (!n) return null;
  return `${TIPO_COMPROBANTE[tipo ?? ""] ?? "Comprobante"} ${n}`;
}

/** Con «transferencia» la orden nació pagada: nunca es origen de una deuda. */
const NACIO_PAGADA = "transferencia";

export const CuentasPorPagarDB = {
  /**
   * Crea la cuenta si no repite otra (C41-C42): la misma factura con el
   * proveedor, o la misma orden, no crea otra deuda. Un importe igual sólo lo
   * avisa la ventana: dos compras pueden costar lo mismo. El proveedor tiene
   * que ser de este negocio (antes un `supplierId` ajeno daba 201) y revisar +
   * crear va bajo `candadoPorPagar`.
   */
  async crearSinRepetir(tenantId: string, nueva: NuevaCuentaPorPagar): Promise<ResultadoAlta> {
    if (!tenantId) throw new Error("tenantId is required");
    const { supplierId, purchaseOrderId } = nueva;
    // Fuera del candado: ni el proveedor ni la orden son lo que se repite.
    const [proveedor, orden] = await Promise.all([
      prisma.supplier.findFirst({ where: { tenantId, id: supplierId }, select: { name: true } }),
      purchaseOrderId
        ? prisma.purchaseOrder.findFirst({ where: { tenantId, id: purchaseOrderId }, select: { supplierId: true, status: true, paymentMethod: true } })
        : Promise.resolve(null),
    ]);
    if (!proveedor) return { ok: false, status: 404, error: "No encontramos ese proveedor." };
    if (purchaseOrderId) {
      if (!orden) return { ok: false, status: 404, error: "No encontramos esa orden de compra." };
      if (orden.supplierId !== supplierId) return { ok: false, status: 409, error: "La orden es de otro proveedor." };
      if (orden.status === "cancelado") return { ok: false, status: 409, error: "La orden está cancelada." };
      if (orden.paymentMethod === NACIO_PAGADA) return { ok: false, status: 409, error: "Esa orden se registró ya pagada por transferencia." };
    }
    const r = await prisma.$transaction(async (tx): Promise<ResultadoAlta> => {
      await candadoPorPagar(tx, tenantId, supplierId);
      const existentes = await cuentasParaComparar(tx, tenantId, supplierId, purchaseOrderId);
      const repetida = revisarAlta(
        { supplierId, description: nueva.description ?? "", amount: nueva.amount, purchaseOrderId },
        existentes,
      );
      const choca = repetida.mismaOrden ?? repetida.mismoDocumento;
      if (choca) {
        return {
          ok: false,
          status: 409,
          error: repetida.mismaOrden ? "Esa orden ya tiene su cuenta por pagar." : "Ese comprobante ya está anotado con este proveedor.",
          duplicada: { id: choca.id, detalle: descripcionALaVista(choca.description, choca.purchaseOrderId), monto: choca.amount },
        };
      }
      const row = await tx.payable.create({
        data: {
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId,
          supplierId,
          supplierName: proveedor.name,
          purchaseOrderId: purchaseOrderId || undefined,
          description: nueva.description || "",
          amount: nueva.amount,
          paidAmount: 0,
          status: "pendiente",
          dueDate: nueva.dueDate ? new Date(nueva.dueDate) : new Date(),
        },
        include: { payments: true },
      });
      return { ok: true, cuenta: mapPayable(row) };
    });
    if (r.ok) revalidateTenantTag(tenantId, "payables");
    return r;
  },

  /**
   * Las órdenes del proveedor que pueden ser el origen de una deuda: sin
   * cuenta, sin cancelar y sin «ya pagada por transferencia». Las 50 más nuevas.
   */
  async ordenesSinCuenta(tenantId: string, supplierId: string): Promise<OrdenSinCuenta[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const ordenes = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        supplierId,
        status: { not: "cancelado" },
        OR: [{ paymentMethod: null }, { paymentMethod: { not: NACIO_PAGADA } }],
      },
      select: { id: true, total: true, status: true, paymentMethod: true, invoiceType: true, invoiceNumber: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    if (ordenes.length === 0) return [];
    const conCuenta = await prisma.payable.findMany({
      where: { tenantId, purchaseOrderId: { in: ordenes.map((o) => o.id) } },
      select: { purchaseOrderId: true },
    });
    const tomadas = new Set(conCuenta.map((c) => c.purchaseOrderId));
    return ordenes
      .filter((o) => !tomadas.has(o.id))
      .map((o) => ({
        id: o.id,
        codigo: codigoDeOrden(o.id),
        fecha: limaDateKey(o.createdAt),
        total: toNumOrZero(o.total),
        status: o.status,
        condicion: o.paymentMethod,
        documento: documentoDeOrden(o.invoiceType, o.invoiceNumber),
      }));
  },

  /**
   * Una cuenta cargada a mano se concilia con la orden que apareció después
   * (C41). Sólo si la cuenta no tiene orden, la orden es del mismo proveedor,
   * no está cancelada y ninguna otra cuenta la tiene. No toca montos: desde
   * ahí, un faltante al recibir esa orden baja ESTA cuenta. Bajo el candado
   * del proveedor de la orden (el mismo del alta): dos cuentas a la vez sobre
   * la misma orden = una gana, la otra 409.
   */
  async vincularOrden(tenantId: string, payableId: string, purchaseOrderId: string): Promise<ResultadoVinculo> {
    if (!tenantId) throw new Error("tenantId is required");
    // La orden primero: su proveedor da la clave del candado.
    const orden = await prisma.purchaseOrder.findFirst({ where: { tenantId, id: purchaseOrderId }, select: { supplierId: true, status: true, paymentMethod: true } });
    if (!orden) return { ok: false, status: 404, error: "No encontramos esa orden de compra." };
    const r = await prisma.$transaction(async (tx): Promise<ResultadoVinculo> => {
      await candadoPorPagar(tx, tenantId, orden.supplierId);
      const cuenta = await tx.payable.findFirst({ where: { tenantId, id: payableId }, select: { id: true, supplierId: true, purchaseOrderId: true } });
      if (!cuenta) return { ok: false, status: 404, error: "No encontramos esa cuenta." };
      if (cuenta.purchaseOrderId === purchaseOrderId) return { ok: true };
      if (cuenta.purchaseOrderId) return { ok: false, status: 409, error: "Esta cuenta ya está vinculada a otra orden." };
      if (orden.supplierId !== cuenta.supplierId) return { ok: false, status: 409, error: "La orden es de otro proveedor." };
      if (orden.status === "cancelado") return { ok: false, status: 409, error: "La orden está cancelada." };
      if (orden.paymentMethod === NACIO_PAGADA) return { ok: false, status: 409, error: "Esa orden se registró ya pagada por transferencia." };
      const otra = await tx.payable.findFirst({ where: { tenantId, purchaseOrderId, id: { not: payableId } }, select: { id: true } });
      if (otra) return { ok: false, status: 409, error: "Esa orden ya tiene su cuenta por pagar." };
      await tx.payable.updateMany({ where: { tenantId, id: payableId, purchaseOrderId: null }, data: { purchaseOrderId } });
      return { ok: true };
    });
    if (r.ok) revalidateTenantTag(tenantId, "payables");
    return r;
  },

  /** Estado de cuenta con un proveedor al `corte` («AAAA-MM-DD», día de Lima). */
  async estadoDeCuenta(
    tenantId: string,
    supplierId: string,
    corte: string,
  ): Promise<({ proveedor: { id: string; nombre: string; ruc: string | null } } & EstadoDeCuenta) | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [proveedor, cuentas] = await Promise.all([
      prisma.supplier.findFirst({ where: { tenantId, id: supplierId }, select: { id: true, name: true, ruc: true } }),
      prisma.payable.findMany({
        where: { tenantId, supplierId },
        select: {
          id: true, description: true, purchaseOrderId: true, amount: true, createdAt: true, dueDate: true,
          payments: { select: { id: true, amount: true, method: true, date: true, reference: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    if (!proveedor) return null;
    const ordenIds = cuentas.map((c) => c.purchaseOrderId).filter((x): x is string => !!x);
    const ordenes = ordenIds.length
      ? await prisma.purchaseOrder.findMany({ where: { tenantId, id: { in: ordenIds } }, select: { id: true, invoiceType: true, invoiceNumber: true } })
      : [];
    const doc = new Map(ordenes.map((o) => [o.id, documentoDeOrden(o.invoiceType, o.invoiceNumber)]));
    const estado = armarEstadoDeCuenta(
      cuentas.map((c) => ({
        id: c.id,
        description: c.description,
        purchaseOrderId: c.purchaseOrderId,
        documentoDeLaOrden: c.purchaseOrderId ? (doc.get(c.purchaseOrderId) ?? null) : null,
        amount: toNumOrZero(c.amount),
        createdAt: c.createdAt.toISOString(),
        /* `dueDate` a mano = medianoche UTC; de una OC = la hora en que se creó (ver resumen-cuentas). */
        vence: c.dueDate.getUTCHours() === 0 && c.dueDate.getUTCMinutes() === 0 ? c.dueDate.toISOString().slice(0, 10) : limaDateKey(c.dueDate),
        payments: c.payments.map((p) => ({ id: p.id, amount: toNumOrZero(p.amount), method: p.method, date: p.date.toISOString(), reference: p.reference })),
      })),
      corte,
    );
    return { proveedor: { id: proveedor.id, nombre: proveedor.name, ruc: proveedor.ruc?.trim() || null }, ...estado };
  },
};
