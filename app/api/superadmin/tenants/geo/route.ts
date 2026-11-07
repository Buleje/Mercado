import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";

/**
 * Mapa de tiendas (Brandon 2026-06-14). Tenant no tenía coordenadas; se agregaron
 * lat/lng. Se acceden por raw SQL (columnas nuevas, evita regen del cliente Prisma).
 * GET lista todas (con/sin ubicación); POST setea la ubicación de una tienda.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;
  try {
    const rows = await prisma.$queryRawUnsafe<{ slug: string; name: string; lat: number | null; lng: number | null; active: boolean; plan: string }[]>(
      `SELECT slug, name, lat, lng, active, plan FROM "Tenant" ORDER BY name ASC`,
    );
    const located = rows.filter((r) => r.lat != null && r.lng != null);
    return NextResponse.json({ rows, located: located.length, total: rows.length });
  } catch (e) {
    logger.error("[tenants/geo] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const SetSchema = z.object({
  slug: z.string().min(1).max(64),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "sa-tenant-geo"); if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = SetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET lat = $1, lng = $2 WHERE slug = $3`,
      parsed.data.lat, parsed.data.lng, parsed.data.slug,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[tenants/geo] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
