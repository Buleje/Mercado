export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { prismaForTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, withinLimit, planLimitPayload } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";

const ProductPostSchema = z.object({
  name: z.string().min(1).max(150),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  image: z.string().max(500).optional(),
  unit: z.string().max(20).optional(),
  badge: z.string().max(50).optional(),
  stock: z.number().min(0).optional(),
  stockMin: z.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category   = searchParams.get("category");
    const search     = searchParams.get("q");
    const onlyActive = searchParams.get("active");
    const limitParam = searchParams.get("limit");
    const pageParam  = searchParams.get("page");

    // Read tenantId from header (injected by proxy from session or cookie)
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    let products = await ProductsDB.getAll(tenantId);

    if (category && category !== "todos") {
      products = products.filter(p => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(q));
    }
    if (onlyActive === "true") {
      products = products.filter(p => p.active !== false);
    }

    const total = products.length;

    // Pagination – only applied when ?limit= is provided; keeps existing callers working
    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 200);
      const page  = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      products = products.slice(start, start + limit);

      return NextResponse.json(products, {
        headers: {
          "X-Total-Count": String(total),
          "X-Page": String(page),
          "X-Limit": String(limit),
          "X-Total-Pages": String(Math.ceil(total / limit)),
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      });
    }

    return NextResponse.json(products, {
      headers: {
        "X-Total-Count": String(total),
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    logger.error("[products] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = ProductPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    // Plan limit check
    const body = parsed.data;

    // Plan limit check
    const tenant = await prisma.tenant.findFirst({ where: { slug: auth.tenantId } });
    const limits = getPlanLimits(tenant?.plan ?? "free");
    const db = prismaForTenant(auth.tenantId);
    const currentProductCount = await db.product.count();
    if (!withinLimit(currentProductCount, limits.maxProducts)) {
      return NextResponse.json(
        planLimitPayload("productos", currentProductCount, limits.maxProducts, tenant?.plan ?? "free"),
        { status: 402 }
      );
    }

    const all = await ProductsDB.getAll(auth.tenantId);
    const newId = all.length > 0 ? Math.max(...all.map((p) => p.id)) + 1 : 1;
    const product = await ProductsDB.upsert({
      id: newId,
      name: body.name,
      category: body.category,
      price: body.price,
      image: body.image ?? "",
      unit: body.unit ?? "und",
      badge: body.badge || undefined,
      active: true,
    });
    const requestId = req.headers.get("x-request-id") ?? undefined;
    await logActivity("Crear", "producto", `Producto creado: ${product.name} (S/${product.price})`, String(product.id), "admin", requestId);
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
