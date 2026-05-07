import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  discountType: z.enum(["percent", "amount", "fixed"]),
  discountValue: z.number().nonnegative(),
  bannerImageUrl: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(80).nullable().optional(),
  ctaUrl: z.string().max(500).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
  position: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const onlyActive =
    req.nextUrl.searchParams.get("active") === "1" ||
    req.nextUrl.searchParams.get("active") === "true";
  try {
    const list = await withDbRetry(() =>
      StorePageDB.listPromotions(auth.tenantId, onlyActive),
    );
    return NextResponse.json(list);
  } catch (e) {
    logger.error("[store-page/promotions] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-promotions"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const promo = await StorePageDB.createPromotion(auth.tenantId, parsed.data);
    logger.info("[store-page/promotions] created", {
      tenantId: auth.tenantId,
      id: promo.id,
    });
    return NextResponse.json(promo, { status: 201 });
  } catch (e) {
    logger.error("[store-page/promotions] POST error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al crear promoción" },
      { status: 503 },
    );
  }
}
