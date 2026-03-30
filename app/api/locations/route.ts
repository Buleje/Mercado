export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";

const CreateSchema = z.object({
  code: z.string().min(1).max(30),
  zone: z.string().min(1).max(80),
  aisle: z.string().max(30).optional(),
  shelf: z.string().max(30).optional(),
  bin: z.string().max(30).optional(),
  warehouseId: z.string().min(1),
  productId: z.number().positive().optional().nullable(),
  qty: z.number().int().min(0).optional(),
  capacity: z.number().int().min(0),
  category: z.string().max(80).optional(),
});

const UpdateSchema = CreateSchema.partial().extend({
  id: z.string().min(1),
});

function mapLocation(row: {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  warehouseId: string;
  productId: number | null;
  qty: number;
  capacity: number;
  category: string;
  warehouse: { name: string };
  product: { name: string; category: string } | null;
}) {
  return {
    id: row.id,
    code: row.code,
    zone: row.zone,
    aisle: row.aisle,
    shelf: row.shelf,
    bin: row.bin,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    productId: row.productId,
    product: row.product?.name ?? null,
    qty: row.qty,
    capacity: row.capacity,
    category: row.category || row.product?.category || "",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await prisma.location.findMany({
      where: { tenantId: auth.tenantId },
      include: { warehouse: true, product: true },
      orderBy: [{ zone: "asc" }, { code: "asc" }],
    });
    return NextResponse.json(rows.map((row) => mapLocation(row)));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    }

    const row = await prisma.location.create({
      data: {
        ...parsed.data,
        productId: parsed.data.productId ?? null,
        qty: parsed.data.qty ?? 0,
        tenantId: auth.tenantId,
      },
      include: { warehouse: true, product: true },
    });
    return NextResponse.json(mapLocation(row), { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    }

    const { id, ...rest } = parsed.data;
    const row = await prisma.location.update({
      where: { id },
      data: {
        ...rest,
        ...(rest.productId === undefined ? {} : { productId: rest.productId ?? null }),
      },
      include: { warehouse: true, product: true },
    });
    return NextResponse.json(mapLocation(row));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    await prisma.location.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}