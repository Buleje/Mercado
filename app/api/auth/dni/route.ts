import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lookupDniInReniec } from "@/lib/reniec";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const dniSchema = z.object({
  dni: z
    .string()
    .regex(/^\d{8}$/, "DNI debe tener exactamente 8 dígitos"),
});

/**
 * POST /api/auth/dni
 *
 * Looks up a Peruvian DNI and returns the person's full name.
 * Used in the registration form to auto-fill the name field.
 *
 * Rate limited by the RENIEC client itself (10 req/min per IP).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "auth-dni"); if (_rl) return _rl;
  const body: unknown = await req.json().catch((err) => { logger.warn("[auth/dni] invalid JSON body", { error: String(err) }); return null; });
  const parsed = dniSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "DNI inválido" },
      { status: 400 },
    );
  }

  try {
    const person = await lookupDniInReniec(parsed.data.dni);

    logger.debug("[auth/dni] DNI lookup success", {
      dni: parsed.data.dni,
      name: person.nombreCompleto,
    });

    return NextResponse.json({
      ok: true,
      nombre: person.nombreCompleto,
      nombres: person.nombres,
      apellidoPaterno: person.apellidoPaterno,
      apellidoMaterno: person.apellidoMaterno,
    });
  } catch (err) {
    logger.warn("[auth/dni] DNI lookup failed", {
      dni: parsed.data.dni,
      error: String(err),
    });

    return NextResponse.json(
      { ok: false, error: "No pudimos consultar este DNI. Escribe tu nombre manualmente." },
      { status: 404 },
    );
  }
}
