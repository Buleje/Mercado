
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceProductsDB } from "@/lib/db/marketplace-products.db";
import { invalidateByPrefix } from "@/lib/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";

const UpdateItemSchema = z.object({
  id: z.number().int().positive(),
  price: z.number().positive().optional(),
  active: z.boolean().optional(),
  category: z.string().min(1).max(100).optional(),
  stock: z.number().int().min(0).optional(),
});

const BodySchema = z.object({
  updates: z.array(UpdateItemSchema).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => { logger.error("[marketplace/products/bulk-edit] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { updates } = parsed.data;

  // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.bulkEdit
  // (encapsula la $transaction + per-row error tolerance).
  const { updated, failed } = await MarketplaceProductsDB.bulkEdit(
    auth.tenantId,
    updates,
  );

  // Invalidar cache despues del commit
  invalidateByPrefix("marketplace:catalog");
  for (const item of updates) {
    if (!failed.find((f) => f.id === item.id)) {
      invalidateByPrefix(`marketplace:product:${item.id}`);
    }
  }

  return NextResponse.json({ updated, failed });
}
