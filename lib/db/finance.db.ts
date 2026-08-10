import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
import type {
  Payable as PPayable,
  Payment as PPayment,
  Expense as PExpense,
} from "@/lib/generated/prisma/client";
import {
  type DbPayable,
  type DbPayment,
  type PaymentMethod,
} from "./misc.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { decodeExpenseDescription, type ExpenseMeta } from "@/lib/expense-meta";

// perf audit P1: invalidación de caché tras writes. `revalidateTag` lanza si se
// llama fuera de un contexto de request de Next (ej. unit tests que invocan la
// db class directo) — lo envolvemos: la invalidación es fire-and-forget, no
// crítica para la operación.
function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* fuera de contexto de request (test/script) — no crítico */
  }
}

// Tras escribir un gasto hay que invalidar su caché Y la del flujo de caja (los
// gastos alimentan cash-flow). Antes no se invalidaba nada → resumen viejo 30-60s.
function revalidateExpenses(tenantId: string): void {
  safeRevalidate(`tenant:${tenantId}:expenses`);
  safeRevalidate(`tenant:${tenantId}:cash-flow`);
}

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  createdAt: string;
  // ADR-374 — columnas reales; antes vivían serializadas en `description`.
  frequency?: string | null;
  paymentDay?: number | null;
  paymentMethod?: string | null;
  supplierName?: string | null;
  supplierId?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  supplierRuc?: string | null;
  igvAmount?: number | null;
  afectoIgv?: boolean;
  attachmentUrl?: string | null;
  costCenter?: string | null;
  createdBy?: string | null;
  notes?: string | null;
  templateId?: string | null;
  paidAt?: string | null;
};

/** Cuánto de un gasto ya salió de la caja. `sin_registro` = la OC no tiene `Payable`. */
export type EstadoPagoGasto = "pagado" | "parcial" | "pendiente" | "sin_registro";

