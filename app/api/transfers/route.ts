import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TransfersDB } from "@/lib/db/transfers.db";
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

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const transfers = await TransfersDB.list(auth.tenantId);
    return NextResponse.json(transfers);
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

    const transfer = await TransfersDB.create(auth.tenantId, {
      fromWarehouseId: parsed.data.fromWarehouseId,
      toWarehouseId: parsed.data.toWarehouseId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      requestedBy: parsed.data.requestedBy,
      notes: parsed.data.notes,
    });

    return NextResponse.json(transfer, { status: 201 });
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

    const transfer = await TransfersDB.update(auth.tenantId, parsed.data.id, {
      status: parsed.data.status,
      notes: parsed.data.notes,
    });

    return NextResponse.json(transfer);
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

    await TransfersDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}