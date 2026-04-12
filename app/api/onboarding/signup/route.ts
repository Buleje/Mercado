import { NextRequest, NextResponse } from "next/server";
import { SignupSchema } from "@/lib/onboarding/validators";
import {
  createTenantFromSignup,
  SlugTakenError,
} from "@/lib/onboarding/signup-flow";
import {
  createDistributedRateLimiter,
  getClientIp,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

// Rate limit STRICT para signups: 3 por hora por IP
const signupLimiter = createDistributedRateLimiter({
  key: "onboarding:signup",
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hora
});

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const ip = getClientIp(req);
  const allowed = await signupLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "Demasiadas solicitudes",
        message:
          "Has excedido el límite de registros por hora. Intenta más tarde.",
      },
      { status: 429 },
    );
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Datos inválidos", message: "El body no es JSON válido" },
      { status: 400 },
    );
  }

  // 3. Validación Zod (safeParse, nunca parse)
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 4. Orquestador de onboarding
  try {
    const result = await createTenantFromSignup(parsed.data);

    // Fire-and-forget: log de actividad de plataforma
    logActivity(
      "TENANT_CREATED",
      "Tenant",
      `Nuevo tenant registrado via onboarding: ${parsed.data.slug}`,
      result.tenantId,
      parsed.data.email,
    ).catch(() => {});

    logger.info("[onboarding/signup] Registro exitoso", {
      tenantId: result.tenantId,
      slug: result.slug,
      ip,
    });

    return NextResponse.json(
      {
        tenantId: result.tenantId,
        loginUrl: result.loginUrl,
        message: `¡Tienda "${parsed.data.name}" creada exitosamente! Redirigiendo al login...`,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return NextResponse.json(
        {
          error: "Slug no disponible",
          message: err.message,
          field: "slug",
        },
        { status: 409 },
      );
    }

    logger.error("[onboarding/signup] Error inesperado", {
      error: err instanceof Error ? err.message : String(err),
      ip,
    });

    return NextResponse.json(
      { error: "Error interno", message: "No se pudo crear la tienda. Intenta más tarde." },
      { status: 500 },
    );
  }
}
