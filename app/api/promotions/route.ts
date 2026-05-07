import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PromotionsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";

const PromotionSchema = z.object({
  name: z.string().min(1, "name required").max(200),
  description: z.string().max(1000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  minPurchase: z.number().nonnegative().optional(),
  imageUrl: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
  targetType: z.enum(["all", "specific"]).optional(),
  targetPhones: z.string().max(500).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    // SECURITY 2026-05-06 (audit promotions #7): si no hay sesión admin,
    // resolver tenantId del header (proxy ya lo seteó por subdominio) en
    // vez del fallback "main". Esto evita que requests sin sesión válida
    // reciban promos del tenant "main" por accidente.
    const headerTenant = req.headers.get("x-tenant-id");
    const tenantId = auth instanceof NextResponse
      ? (headerTenant && headerTenant !== "main" ? headerTenant : null)
      : auth.tenantId;
    if (!tenantId) {
      // Storefront público sin tenant resuelto → no exponer promos.
      return NextResponse.json([], { status: 200 });
    }
    const all = await withDbRetry(() => PromotionsDB.getAll(tenantId));

    // Admin sees full data including targetPhones
    if (!(auth instanceof NextResponse)) {
      return NextResponse.json(all);
    }

    // Public clients get active promotions with targetPhones stripped (privacy)
    const now = new Date();
    const publicPromos = all
      .filter(p => p.active && (!p.expiresAt || new Date(p.expiresAt) > now))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ targetPhones, ...rest }) => rest);

    return NextResponse.json(publicPromos, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    logger.error("[promotions] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "promotions"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;
  const raw = await req.json();
  const parsed = PromotionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const id = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const promo = await PromotionsDB.add({
      id,
      name: data.name,
      description: data.description || "",
      discountPercent: data.discountPercent ?? 0,
      minPurchase: data.minPurchase,
      imageUrl: data.imageUrl || undefined,
      message: data.message || undefined,
      targetType: data.targetType || "all",
      targetPhones: data.targetPhones || undefined,
      active: data.active ?? true,
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt || undefined,
    }, auth.tenantId);
    logger.info("[promotions] POST created", { id: promo.id, name: promo.name, requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json(promo, { status: 201 });
  } catch (e) {
    logger.error("[promotions] POST error", { err: e instanceof Error ? e.message : String(e), requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json({ error: "Error al crear promoción" }, { status: 503 });
  }
}
