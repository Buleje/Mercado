import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InventoryMovementsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

const AdjustSchema = z.object({
  action: z.literal("adjust"),
  productId: z.number().positive(),
  newStock: z.number().min(0),
  warehouseId: z.string().optional(),
  notes: z.string().max(300).optional(),
});

const MovementSchema = z.object({
  productId: z.number().positive(),
  type: z.string().min(1).max(50),
  lossType: z.string().max(50).optional(),
  quantity: z.number().positive(),
  reference: z.string().max(100).optional(),
  warehouseId: z.string().optional(),
  notes: z.string().max(300).optional(),
});

const BulkAdjustSchema = z.object({
  action: z.literal("bulk-adjust"),
  items: z.array(z.object({
    productId: z.number().positive(),
    newStock: z.number().min(0),
    notes: z.string().max(300).optional(),
  })).min(1).max(200),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (productId) {
      // Round 28 P0 (DB profundo audit): firma cambió a (tenantId, productId)
      // — antes era cross-tenant leak silencioso (producto ID 42 mezclaba
      // movimientos del tenant A con tenant B). auth.tenantId garantiza
      // aislamiento.
      const movements = await InventoryMovementsDB.getByProduct(auth.tenantId, Number(productId));
      return NextResponse.json(movements);
    }

    // Paginado por cursor cuando la pantalla lo pide. Sin `paged` se responde
    // como siempre (un array de los últimos 200): hay otros consumidores.
    if (searchParams.get("paged") === "1") {
      const limitRaw = Number(searchParams.get("limit") ?? 100);
      const page = await InventoryMovementsDB.listWithCursor(auth.tenantId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : 100,
        ...(searchParams.get("cursor") ? { cursor: searchParams.get("cursor")! } : {}),
      });
      return NextResponse.json(page);
    }

    return NextResponse.json(await InventoryMovementsDB.getAll(auth.tenantId));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-movements"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();

    if (raw.action === "adjust") {
      const parsed = AdjustSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 }
        );
      }
      const { productId, newStock, warehouseId, notes } = parsed.data;
      const movement = await InventoryMovementsDB.adjust(productId, newStock, auth.tenantId, warehouseId, notes, auth.username);
      return NextResponse.json(movement, { status: 201 });
    }

    if (raw.action === "bulk-adjust") {
      const parsed = BulkAdjustSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 }
        );
      }
      const results = await Promise.allSettled(
        parsed.data.items.map((item) => InventoryMovementsDB.adjust(item.productId, item.newStock, auth.tenantId, undefined, item.notes, auth.username))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeededIds = parsed.data.items
        .filter((_, i) => results[i].status === "fulfilled")
        .map((item) => item.productId);
      return NextResponse.json({ ok: true, succeeded, failed, succeededIds }, { status: 201 });
    }

    // Default: record a movement
    const parsed = MovementSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const { productId, type, lossType, quantity, reference, warehouseId, notes } = parsed.data;
    const movement = await InventoryMovementsDB.record({
      productId,
      type,
      lossType,
      quantity,
      reference,
      warehouseId,
      notes,
      createdBy: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(movement, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
