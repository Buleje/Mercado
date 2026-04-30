import { NextRequest, NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getTenantIdFromRequest } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "reviews");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "1";
    const productIdParam = searchParams.get("productId");
    const productId = productIdParam ? Number(productIdParam) : undefined;

    if (all) {
      const auth = await requireAdmin(req);
      if (auth instanceof NextResponse) return auth;
      const reviews = await ReviewsDB.getAll(auth.tenantId);
      return NextResponse.json(reviews);
    }

    // Public: only approved; optional productId filter
    const tenantId = getTenantIdFromRequest(req);
    const reviews = await ReviewsDB.getApproved(tenantId, productId);
    return NextResponse.json(reviews, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    logger.error("[reviews] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "reviews");
  if (rl) return rl;

  const tenantId = getTenantIdFromRequest(req);

  try {
    const body = await req.json() as {
      id: string;
      name?: string;
      location?: string;
      text: string;
      rating: number;
      phone?: string;
      productId?: number;
      date: string;
    };
    if (!body.text?.trim() || !body.rating) {
      return NextResponse.json({ error: "text and rating are required" }, { status: 400 });
    }
    const review = await ReviewsDB.add({
      id: body.id,
      name: body.name ?? "",
      location: body.location ?? "",
      text: body.text,
      rating: body.rating,
      phone: body.phone ?? null,
      productId: body.productId ?? null,
      status: "pending",
      date: body.date,
    }, tenantId);
    return NextResponse.json(review);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
