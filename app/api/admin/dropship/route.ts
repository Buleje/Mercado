import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DropshipDB } from "@/lib/db/dropship.db";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

// GET /api/admin/dropship — lista de fulfillments del tenant
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const rows = await DropshipDB.listFulfillments(auth.tenantId);
    return NextResponse.json(rows);
  } catch (e) {
    logger.error("[dropship.get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const StatusSchema = z.object({
  status: z.enum(["pending", "forwarded", "confirmed", "shipped", "delivered", "cancelled"]).optional(),
  supplierOrderRef: z.string().max(120).optional(),
  carrier: z.string().max(120).optional(),
  trackingNumber: z.string().max(160).optional(),
  trackingUrl: z.string().url().max(500).optional(),
});

// PATCH /api/admin/dropship?id=xxx — actualiza estado/tracking de un fulfillment
export async function PATCH(req: NextRequest) {
  try {
    const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "MODERATE", "dropship"); if (rl) return rl;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const parsed = StatusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const patch = parsed.data.status === "forwarded"
      ? { ...parsed.data, notifiedAt: new Date() }
      : parsed.data;

    const updated = await DropshipDB.updateStatus(auth.tenantId, id, patch);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[dropship.patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vincula un producto a un proveedor de dropship (ADR-298 feature (a)). `null`
// en un campo lo limpia; isDropship=false lo desmarca como dropship.
const LinkSchema = z.object({
  productId: z.number().int().positive(),
  isDropship: z.boolean().optional(),
  dropshipSupplierId: z.string().max(60).nullable().optional(),
  supplierSku: z.string().max(120).nullable().optional(),
  supplierUrl: z.string().url().max(500).nullable().optional(),
});

// POST /api/admin/dropship — body { productId, isDropship?, dropshipSupplierId?, supplierSku?, supplierUrl? }
export async function POST(req: NextRequest) {
  try {
    const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "MODERATE", "dropship-link"); if (rl) return rl;

    const parsed = LinkSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { productId, ...patch } = parsed.data;
    const updated = await DropshipDB.linkProductSupplier(auth.tenantId, productId, patch);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      id: updated.id,
      isDropship: updated.isDropship,
      dropshipSupplierId: updated.dropshipSupplierId,
    });
  } catch (e) {
    logger.error("[dropship.post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
