/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, tryAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";

const PutSchema = z.object({
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywordsJson: z.string().max(500).optional(),
  ogImage: z.string().url().max(500).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const productId = parseInt(idStr, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
  }

  // SECURITY 2026-05-06: si hay sesión admin, usar JWT.tenantId para evitar
  // que un admin lea SEO de OTRO tenant inyectando header. Anónimos siguen
  // dependiendo del header (proxy lo setea desde subdominio).
  const session = await tryAdmin(req);
  const tenantId = session?.tenantId ?? req.headers.get("x-tenant-id") ?? "main";

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
    select: { metaTitle: true, metaDescription: true, metaKeywordsJson: true, ogImage: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const metaKeywords = product.metaKeywordsJson
    ? (() => {
        try { return JSON.parse(product.metaKeywordsJson); } catch { return []; }
      })()
    : [];

  return NextResponse.json({
    metaTitle: product.metaTitle ?? null,
    metaDescription: product.metaDescription ?? null,
    metaKeywords,
    ogImage: product.ogImage ?? null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id: idStr } = await params;
  const productId = parseInt(idStr, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
  }

  const body = await req.json().catch((err) => { logger.error("[marketplace/products/[id]/seo] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await prisma.product.updateMany({
    where: { id: productId, tenantId: auth.tenantId, deletedAt: null },
    data: parsed.data,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  invalidateByPrefix(`marketplace:product:${productId}`);

  return NextResponse.json({ ok: true });
}