/** Una línea del historial unificado: un gasto operativo o una compra recibida. */
export type DbHistorialGasto = {
  id: string;
  /** Id real del `Expense` o de la `PurchaseOrder`, sin el prefijo de `id`. */
  refId: string;
  source: "expense" | "purchase";
  fecha: string;
  category: string;
  /** Ya decodificada: sin el bloque `---META---`. */
  description: string;
  amount: number;
  recurring: boolean;
  estadoPago: EstadoPagoGasto;
  montoPagado: number;
  supplierName?: string;
  descuento?: number;
  meta?: ExpenseMeta;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPayable(p: PPayable & { payments: PPayment[] }): DbPayable {
  return {
    id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
    ...(p.purchaseOrderId != null && { purchaseOrderId: p.purchaseOrderId }),
    description: p.description, amount: toNumOrZero(p.amount), paidAmount: toNumOrZero(p.paidAmount),
    status: p.status as DbPayable["status"],
    dueDate: toISO(p.dueDate),
    payments: p.payments.map((pm: PPayment) => ({
      id: pm.id, amount: toNumOrZero(pm.amount), method: pm.method as PaymentMethod,
      date: toISO(pm.date),
      ...(pm.reference != null && { reference: pm.reference }),
    })),
    createdAt: toISO(p.createdAt),
  };
}

function mapExpense(e: PExpense): DbExpense {
  return {
    id: e.id, category: e.category, description: e.description, amount: toNumOrZero(e.amount),
    date: toISO(e.date), recurring: e.recurring, createdAt: toISO(e.createdAt),
    frequency: e.frequency, paymentDay: e.paymentDay, paymentMethod: e.paymentMethod,
    supplierName: e.supplierName, supplierId: e.supplierId,
    documentType: e.documentType, documentNumber: e.documentNumber, supplierRuc: e.supplierRuc,
    igvAmount: e.igvAmount == null ? null : toNumOrZero(e.igvAmount),
    afectoIgv: e.afectoIgv,
    attachmentUrl: e.attachmentUrl, costCenter: e.costCenter, createdBy: e.createdBy,
    notes: e.notes, templateId: e.templateId,
    paidAt: e.paidAt ? toISO(e.paidAt) : null,
  };
}

// ── Payables DB ───────────────────────────────────────────────────────────────

export const PayablesDB = {
  async getAll(tenantId: string): Promise<DbPayable[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.payable.findMany({ where, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async getById(tenantId: string, id: string): Promise<DbPayable | null> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    return row ? mapPayable(row) : null;
  },
  async getBySupplierId(tenantId: string, supplierId: string): Promise<DbPayable[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
    return (await prisma.payable.findMany({ where: { supplierId, tenantId }, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async add(tenantId: string, p: DbPayable): Promise<DbPayable> {
    const row = await prisma.payable.create({
      data: {
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId, description: p.description,
        amount: p.amount, paidAmount: p.paidAmount, status: p.status,
        dueDate: new Date(p.dueDate), tenantId,
      },
      include: { payments: true },
    });
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras write
    return mapPayable(row);
  },
  async update(tenantId: string, id: string, patch: Partial<DbPayable>): Promise<DbPayable | null> {
    const existing = await prisma.payable.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.dueDate !== undefined) data.dueDate = new Date(patch.dueDate);
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    await prisma.payable.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    if (!row) return null;
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras write
    return mapPayable(row);
  },
  async addPayment(tenantId: string, id: string, payment: DbPayment): Promise<DbPayable | null> {
    // F2: race lock — todo dentro de $transaction para evitar doble pago concurrente
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
      if (!current) return null;

      const currentAmountNum = toNumOrZero(current.amount);
      const currentPaidNum = toNumOrZero(current.paidAmount);
      const sumPaid = currentPaidNum + payment.amount;

      // TD-018: tolerancia 0.01 para diferencias de punto flotante / redondeo
      if (sumPaid > currentAmountNum + 0.01) {
        throw new Error("Pago excede el saldo pendiente");
      }

      await tx.payment.create({
        data: { id: payment.id, payableId: id, amount: payment.amount, method: payment.method, date: new Date(payment.date), reference: payment.reference },
      });

      const status = sumPaid >= currentAmountNum ? "pagado" : sumPaid > 0 ? "parcial" : "pendiente";
      // Audit 2026-05-17 B-P0-3: updateMany con tenantId (defense-in-depth).
      // Antes `update({ where: { id } })` sin tenantId. El guard previo via
      // `findFirst({ id, tenantId })` cubre HOY, pero si alguien refactoriza
      // y quita el findFirst hay cross-tenant write. updateMany scoped
      // garantiza DB-level que solo el row del tenant correcto se actualice.
      await tx.payable.updateMany({
        where: { id, tenantId },
        data: { paidAmount: sumPaid, status },
      });

      const row = await tx.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
      if (!row) return null;
      return mapPayable(row);
    });
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras pago
    return result;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.payable.deleteMany({ where: { id, tenantId } }).catch((err) => logger.warn("[finance.db] payable delete failed", { id, tenantId, err: String(err) }));
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras delete
  },
};

// ── Expenses DB ───────────────────────────────────────────────────────────────

export const ExpensesDB = {
  async getAll(tenantId: string, filters?: { recurring?: boolean; category?: string }): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    const where: Record<string, unknown> = { tenantId };
    if (filters?.recurring !== undefined) where.recurring = filters.recurring;
    if (filters?.category) where.category = filters.category;
    return (await prisma.expense.findMany({ where, orderBy: { date: "desc" } })).map(mapExpense);
  },
  /**
   * Gastos de un rango de fechas — SÓLO los ejecutados.
   *
   * Un `Expense` con `recurring=true` no es plata que salió: es la PLANTILLA
   * del gasto fijo, la tarjeta que el Punto de Compra ofrece para registrar el
   * pago del mes. Contarla era cobrar el alquiler dos veces — una por existir
   * el acuerdo y otra por pagarlo — y en el tenant real había además tarjetas
   * duplicadas, así que el P&L mostraba S/2.119,80 de gastos cuando el
   * Historial, que sí las excluye, mostraba S/0,00. Dos pantallas, la misma
   * pregunta, respuestas distintas.
   *
   * `incluirPlantillas` existe para el único caso que las necesita: mostrar el
   * catálogo de fijos configurados.
   */
  async getByDateRange(tenantId: string, from: Date, to: Date, opciones?: { incluirPlantillas?: boolean }): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    return (await prisma.expense.findMany({
      where: {
        tenantId,
        date: { gte: from, lte: to },
        ...(opciones?.incluirPlantillas ? {} : { recurring: false }),
      },
      orderBy: { date: "desc" },
    })).map(mapExpense);
  },
  /**
   * Templates de gastos recurrentes — catálogo del "Punto de Compra".
   * Audit 2026-05-17 (feature compras): los Expense con recurring=true
   * actúan como plantillas en el catálogo. Click → crea Expense nuevo
   * con recurring=false (gasto real ejecutado).
   */
  async getRecurringTemplates(tenantId: string): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    return (await prisma.expense.findMany({
      where: { tenantId, recurring: true },
      orderBy: [{ category: "asc" }, { description: "asc" }],
    })).map(mapExpense);
  },
  /**
   * Crea un gasto a partir de un template recurring. El template queda
   * intacto (sigue recurring=true); el nuevo gasto es no-recurring
   * (transacción real). Permite override de amount/description/date.
   */
  async addFromTemplate(
    tenantId: string,
    templateId: string,
    overrides?: { amount?: number; description?: string; date?: string; createdBy?: string },
  ): Promise<DbExpense | null> {
    const tpl = await prisma.expense.findFirst({
      where: { id: templateId, tenantId, recurring: true },
    });
    if (!tpl) return null;
    const fecha = overrides?.date ? new Date(overrides.date) : new Date();
    const row = await prisma.expense.create({
      data: {
        tenantId,
        category: tpl.category,
        // La descripción del pago va LIMPIA: la metadata de la plantilla viaja
        // en las columnas de abajo, no pegada al texto. Copiarla tal cual era
        // lo que hacía que la tabla y el CSV mostraran el bloque
        // `---META---{…}` al lado del nombre del gasto (ADR-374).
        description: overrides?.description ?? decodeExpenseDescription(tpl.description).description,
        amount: overrides?.amount ?? toNumOrZero(tpl.amount),
        date: fecha,
        recurring: false,
        // ADR-374: el pago hereda de su plantilla y guarda de cuál salió. Sin
        // `templateId`, responder «¿el alquiler de agosto ya está pagado?»
        // dependía de comparar nombre + monto normalizados, y un aumento de
        // alquiler rompía la correspondencia justo cuando más importaba.
        templateId: tpl.id,
        frequency: tpl.frequency,
        paymentDay: tpl.paymentDay,
        paymentMethod: tpl.paymentMethod,
        supplierName: tpl.supplierName,
        supplierId: tpl.supplierId,
        costCenter: tpl.costCenter,
        createdBy: overrides?.createdBy ?? null,
        // Registrar el pago ES el momento en que sale la plata.
        paidAt: fecha,
      },
    });
    revalidateExpenses(tenantId);
    return mapExpense(row);
  },
  async add(tenantId: string, data: Omit<DbExpense, "id" | "createdAt">): Promise<DbExpense> {
    const fecha = new Date(data.date);
    const row = await prisma.expense.create({
      data: {
        category: data.category, description: data.description, amount: data.amount,
        date: fecha, recurring: data.recurring, tenantId,
        // ADR-374 — campos opcionales; `undefined` deja la columna en NULL.
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
        // Una plantilla no se pagó: se acordó. Sólo el gasto ejecutado lleva
        // fecha de pago, y por defecto es la fecha del gasto.
        paidAt: data.paidAt ? new Date(data.paidAt) : data.recurring ? null : fecha,
      },
    });
    revalidateExpenses(tenantId);
    return mapExpense(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.expense.deleteMany({ where: { id, tenantId } }).catch((err) => logger.warn("[finance.db] expense delete failed", { id, tenantId, err: String(err) }));
    revalidateExpenses(tenantId);
  },
  /**
   * Total por categoría — la fuente del P&L, el Break-even, el Presupuesto y el
   * Reporte Semanal. Excluye plantillas por la misma razón que
   * `getByDateRange`: lo que se acordó pagar no es lo que se pagó.
   */
  async getSummary(tenantId: string, opciones?: { incluirPlantillas?: boolean }): Promise<{ category: string; total: number; count: number }[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    const groups = await prisma.expense.groupBy({
      by: ["category"],
      where: { tenantId, ...(opciones?.incluirPlantillas ? {} : { recurring: false }) },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    });
    // TD-018: g._sum.amount es Decimal | null
    return groups.map(g => ({ category: g.category, total: toNumOrZero(g._sum.amount), count: g._count }));
  },
  /**
   * Historial de gastos agregado de TODOS los módulos:
   *  - Expense table (gastos manuales)
   *  - PurchaseOrder recibida o parcial (compras a proveedores)
   * Audit 2026-05-17 (feature compras): vista unificada por mes.
   *
   * TRES COSAS QUE ACÁ NO SON OBVIAS:
   *
   * 1. GASTADO ≠ PAGADO. Una OC recibida es mercadería que entró y plata que
   *    se DEBE; puede estar pagada, a medias o entera pendiente. Eso vive en
   *    el `Payable` de la orden. Sin cruzarlo, «Total gastado» sumaba deuda y
   *    caja en el mismo número y nadie podía preguntarle a la pantalla cuánto
   *    le queda por pagar este mes.
   *
   * 2. LA FECHA DE UNA COMPRA ES CUÁNDO LLEGÓ, no cuándo se emitió la orden:
   *    una OC creada el 28 de junio y recibida el 3 de julio es gasto de
   *    julio. Por eso el filtro mira `deliveryDate` y sólo cae en `createdAt`
   *    cuando la orden no tiene fecha de entrega.
   *
   * 3. LA DESCRIPCIÓN VIENE SUCIA. `addFromTemplate` copia la descripción de
   *    la plantilla tal cual, y esa lleva pegado el bloque `---META---{…}` con
   *    la frecuencia y el método de pago (ver `lib/expense-meta.ts`). Se
   *    decodifica ACÁ, una vez, en vez de pedirle a cada pantalla que se
   *    acuerde: el CSV ya se estaba exportando con el JSON adentro.
   */
  async getHistorialUnificado(
    tenantId: string,
    filters: { from?: Date; to?: Date; source?: "expense" | "purchase" | "all" },
  ): Promise<DbHistorialGasto[]> {
    const source = filters.source ?? "all";
    const dateFilter: Record<string, Date> = {};
    if (filters.from) dateFilter.gte = filters.from;
    if (filters.to) dateFilter.lte = filters.to;
    const hayFechas = Object.keys(dateFilter).length > 0;

    const needExpenses = source === "all" || source === "expense";
    const needPurchases = source === "all" || source === "purchase";

    const [expenses, purchases] = await Promise.all([
      needExpenses
        ? prisma.expense.findMany({
            where: {
              tenantId,
              recurring: false, // templates no cuentan como gastos ejecutados
              ...(hayFechas ? { date: dateFilter } : {}),
            },
            orderBy: { date: "desc" },
          })
        : Promise.resolve([]),
      needPurchases
        ? prisma.purchaseOrder.findMany({
            where: {
              tenantId,
              // Audit 2026-05-17: solo OCs concretadas. Enum PurchaseStatus es
              // (pendiente|recibido|parcial|cancelado|auto_generated). "recibido"
              // y "parcial" cuentan como gasto real (algo de mercadería entró).
              status: { in: ["recibido", "parcial"] },
              // La fecha efectiva es la de entrega; `createdAt` sólo cuando la
              // orden nunca declaró una.
              ...(hayFechas
                ? { OR: [{ deliveryDate: dateFilter }, { deliveryDate: null, createdAt: dateFilter }] }
                : {}),
            },
            select: {
              id: true, total: true, discount: true, supplierName: true, status: true,
              notes: true, createdAt: true, deliveryDate: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    // Estado de pago de cada OC. Una sola query para todas: N+1 en una pantalla
    // que lista meses de compras se nota.
    const payablesPorOc = new Map<string, { amount: number; paidAmount: number; status: string }>();
    if (purchases.length > 0) {
      const payables = await prisma.payable.findMany({
        where: { tenantId, purchaseOrderId: { in: purchases.map((p) => p.id) } },
        select: { purchaseOrderId: true, amount: true, paidAmount: true, status: true },
      });
      for (const pa of payables) {
        if (!pa.purchaseOrderId) continue;
        payablesPorOc.set(pa.purchaseOrderId, {
          amount: toNumOrZero(pa.amount),
          paidAmount: toNumOrZero(pa.paidAmount),
          status: pa.status,
        });
      }
    }

    const items: DbHistorialGasto[] = [
      ...expenses.map((e) => {
        const { description, meta } = decodeExpenseDescription(e.description ?? "");
        const amount = toNumOrZero(e.amount);
        // ADR-374, fase EXPAND: la columna manda, el bloque serializado queda
        // de red hasta que el backfill cubra todo. Un gasto creado antes de la
        // migración y nunca tocado sigue trayendo sus datos sólo en el bloque.
        const metaEfectiva: ExpenseMeta = {
          ...meta,
          ...(e.frequency ? { frequency: e.frequency as ExpenseMeta["frequency"] } : {}),
          ...(e.paymentDay != null ? { paymentDay: e.paymentDay } : {}),
          ...(e.paymentMethod ? { paymentMethod: e.paymentMethod as ExpenseMeta["paymentMethod"] } : {}),
          ...(e.supplierName ? { supplierName: e.supplierName } : {}),
          ...(e.notes ? { notes: e.notes } : {}),
        };
        return {
          id: `exp-${e.id}`,
          refId: e.id,
          source: "expense" as const,
          fecha: e.date.toISOString(),
          category: e.category,
          description,
          amount,
          recurring: e.recurring,
          // Un gasto operativo se registra cuando ya salió la plata: no hay
          // estado intermedio que declarar.
          estadoPago: "pagado" as const,
          montoPagado: amount,
          ...(metaEfectiva.supplierName ? { supplierName: metaEfectiva.supplierName } : {}),
          ...(Object.keys(metaEfectiva).length > 0 ? { meta: metaEfectiva } : {}),
        };
      }),
      ...purchases.map((p) => {
        const amount = toNumOrZero(p.total);
        const pagoOc = payablesPorOc.get(p.id);
        // Sin `Payable` no se puede afirmar que esté pagada NI que se deba:
        // se dice «sin registro» en vez de inventar un estado.
        const montoPagado = pagoOc ? Math.min(pagoOc.paidAmount, amount) : 0;
        const estadoPago: DbHistorialGasto["estadoPago"] = !pagoOc
          ? "sin_registro"
          : montoPagado >= amount - 0.01
            ? "pagado"
            : montoPagado > 0
              ? "parcial"
              : "pendiente";
        return {
          id: `oc-${p.id}`,
          refId: p.id,
          source: "purchase" as const,
          fecha: (p.deliveryDate ?? p.createdAt).toISOString(),
          category: "Compras a proveedor",
          description: p.notes ?? `OC ${p.id.slice(-6)}`,
          amount,
          recurring: false,
          estadoPago,
          montoPagado,
          supplierName: p.supplierName,
          ...(p.discount != null && toNumOrZero(p.discount) > 0
            ? { descuento: toNumOrZero(p.discount) }
            : {}),
        };
      }),
    ];

    return items.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  },
};
