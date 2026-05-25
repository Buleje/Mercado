import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminWarehouseTransfersDB } from "@/lib/db/admin-warehouse-transfers.db";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unit: z.string().max(20).optional().default("und"),
  notes: z.string().max(500).optional().default(""),
});

/** GET /api/admin/warehouse-transfers — list transfers (newest first, limit 50) */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const fromId = req.nextUrl.searchParams.get("from") ?? undefined;
    const toId = req.nextUrl.searchParams.get("to") ?? undefined;

    const result = await AdminWarehouseTransfersDB.list(auth.tenantId, {
      limit,
      cursor,
      fromId,
      toId,
    });

    return NextResponse.json(result);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** POST /api/admin/warehouse-transfers — record a new transfer */
export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "admin-warehouse-transfers"); if (_rl) return _rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const blocked = await requireActiveSubscription(auth.tenantId);
    if (blocked) return blocked;

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

    // SECURITY 2026-05-05 (audit cross-tenant #high): scope tenantId.
    // Antes admin de A podía referenciar warehouses de B y mover stock.
    const [from, to] = await Promise.all([
      AdminWarehouseTransfersDB.findWarehouse(auth.tenantId, fromWarehouseId),
      AdminWarehouseTransfersDB.findWarehouse(auth.tenantId, toWarehouseId),
    ]);
    if (!from) return NextResponse.json({ error: "Almacén origen no encontrado" }, { status: 404 });
    if (!to) return NextResponse.json({ error: "Almacén destino no encontrado" }, { status: 404 });

    // Stock validation: check per-warehouse stock from Location model
    const availableQty = await AdminWarehouseTransfersDB.locationStock(
      auth.tenantId,
      fromWarehouseId,
      productId,
    );
    if (availableQty > 0 && availableQty < quantity) {
      return NextResponse.json(
        { error: `Stock insuficiente en almacén origen. Disponible: ${availableQty}, solicitado: ${quantity}` },
        { status: 409 },
      );
    }

    const transfer = await AdminWarehouseTransfersDB.create(auth.tenantId, {
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity,
      unit: unit ?? "und",
      notes: notes ?? "",
      requestedBy: auth.username ?? "admin",
    });

    // Log to activity log (fire-and-forget)
    logActivity(
      "create",
      "warehouse-transfer",
      `Transferencia ${transfer.code}: ${from.name} → ${to.name} · ${quantity} ${unit} de ${transfer.productName}`,
      transfer.id,
      auth.username ?? "admin",
    ).catch((err) => logger.error("[admin/warehouse-transfers] activity log failed", { error: String(err) }));

    return NextResponse.json(transfer, { status: 201 });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH /api/admin/warehouse-transfers — update transfer status */
export async function PATCH(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "admin-warehouse-transfers"); if (_rl) return _rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
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
      // SECURITY 2026-05-05 (audit cross-tenant #high): scope tenantId.
      const stockCheck = await AdminWarehouseTransfersDB.checkOriginStock(auth.tenantId, id);
      if ("notFound" in stockCheck) {
        // Transfer no existe para este tenant — lo manejara updateStatus devolviendo null
      } else if (!stockCheck.ok) {
        return NextResponse.json(
          { error: `Stock insuficiente en almacén origen. Disponible: ${stockCheck.available}, requerido: ${stockCheck.required}` },
          { status: 409 },
        );
      }
    }

    const updated = await AdminWarehouseTransfersDB.updateStatus(auth.tenantId, id, status);
    if (!updated) {
      return NextResponse.json({ error: "Transfer no encontrado" }, { status: 404 });
    }

    logActivity(
      "update",
      "warehouse-transfer",
      `Transferencia ${updated.code} marcada como "${status}"`,
      updated.id,
      auth.username ?? "admin",
    ).catch((err) => logger.error("[admin/warehouse-transfers] activity log failed", { error: String(err) }));

    return NextResponse.json(updated);

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
