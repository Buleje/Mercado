/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB } from "@/lib/db/marketplace/stores.db";
import { logger } from "@/lib/logger";

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/**
 * GET /api/marketplace/stores/check-slug?slug=mi-bodega
 *
 * Comprueba disponibilidad de un slug de tienda en el marketplace.
 * Si está ocupado y NO pertenece al tenant actual, sugiere alternativas
 * derivadas (sufijos numéricos hasta encontrar libres).
 *
 * Aislamiento: el slug propio del tenant NO se reporta como ocupado.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const slugRaw = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    if (!slugRaw) {
      return NextResponse.json({ valid: false, available: false, reason: "empty" });
    }
    if (!SLUG_REGEX.test(slugRaw)) {
      return NextResponse.json({
        valid: false,
        available: false,
        reason: "invalid",
        message: "Solo minúsculas, números y guiones. Entre 3 y 40 caracteres.",
      });
    }

    // Audit project-wide 2026-05-19: migrado a MarketplaceStoresDB.
    const mySlug = await MarketplaceStoresDB.getMyStoreSlug(auth.tenantId);
    if (mySlug === slugRaw) {
      return NextResponse.json({ valid: true, available: true, isOwn: true });
    }

    const taken = await MarketplaceStoresDB.isSlugTakenCrossStore(slugRaw);
    if (!taken) {
      return NextResponse.json({ valid: true, available: true, isOwn: false });
    }

    // Sugerencias: probar -2, -3, … -10 hasta hallar libres (max 3).
    const suggestions: string[] = [];
    for (let i = 2; i <= 12 && suggestions.length < 3; i++) {
      const candidate = `${slugRaw}-${i}`;
      if (!SLUG_REGEX.test(candidate)) continue;
      const exists = await MarketplaceStoresDB.isSlugTakenCrossStore(candidate);
      if (!exists) suggestions.push(candidate);
    }

    return NextResponse.json({
      valid: true,
      available: false,
      reason: "taken",
      suggestions,
    });
  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
