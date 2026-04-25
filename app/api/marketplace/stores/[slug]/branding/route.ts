/**
 * PATCH /api/marketplace/stores/[slug]/branding
 *
 * Permite al dueño/admin de una tienda actualizar `logo` y/o `banner`
 * (URLs públicas por ahora; futuro: integración con Vercel Blob).
 *
 * Permisos: requireAdmin con tenantId match (no se permite editar
 * branding de tiendas de otro tenant).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prismaForTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

const BrandingSchema = z.object({
  logo: z
    .union([z.string().url("URL del logo invalida"), z.literal(""), z.null()])
    .optional(),
  banner: z
    .union([z.string().url("URL del banner invalida"), z.literal(""), z.null()])
    .optional(),
});

export const PATCH = withApiHandler("marketplace-store-branding", async (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => {
  // Permite cualquier rol admin del tenant (admin, owner, manager).
  // El check tenantId-vs-store mas abajo evita cross-tenant edits.
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "store-branding");
  if (rl) return rl;

  const params = await ctx.params;
  const slug = params.slug;
  if (!slug) {
    return NextResponse.json({ error: "Slug requerido" }, { status: 400 });
  }
  const raw = await req.json().catch((err) => {
    logger.warn("[branding] invalid json body", { error: String(err) });
    return null;
  });
  const parsed = BrandingSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const prisma = prismaForTenant(auth.tenantId);
  const store = await prisma.store.findFirst({
    where: { slug, tenantId: auth.tenantId },
    select: { id: true, slug: true, tenantId: true },
  });
  if (!store) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  // Normalizar empty string → null para limpiar el campo en DB.
  const payload: { logo?: string | null; banner?: string | null } = {};
  if (parsed.data.logo !== undefined) {
    payload.logo = parsed.data.logo === "" ? null : parsed.data.logo;
  }
  if (parsed.data.banner !== undefined) {
    payload.banner = parsed.data.banner === "" ? null : parsed.data.banner;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: payload,
    select: { id: true, slug: true, logo: true, banner: true },
  });

  // Invalida los caches que dependen de los datos de la tienda.
  try {
    invalidateByPrefix(`marketplace:stores:slug:${slug}`);
    invalidateByPrefix("marketplace:stores:list");
  } catch (err) {
    logger.error("[branding] cache invalidate failed", { error: String(err) });
  }

  logger.info("[marketplace/branding] updated", {
    slug,
    tenantId: auth.tenantId,
    logo: updated.logo ? "set" : "cleared",
    banner: updated.banner ? "set" : "cleared",
  });

  return NextResponse.json(updated);
});
