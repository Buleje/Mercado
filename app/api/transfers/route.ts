import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  productId: z.number().positive(),
  quantity: z.number().int().positive(),
  unit: z.string().max(20).optional(),
  requestedBy: z.string().min(1).max(80),
  notes: z.string().max(300).optional(),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pendiente", "en-transito", "recibido", "cancelado"]).optional(),
  notes: z.string().max(300).optional(),
});

function mapTransfer(row: {
  id: string;
  code: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: number;
  quantity: number;
  unit: string;
  status: string;
  requestedBy: string;
  requestDate: Date;
  deliveredDate: Date | null;
  notes: string;
  fromWarehouse: { name: string };
  toWarehouse: { name: string };
  product: { name: string };
}) {
  return {
    id: row.id,
    code: row.code,
    fromWarehouseId: row.fromWarehouseId,
    from: row.fromWarehouse.name,
    toWarehouseId: row.toWarehouseId,
    to: row.toWarehouse.name,
    productId: row.productId,
    items: [{ product: row.product.name, qty: row.quantity, unit: row.unit }],
    status: row.status,
    requestedBy: row.requestedBy,
    requestDate: row.requestDate.toISOString(),
    deliveredDate: row.deliveredDate?.toISOString() ?? null,
    notes: row.notes,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await prisma.transfer.findMany({
      where: { tenantId: auth.tenantId },
      include: { fromWarehouse: true, toWarehouse: true, product: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rows.map((row) => mapTransfer(row)));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "transfers"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    }

    if (parsed.data.fromWarehouseId === parsed.data.toWarehouseId) {
      return NextResponse.json({ error: "El almacen origen y destino no pueden ser el mismo" }, { status: 400 });
    }

    const last = await prisma.transfer.findFirst({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
      select: { code: true },
    });
    const lastNumber = last?.code ? parseInt(last.code.replace(/\D/g, ""), 10) || 0 : 0;
    const code = `TRF-${String(lastNumber + 1).padStart(3, "0")}`;

    const row = await prisma.transfer.create({
      data: {
        code,
        fromWarehouseId: parsed.data.fromWarehouseId,
        toWarehouseId: parsed.data.toWarehouseId,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit || "und",
        requestedBy: parsed.data.requestedBy,
        notes: parsed.data.notes || "",
        tenantId: auth.tenantId,
      },
      include: { fromWarehouse: true, toWarehouse: true, product: true },
    });

    return NextResponse.json(mapTransfer(row), { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "transfers"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    }

    const row = await prisma.transfer.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status, deliveredDate: parsed.data.status === "recibido" ? new Date() : null } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
      include: { fromWarehouse: true, toWarehouse: true, product: true },
    });

    return NextResponse.json(mapTransfer(row));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "transfers"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    await prisma.transfer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}