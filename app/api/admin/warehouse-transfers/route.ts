import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";

const CreateSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unit: z.string().max(20).optional().default("und"),
  notes: z.string().max(500).optional().default(""),
});

function toISO(d: Date) {
  return d.toISOString();
}

/** GET /api/admin/warehouse-transfers — list transfers (newest first, limit 50) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const fromId = req.nextUrl.searchParams.get("from") ?? undefined;
  const toId = req.nextUrl.searchParams.get("to") ?? undefined;

  const rows = await prisma.transfer.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(fromId && { fromWarehouseId: fromId }),
      ...(toId && { toWarehouseId: toId }),
    },
    include: {
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    items: items.map(r => ({
      id: r.id,
      code: r.code,
      fromId: r.fromWarehouseId,
      fromName: r.fromWarehouse.name,
      toId: r.toWarehouseId,
      toName: r.toWarehouse.name,
      productId: r.productId,
      productName: r.product.name,
      quantity: r.quantity,
      unit: r.unit,
      status: r.status,
      notes: r.notes,
      requestedBy: r.requestedBy,
      date: toISO(r.requestDate),
      createdAt: toISO(r.createdAt),
    })),
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

/** POST /api/admin/warehouse-transfers — record a new transfer */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    );
  }

  const { fromWarehouseId, toWarehouseId, productId, quantity, unit, notes } = parsed.data;

  if (fromWarehouseId === toWarehouseId) {
    return NextResponse.json(
      { error: "El almacén origen y destino no pueden ser el mismo" },
      { status: 400 },
    );
  }

  // Verify both warehouses exist
  const [from, to] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: fromWarehouseId } }),
    prisma.warehouse.findUnique({ where: { id: toWarehouseId } }),
  ]);
  if (!from) return NextResponse.json({ error: "Almacén origen no encontrado" }, { status: 404 });
  if (!to) return NextResponse.json({ error: "Almacén destino no encontrado" }, { status: 404 });

  // Stock validation: check per-warehouse stock from Location model
  const locationStock = await prisma.location.aggregate({
    where: { warehouseId: fromWarehouseId, productId, tenantId: auth.tenantId },
    _sum: { qty: true },
  });
  const availableQty = locationStock._sum.qty ?? 0;
  if (availableQty > 0 && availableQty < quantity) {
    return NextResponse.json(
      { error: `Stock insuficiente en almacén origen. Disponible: ${availableQty}, solicitado: ${quantity}` },
      { status: 409 },
    );
  }

  // Generate sequential code
  const count = await prisma.transfer.count({ where: { tenantId: auth.tenantId } });
  const code = `TRF-${String(count + 1).padStart(4, "0")}`;

  const transfer = await prisma.transfer.create({
    data: {
      code,
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity,
      unit: unit ?? "und",
      notes: notes ?? "",
      status: "pendiente",
      requestedBy: auth.username ?? "admin",
      tenantId: auth.tenantId,
    },
    include: {
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  // Log to activity log (fire-and-forget)
  logActivity(
    "create",
    "warehouse-transfer",
    `Transferencia ${code}: ${from.name} → ${to.name} · ${quantity} ${unit} de ${transfer.product.name}`,

    transfer.id,
    auth.username ?? "admin",
  );

  return NextResponse.json(
    {
      id: transfer.id,
      code: transfer.code,
      fromId: transfer.fromWarehouseId,
      fromName: transfer.fromWarehouse.name,
      toId: transfer.toWarehouseId,
      toName: transfer.toWarehouse.name,
      productId: transfer.productId,
      productName: transfer.product.name,
      quantity: transfer.quantity,
      unit: transfer.unit,
      status: transfer.status,
      notes: transfer.notes,
      requestedBy: transfer.requestedBy,
      date: toISO(transfer.requestDate),
      createdAt: toISO(transfer.createdAt),
    },
    { status: 201 },
  );
}

/** PATCH /api/admin/warehouse-transfers — update transfer status */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const { id, status } = raw as { id?: string; status?: string };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!status || !["pendiente", "completado", "cancelado"].includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  // When completing, verify origin has enough stock before committing the change
  if (status === "completado") {
    const existing = await prisma.transfer.findUnique({ where: { id } });
    if (existing) {
      const originLoc = await prisma.location.findFirst({
        where: { warehouseId: existing.fromWarehouseId, productId: existing.productId, tenantId: existing.tenantId },
      });
      // Only block if we have a record AND it's insufficient — missing record = stock not tracked yet, allow
      if (originLoc && originLoc.qty < existing.quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente en almacén origen. Disponible: ${originLoc.qty}, requerido: ${existing.quantity}` },
          { status: 409 },
        );
      }
    }
  }

  const updated = await prisma.transfer.update({
    where: { id },
    data: {
      status,
      ...(status === "completado" && { deliveredDate: new Date() }),
    },
    include: {
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
    },
  });

  // When completing a transfer, adjust Location stock: decrement origin, increment destination
  if (status === "completado") {
    try {
      const [fromLoc, toLoc] = await Promise.all([
        prisma.location.findFirst({ where: { warehouseId: updated.fromWarehouseId, productId: updated.productId, tenantId: updated.tenantId } }),
        prisma.location.findFirst({ where: { warehouseId: updated.toWarehouseId, productId: updated.productId, tenantId: updated.tenantId } }),
      ]);
      await prisma.$transaction([
        // Decrement origin (don't go below 0)
        ...(fromLoc
          ? [prisma.location.update({ where: { id: fromLoc.id }, data: { qty: Math.max(0, fromLoc.qty - updated.quantity) } })]
          : []),
        // Increment or create destination location
        ...(toLoc
          ? [prisma.location.update({ where: { id: toLoc.id }, data: { qty: toLoc.qty + updated.quantity } })]
          : [prisma.location.create({
              data: {
                code: `LOC-${updated.toWarehouseId.slice(0, 6)}-${updated.productId}`,
                zone: "General",
                warehouseId: updated.toWarehouseId,
                productId: updated.productId,
                qty: updated.quantity,
                tenantId: updated.tenantId,
              },
            })]),
      ]);
      // Recalculate Product.stock as the sum of all Location.qty across all warehouses
      const aggregate = await prisma.location.aggregate({
        where: { productId: updated.productId, tenantId: updated.tenantId },
        _sum: { qty: true },
      });
      await prisma.product.update({
        where: { id: updated.productId },
        data: { stock: aggregate._sum.qty ?? 0 },
      }).catch(() => {});
    } catch {
      // Stock adjustment is best-effort — transfer status is already saved
    }
  }

  logActivity(
    "update",
    "warehouse-transfer",
    `Transferencia ${updated.code} marcada como "${status}"`,
    updated.id,
    auth.username ?? "admin",
  );

  return NextResponse.json({
    id: updated.id,
    code: updated.code,
    status: updated.status,
    fromName: updated.fromWarehouse.name,
    toName: updated.toWarehouse.name,
  });
}
