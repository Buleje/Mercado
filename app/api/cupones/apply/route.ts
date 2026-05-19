import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CuponesDB } from "@/lib/db/cupones.db";
import { rateLimit, applyRateLimit } from "@/lib/rate-limit";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCustomer } from "@/lib/auth/require-customer";
import { logger } from "@/lib/logger";

/**
 * POST /api/cupones/apply
 *
 * Aplica (registra) un cupon en la coleccion del usuario actual.
 */

const ApplySchema = z.object({
  code: z.string().min(3).max(32),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "cupones-apply"); if (_rl) return _rl;

  // CRITICAL FIX 2026-05-11 (audit P0-7): antes el userId venia de
  // `req.headers.get("x-user-id") ?? "user_me"` — spoofeable y colapsaba a
  // "user_me" para todos los anonimos, permitiendo bypass del rate-limit por
  // usuario y aplicar cupones en nombre de otros. Ahora requiere customer
  // session firmada (cookie HttpOnly).
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { allowed } = rateLimit(`cupon:apply:${customer.customerId}`, 10, 300);
  if (!allowed) {
    return apiError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      429,
    );
  }

  try {
    const body = await req.json();
    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Codigo invalido", 400, parsed.error.flatten());
    }

    const tenantId = customer.tenantId;
    const userId = customer.customerId;
    if (!tenantId || !userId) {
      return apiError("Sesión inválida — vuelve a iniciar sesión", 401);
    }

    const result = await CuponesDB.apply(tenantId, parsed.data.code, userId);
    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Cupon no encontrado",
        EXPIRED: "Cupon expirado",
        USED: "Cupon ya usado",
        ALREADY_OWNED: "Ya tienes este cupon",
      };
      return apiError(messages[result.error] ?? "Error al aplicar", 400);
    }

    return apiSuccess({ cupon: result.cupon }, 201);
  } catch (e) {
    logger.error("[cupones/apply] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
