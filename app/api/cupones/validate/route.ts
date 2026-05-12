import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CuponesDB } from "@/lib/db/cupones.db";
import { rateLimit, applyRateLimit } from "@/lib/rate-limit";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCustomer } from "@/lib/auth/require-customer";
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
  const _rl = await applyRateLimit(req, "STRICT", "cupones-validate"); if (_rl) return _rl;

  // CRITICAL FIX 2026-05-11 (audit P0-7): autenticación obligatoria. Antes
  // tomaba userId del header (spoof) y rate-limit por IP (compartida). Ahora
  // session firmada + rate-limit por customerId.
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { allowed } = rateLimit(`cupon:validate:${customer.customerId}`, 15, 300);
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

    const tenantId = customer.tenantId;
    const userId = customer.customerId;
    if (!tenantId || !userId) {
      return apiError("Sesión inválida — vuelve a iniciar sesión", 401);
    }

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
