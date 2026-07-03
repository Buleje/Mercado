import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { StoreBenefitsDB } from "@/lib/db/store-benefits.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * /api/marketplace/stores/my/fiado
 *
 * Toggle self-serve del beneficio "Acepta fiado" para la tienda del admin
 * autenticado. Vive en `Store.benefits.acceptsFiado` (JSONB, sin migración —
 * mismo canal que verified/searchBoost/ownBanner). Al prenderlo:
 *   - `/tiendas` muestra el chip "Acepta fiado" en la card.
 *   - El filtro "Acepta fiado" incluye la tienda.
 *
 * GET  → estado actual `{ acceptsFiado, hasStore }`.
 * POST → setea `{ enabled }` y devuelve el nuevo estado.
 *
 * El acceso a `Store.benefits` (out-of-schema) va por `StoreBenefitsDB`.
 * requireAdmin + CSRF + rate limit.
 */

const BodySchema = z.object({ enabled: z.boolean() });

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "my-store-fiado-get");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const state = await StoreBenefitsDB.getFiado(auth.tenantId);
    return NextResponse.json(state);
  } catch (err) {
    logger.error("[my/fiado] GET error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "my-store-fiado-set");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "enabled (boolean) requerido" }, { status: 400 });
  }

  try {
    const storeId = await StoreBenefitsDB.setFiado(auth.tenantId, parsed.data.enabled);
    if (!storeId) {
      return NextResponse.json(
        { error: "Aún no tienes una tienda publicada en el marketplace." },
        { status: 404 },
      );
    }

    // Invalida el listado público (SSR + API cachean con este tag).
    revalidateTag("marketplace:stores", "max");

    logActivity(
      parsed.data.enabled ? "Activó" : "Desactivó",
      "fiado",
      `Beneficio "Acepta fiado" en el marketplace ${parsed.data.enabled ? "activado" : "desactivado"}`,
      storeId,
      auth.username,
    ).catch((err) => logger.error("[my/fiado] logActivity failed", { error: String(err) }));

    return NextResponse.json({ ok: true, acceptsFiado: parsed.data.enabled });
  } catch (err) {
    logger.error("[my/fiado] POST error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
