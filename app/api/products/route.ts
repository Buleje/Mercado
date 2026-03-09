import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";

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

    let products = await ProductsDB.getAll();

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

    // Pagination — only applied when ?limit= is provided; keeps existing callers working
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
        },
      });
    }

    return NextResponse.json(products);
  } catch (e) {
    console.error("[products] GET error:", e);
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
    const body = parsed.data;
    const all = await ProductsDB.getAll();
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
    await logActivity("Crear", "producto", `Producto creado: ${product.name} (S/${product.price})`, String(product.id));
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
