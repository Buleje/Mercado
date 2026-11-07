import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReviewsDB } from "@/lib/jsondb";
import { ProductsDB } from "@/lib/db/products.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getTenantIdFromRequest } from "@/lib/tenant";

// SECURITY 2026-05-07 (B4): schema Zod para validar body del POST en lugar
// de cast manual. Previene inyección de campos no esperados y asegura tipos.
const ReviewPostSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  text: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5),
  phone: z.string().max(20).optional(),
  productId: z.number().int().positive().optional(),
  date: z.string().min(1).max(50),
});

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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ReviewPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;
    // Multi-tenant (16-10-2026): la FK Review_productId_fkey sólo pide que el
    // producto EXISTA, no que sea de esta tienda. Sin este corte, una reseña
    // con el id de un producto ajeno se guardaba aquí colgada de él.
    if (data.productId != null && !(await ProductsDB.getById(tenantId, data.productId))) {
      return NextResponse.json({ error: "El producto no existe en esta tienda" }, { status: 400 });
    }
    const review = await ReviewsDB.add({
      id: data.id,
      name: data.name ?? "",
      location: data.location ?? "",
      text: data.text,
      rating: data.rating,
      phone: data.phone ?? null,
      productId: data.productId ?? null,
      status: "pending",
      date: data.date,
    }, tenantId);
    return NextResponse.json(review, { status: 201 });
  } catch (e) {
    logger.error("[reviews] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
