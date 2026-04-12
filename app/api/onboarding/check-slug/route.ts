import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createDistributedRateLimiter,
  getClientIp,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const RESERVED = new Set([
  "main", "admin", "api", "www", "app", "mail", "smtp", "ftp",
  "static", "cdn", "assets", "test", "demo", "dev", "staging",
  "prod", "production", "support", "help", "blog",
  "shop", "store", "tienda", "registro", "login",
  "superadmin",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// Rate limit GENEROUS: 100 checks/minuto por IP
const checkSlugLimiter = createDistributedRateLimiter({
  key: "onboarding:check-slug",
  maxRequests: 100,
  windowMs: 60 * 1000,
});

/** Genera sugerencia de slug disponible */
function buildSuggestion(base: string): string {
  const clean = base.replace(/[^a-z0-9]/g, "-").slice(0, 26);
  const num = Math.floor(10 + Math.random() * 90);
  return `${clean}-${num}`;
}

// GET /api/onboarding/check-slug?slug=mi-tienda
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const allowed = await checkSlugLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase().trim() ?? "";

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({
      available: false,
      reason: "Formato inválido. Usa letras minúsculas, números y guiones (mínimo 4 caracteres).",
    });
  }

  if (RESERVED.has(slug)) {
    return NextResponse.json({
      available: false,
      reason: "Subdominio reservado.",
      suggestion: buildSuggestion(slug),
    });
  }

  let existing: { id: string } | null = null;
  try {
    existing = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
  } catch (err) {
    logger.error("[check-slug] Error consultando DB", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error interno al verificar disponibilidad" },
      { status: 500 },
    );
  }

  if (existing) {
    logger.debug("[check-slug] Slug tomado", { slug, ip });
    return NextResponse.json({
      available: false,
      suggestion: buildSuggestion(slug),
    });
  }

  logger.debug("[check-slug] Slug disponible", { slug, ip });
  return NextResponse.json({ available: true });
}
