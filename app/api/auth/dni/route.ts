import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { lookupDniInReniec } from "@/lib/reniec";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { cacheStore } from "@/lib/cache";

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

  const dni = parsed.data.dni;
  // Hash truncado para logs (Ley 29733 — no loguear PII en plano)
  const dniHash = crypto.createHash("sha256").update(dni).digest("hex").slice(0, 8);

  // Cache 24h — evita llamadas repetidas a RENIEC para el mismo DNI
  const cacheKey = `reniec:dni:${dni}`;
  type ReniecCached = { nombreCompleto: string; nombres: string; apellidoPaterno: string; apellidoMaterno: string };
  const cached = cacheStore.get<ReniecCached>(cacheKey);
  if (cached) {
    logger.debug("[auth/dni] cache hit", { dniHash });
    return NextResponse.json({ ok: true, nombre: cached.nombreCompleto, ...cached });
  }

  try {
    const person = await lookupDniInReniec(dni);

    // Persistir 24h — no loguear datos PII
    const payload: ReniecCached = {
      nombreCompleto: person.nombreCompleto,
      nombres: person.nombres,
      apellidoPaterno: person.apellidoPaterno,
      apellidoMaterno: person.apellidoMaterno,
    };
    cacheStore.set(cacheKey, payload, 86400);

    logger.debug("[auth/dni] lookup ok", { dniHash });

    return NextResponse.json({
      ok: true,
      nombre: person.nombreCompleto,
      nombres: person.nombres,
      apellidoPaterno: person.apellidoPaterno,
      apellidoMaterno: person.apellidoMaterno,
    });
  } catch (err) {
    logger.warn("[auth/dni] lookup failed", {
      dniHash,
      error: String(err),
    });

    return NextResponse.json(
      { ok: false, error: "No pudimos consultar este DNI. Escribe tu nombre manualmente." },
      { status: 404 },
    );
  }
}
