import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCustomerToken,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";

/**
 * POST /api/auth/customer/test-session
 *
 * SOLO para tests E2E Playwright. Firma una cookie HttpOnly real con
 * AUTH_SECRET sin pasar por OTP, para eliminar race conditions en suites
 * automatizadas.
 *
 * GATE DURO: visible únicamente cuando NODE_ENV=test o ALLOW_E2E_TEST_AUTH=1.
 * En producción devuelve 404 (oculta su propia existencia).
 *
 * NO modifica el flujo de login existente.
 */

const TestSessionSchema = z.object({
  phone: z.string().min(1, "phone requerido"),
  name: z.string().min(1, "name requerido"),
  customerId: z.string().optional(),
  tenantId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Gate duro — evaluar en runtime para respetar hot-reload de env vars.
  // En producción este endpoint devuelve 404 (oculta su propia existencia).
  const e2eAllowed =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_E2E_TEST_AUTH === "1";
  if (!e2eAllowed) {
    return NextResponse.json(null, { status: 404 });
  }

  // Parsear body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud invalido" },
      { status: 400 },
    );
  }

  // Validar con safeParse (regla #2)
  const parsed = TestSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { phone, name, customerId, tenantId } = parsed.data;

  // Reusar createCustomerToken — mismo HMAC-SHA256 que OTP/verify (líneas 160-166)
  // email placeholder idéntico al patrón de otp/verify/route.ts
  const resolvedTenantId = tenantId ?? "main";
  const token = await createCustomerToken({
    customerId: customerId ?? phone,
    email: `${phone}@phone.buleje.pe`,
    name,
    tenantId: resolvedTenantId,
    provider: "e2e",
  });

  // Cookie HttpOnly — misma config que otp/verify/route.ts (líneas 175-181)
  const response = NextResponse.json({ ok: true, phone, name });
  response.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CUSTOMER_SESSION.MAX_AGE,
    path: "/",
  });

  return response;
}

// Cualquier otro método → 405
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
