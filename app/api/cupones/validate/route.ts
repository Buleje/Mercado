import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CuponesDB } from "@/lib/db/cupones.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/cupones/validate
 *
 * Vista "cliente": valida un cupon sin consumirlo.
 * Distinto de /api/coupons/validate (admin) — este se enfoca en el usuario
 * autenticado del storefront.
 */

const ValidateSchema = z.object({
  code: z.string().min(3).max(32),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`cupon:validate:${ip}`, 15, 300);
  if (!allowed) {
    return apiError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      429,
    );
  }

  try {
    const body = await req.json();
    const parsed = ValidateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Codigo invalido", 400, parsed.error.flatten());
    }

    const tenantId = getTenantIdFromRequest(req);
    const userId = req.headers.get("x-user-id") ?? "user_me";

    const result = await CuponesDB.validate(tenantId, parsed.data.code, userId);
    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Cupon no encontrado",
        EXPIRED: "Cupon expirado",
        USED: "Cupon ya usado",
        ALREADY_OWNED: "Ya tienes este cupon",
      };
      return apiError(messages[result.error] ?? "Error al validar", 400);
    }

    return apiSuccess({ cupon: result.cupon });
  } catch (e) {
    logger.error("[cupones/validate] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
