import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RESERVED = new Set([
  "main", "admin", "api", "www", "app", "mail", "smtp", "ftp",
  "static", "cdn", "assets", "test", "demo", "dev", "staging",
  "prod", "production", "support", "help", "blog",
  "shop", "store", "tienda", "registro", "login",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// GET /api/onboarding/check-slug?slug=mi-tienda
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "check-slug");
  if (limited) return limited;

  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase().trim() ?? "";

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({
      available: false,
      reason: "Formato inválido. Usa letras minúsculas, números y guiones (mínimo 4 caracteres).",
    });
  }

  if (RESERVED.has(slug)) {
    return NextResponse.json({ available: false, reason: "Subdominio reservado." });
  }

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  return NextResponse.json({ available: !existing });
}
