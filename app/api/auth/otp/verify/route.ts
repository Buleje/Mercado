import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/lib/auth/otp-store";
import { CustomersDB } from "@/lib/db/customers.db";
import {
  createCustomerToken,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const VerifyOtpSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine(
      (v) => {
        if (v.length === 9) return /^9\d{8}$/.test(v);
        if (v.length === 11) return /^519\d{8}$/.test(v);
        return false;
      },
      { message: "Numero de telefono invalido." },
    )
    .transform((v) => (v.length === 11 ? v.slice(2) : v)),
  code: z
    .string()
    .trim()
    .length(6, { message: "El codigo debe tener exactamente 6 digitos." })
    .regex(/^\d{6}$/, { message: "El codigo solo puede contener digitos." }),
  name: z.string().trim().min(1).max(100).optional(),
});

// tenantId de plataforma — el marketplace es multi-tenant pero el OTP
// es a nivel de plataforma; los pedidos posteriores incluiran el tenant real.
const PLATFORM_TENANT_ID = "main";

/**
 * POST /api/auth/otp/verify
 * Body: { phone: string; code: string; name?: string }
 *
 * Verifica el OTP, hace upsert del cliente en DB y establece la cookie
 * de sesion `buleje-customer-sess`.
 */
export async function POST(req: NextRequest) {
  // SECURITY 2026-05-06 (audit auth #5): rate limit en /verify para frenar
  // brute-force del OTP de 6 dígitos. Antes solo había contador in-memory de
  // 5 intentos que se evadía cambiando de instance Vercel multi-region.
  // Aplicamos doble: por IP (50/h) y por phone+IP combinado (10/15min).
  const ip = getClientIp(req);
  const ipRl = rateLimit(`otp:verify:ip:${ip}`, 50, 3600);
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 1 hora." },
      { status: 429 },
    );
  }

  // 1. Parseo del body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud invalido" },
      { status: 400 },
    );
  }

  // 2. Validacion
  const parsed = VerifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { phone, code, name } = parsed.data;

  // Rate limit por phone+IP (10 intentos cada 15 min) — anti brute-force.
  const phoneIpRl = rateLimit(`otp:verify:${phone}:${ip}`, 10, 900);
  if (!phoneIpRl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos para este numero. Espera 15 minutos." },
      { status: 429 },
    );
  }

  // 3. Verificar OTP
  const result = verifyOtp(phone, code);

  if (result === "expired") {
    return NextResponse.json(
      { error: "El codigo ha expirado. Solicita uno nuevo." },
      { status: 401 },
    );
  }

  if (result === "max_attempts") {
    return NextResponse.json(
      { error: "Demasiados intentos incorrectos. Solicita un nuevo codigo." },
      { status: 401 },
    );
  }

  if (result === "invalid") {
    return NextResponse.json(
      { error: "Codigo incorrecto. Verifica e intenta de nuevo." },
      { status: 401 },
    );
  }

  // result === "ok"

  // 4. Upsert del cliente (CustomersDB — nunca Prisma directo)
  let isNew = false;
  let customer: { phone: string; name: string } | null = null;

  try {
    const existing = await CustomersDB.getByPhone(phone);
    isNew = !existing;

    const displayName = name?.trim() || existing?.name || `Cliente ${phone.slice(-4)}`;

    const upserted = await CustomersDB.upsert(
      {
        phone,
        name: displayName,
        location: existing?.location ?? "",
        reference: existing?.reference ?? "",
        locations: existing?.locations ?? [],
        activeLocationId: existing?.activeLocationId ?? null,
        loyaltyPoints: existing?.loyaltyPoints ?? 0,
        loyaltyTier: existing?.loyaltyTier ?? "bronce",
        totalSpent: existing?.totalSpent ?? 0,
        creditBalance: existing?.creditBalance ?? 0,
        creditLimit: existing?.creditLimit ?? 0,
        notifOrderUpdates: existing?.notifOrderUpdates ?? true,
        notifPromotions: existing?.notifPromotions ?? true,
        notifRestock: existing?.notifRestock ?? false,
      },
      PLATFORM_TENANT_ID,
    );

    customer = { phone: upserted.phone, name: upserted.name };
  } catch (err) {
    logger.error("[OTP/verify] Error al upsert del cliente", {
      phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error interno al registrar el cliente." },
      { status: 500 },
    );
  }

  // 5. Crear token de sesion firmado (HMAC-SHA256, 30 dias)
  const token = await createCustomerToken({
    customerId: customer.phone,
    email: `${phone}@phone.buleje.pe`, // placeholder — sin email real en flujo OTP
    name: customer.name,
    tenantId: PLATFORM_TENANT_ID,
    provider: "phone",
  });

  // 6. Respuesta con cookie HttpOnly
  const response = NextResponse.json({
    ok: true,
    customer: { id: customer.phone, name: customer.name, phone: customer.phone },
    isNew,
  });

  response.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // "lax" para que sobreviva redirect de OAuth si se combina despues
    maxAge: CUSTOMER_SESSION.MAX_AGE,
    path: "/",
  });

  logger.info("[OTP/verify] Sesion de cliente creada", {
    phone,
    isNew,
    tenantId: PLATFORM_TENANT_ID,
  });

  return response;
}
