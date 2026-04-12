import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

const UpsertSchema = z.object({
  productId: z.number().int().positive(),
  exclusivePrice: z.number().nonnegative().nullable().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  badge: z.string().max(40).nullable().optional(),
  visible: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const list = await withDbRetry(() =>
      StorePageDB.listOverrides(auth.tenantId),
    );
    return NextResponse.json(list);
  } catch (e) {
    logger.error("[store-page/overrides] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const override = await StorePageDB.upsertOverride(auth.tenantId, parsed.data);
    logger.info("[store-page/overrides] upserted", {
      tenantId: auth.tenantId,
      productId: parsed.data.productId,
    });
    return NextResponse.json(override, { status: 201 });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err.code === "INVALID_PRICE") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error("[store-page/overrides] POST error", { err: err.message });
    return NextResponse.json(
      { error: "Error al guardar override" },
      { status: 503 },
    );
  }
}
