import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CouponsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

const CouponPostSchema = z.object({
  code: z.string().min(1).max(50),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountValue: z.number().positive(),
  minPurchase: z.number().min(0).optional(),
  maxUses: z.number().min(1).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const coupons = await withDbRetry(() => CouponsDB.getAll(auth.tenantId));
    logger.info("[coupons] GET", { count: coupons.length, requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json(coupons);
  } catch (e) {
    logger.error("[coupons] GET error", { err: e instanceof Error ? e.message : String(e), requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json({ error: "Error al cargar cupones" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const raw = await req.json();
  const parsed = CouponPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  // F1 2026-05-07: normalizar a uppercase antes de check y create para evitar
  // duplicados case-insensitive (BIENV2026 vs bienv2026). getByCode y add también
  // normalizan, pero hacerlo aquí garantiza consistencia si se cambia la DB layer.
  const normalizedCode = parsed.data.code.toUpperCase().trim();
  const { description, discountType, discountValue, minPurchase, maxUses, active, expiresAt } = parsed.data;

  try {
    const existing = await CouponsDB.getByCode(auth.tenantId, normalizedCode);
    if (existing) return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 });

    const coupon = await CouponsDB.add({
      code: normalizedCode, description: description ?? "",
      discountType: discountType ?? "percent", discountValue,
      minPurchase, maxUses, active: active ?? true, expiresAt,
    }, auth.tenantId);
    logger.info("[coupons] POST created", { code: coupon.code, requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json(coupon, { status: 201 });
  } catch (e) {
    logger.error("[coupons] POST error", { err: e instanceof Error ? e.message : String(e), requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json({ error: "Error al crear cupón" }, { status: 503 });
  }
}
