import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { PurchasesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOrSet } from "@/lib/cache";

const PurchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  unit: z.string().max(50).default(""),
  name: z.string().max(200).default(""),
});

const PurchaseSchema = z.object({
  supplierId: z.coerce.string().default(""),
  supplierName: z.string().max(200).optional(),
  items: z.array(PurchaseItemSchema).min(1, "at least one item required"),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.enum(["contado", "credito_7", "credito_15", "credito_30", "transferencia"]).default("contado"),
  deliveryDate: z.string().optional(),
  discount: z.number().min(0).max(100).default(0),
  idempotencyKey: z.string().min(1).max(100).optional(),
  // ADR-377 — el papel del proveedor y lo que costó traer la mercadería.
  invoiceNumber: z.string().max(60).optional(),
  invoiceType: z.enum(["factura", "boleta", "guia", "ninguno"]).optional(),
  igvIncluded: z.boolean().default(true),
  flete: z.number().min(0).default(0),
  otrosCostos: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await withDbRetry(() => PurchasesDB.getAll(auth.tenantId));
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[purchases] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "purchases"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const raw = await req.json();
    const parsed = PurchaseSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;

    // F1: Idempotency in-memory (cache TTL 10min) — si llega key y la PO ya
    // se creó en los últimos 10min, devolver la existente. Defense contra
    // doble-click. NOTA: no es durable (restart del proceso pierde el lock);
    // refactor a campo @unique en DbPurchaseOrder pendiente.
    if (data.idempotencyKey) {
      const cached = await getOrSet<string | null>(
        `po-idem:${auth.tenantId}:${data.idempotencyKey}`,
        1, // 1 sec — minimal write si no existe
        async () => null,
      ).catch((err) => { logger.warn("[purchases] po-idem cache failed", { err: String(err) }); return null; });
      if (cached) {
        const existing = await PurchasesDB.getById(auth.tenantId, cached).catch((err) => { logger.warn("[purchases] getById failed", { err: String(err) }); return null; });
        if (existing) return NextResponse.json(existing, { status: 200 });
      }
    }

    const now = new Date().toISOString();
    const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const discountPct = data.discount ?? 0;
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const total = Math.max(0, subtotal * (1 - discountPct / 100));
    const po = await PurchasesDB.add({
      id,
      supplierId: data.supplierId,
      supplierName: data.supplierName || "",
      items: data.items,
      total,
      status: "pendiente",
      notes: data.notes || undefined,
      paymentMethod: data.paymentMethod,
      deliveryDate: data.deliveryDate,
      discount: discountPct,
      // ADR-377
      invoiceNumber: data.invoiceNumber,
      invoiceType: data.invoiceType,
      igvIncluded: data.igvIncluded,
      flete: data.flete,
      otrosCostos: data.otrosCostos,
      createdBy: auth.username,
      createdAt: now,
      updatedAt: now,
    }, auth.tenantId);

    // Persistir idempotencyKey -> id en cache (TTL 10min)
    if (data.idempotencyKey) {
      await getOrSet<string>(
        `po-idem:${auth.tenantId}:${data.idempotencyKey}`,
        600,
        async () => id,
      ).catch(() => undefined);
    }

    // F1: Crear Payable atómico si el pago es a crédito — dentro de $transaction
    if (data.paymentMethod.startsWith("credito_")) {
      const days = parseInt(data.paymentMethod.split("_")[1]) || 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      const payableId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // $transaction tenant-scoped via auth guard arriba.
      await prisma.$transaction(async (tx) => {
        const existingPayable = await tx.payable.findFirst({ where: { purchaseOrderId: id, tenantId: auth.tenantId } });
        if (existingPayable) {
          logger.warn("[purchases] Payable ya existe para OC — omitiendo duplicado", { purchaseOrderId: id });
          return;
        }
        await tx.payable.create({
          data: {
            id: payableId,
            supplierId: data.supplierId,
            supplierName: data.supplierName || "",
            purchaseOrderId: id,
            description: `Auto-generado desde OC ${id}`,
            amount: total,
            paidAmount: 0,
            status: "pendiente",
            dueDate,
            tenantId: auth.tenantId,
          },
        });
      });

      // La cuenta se crea con `tx.payable.create` para que sea atómica con la
      // orden, pero eso saltea `PayablesDB.add`, que es quien invalida el cache
      // de `getAll` (tag `payables`, 30s). Sin esto comprás a crédito y tu
      // propia deuda no figura en Cuentas pendientes hasta medio minuto después
      // — el e2e del ciclo lo mostró listando las deudas de la corrida anterior
      // y no la recién creada.
      revalidateTag(`tenant:${auth.tenantId}:payables`, "max");

      logAudit({ req, action: "CREATE", entity: "Purchase", entityId: id, detail: `Payable auto-generado OC ${id}, S/${total.toFixed(2)}, vence en ${days} días` });
    }

    // F5: costPrice NO se actualiza en POST (PO emitida, no recibida aún).
    // El weighted-avg se aplica en PATCH cuando status → "recibido".

    return NextResponse.json(po, { status: 201 });
  } catch (e) {
    logger.error("[purchases] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al crear orden de compra" }, { status: 500 });
  }
}
