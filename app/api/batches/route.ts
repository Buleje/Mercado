export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateSchema = z.object({
  lote: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  productId: z.number().int().positive().optional(),
  productCategory: z.string().default("Otros"),
  quantity: z.number().positive(),
  unit: z.string().default("unidad"),
  supplierId: z.string().optional(),
  supplierName: z.string().default(""),
  warehouseId: z.string().optional(),
  entryDate: z.string().datetime(),
  expiryDate: z.string().datetime(),
  costUnit: z.number().min(0).default(0),
  notes: z.string().max(1000).default(""),
});

const UpdateSchema = CreateSchema.partial();

function mapBatch(b: {
  id: string; tenantId: string; lote: string; productName: string; productId: number | null;
  productCategory: string; quantity: number; unit: string; supplierId: string | null;
  supplierName: string; warehouseId: string | null;
  entryDate: Date; expiryDate: Date; costUnit: number; notes: string;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: b.id,
    lote: b.lote,
    productName: b.productName,
    productId: b.productId ?? undefined,
    productCategory: b.productCategory,
    quantity: b.quantity,
    unit: b.unit,
    supplierId: b.supplierId ?? undefined,
    supplierName: b.supplierName,
    warehouseId: b.warehouseId ?? undefined,
    entryDate: b.entryDate.toISOString().slice(0, 10),
    expiryDate: b.expiryDate.toISOString().slice(0, 10),
    costUnit: b.costUnit,
    notes: b.notes,
  };
}

// GET /api/batches
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.batch.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: { expiryDate: "asc" },
  });

  return NextResponse.json(rows.map(mapBatch));
}

// POST /api/batches
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "batches");
  if (rl) return rl;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await prisma.batch.create({
    data: {
      ...parsed.data,
      entryDate: new Date(parsed.data.entryDate),
      expiryDate: new Date(parsed.data.expiryDate),
      tenantId: auth.tenantId,
    },
  });

  return NextResponse.json(mapBatch(row), { status: 201 });
}

// PATCH /api/batches?id=xxx
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.batch.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { entryDate, expiryDate, ...rest } = parsed.data;
  const row = await prisma.batch.update({
    where: { id },
    data: {
      ...rest,
      ...(entryDate && { entryDate: new Date(entryDate) }),
      ...(expiryDate && { expiryDate: new Date(expiryDate) }),
    },
  });

  return NextResponse.json(mapBatch(row));
}

// DELETE /api/batches?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "batches");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.batch.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.batch.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
