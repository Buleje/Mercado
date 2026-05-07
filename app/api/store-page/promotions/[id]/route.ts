import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  discountType: z.enum(["percent", "amount", "fixed"]).optional(),
  discountValue: z.number().nonnegative().optional(),
  bannerImageUrl: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(80).nullable().optional(),
  ctaUrl: z.string().max(500).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
  position: z.number().int().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-promotions-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const promo = await StorePageDB.updatePromotion(auth.tenantId, id, parsed.data);
    if (!promo) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(promo);
  } catch (e) {
    logger.error("[store-page/promotions] PATCH error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al actualizar promoción" },
      { status: 503 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-promotions-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await StorePageDB.deletePromotion(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[store-page/promotions] DELETE error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al eliminar promoción" },
      { status: 503 },
    );
  }
}
