import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { CustomersDB } from "@/lib/db/customers.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/customer/me
 *
 * Devuelve los datos del cliente autenticado leyendo la cookie
 * `buleje-customer-sess`. Si no esta autenticado retorna
 * `{ authenticated: false }`.
 *
 * No requiere `requireAdmin` — este endpoint es publico/cliente.
 * La proteccion es la cookie HttpOnly firmada con HMAC-SHA256.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const payload = await getCustomerPayload(token);

  if (!payload) {
    // Token invalido o expirado — limpiar la cookie del cliente
    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  }

  // Enriquecer con datos frescos de DB si el customerId esta disponible
  if (payload.customerId) {
    try {
      const customer = await CustomersDB.getByPhone(payload.customerId);
      if (customer) {
        return NextResponse.json({
          authenticated: true,
          customer: {
            id: customer.phone,
            phone: customer.phone,
            name: customer.name,
            loyaltyPoints: customer.loyaltyPoints,
            loyaltyTier: customer.loyaltyTier,
          },
          tenantId: payload.tenantId,
        });
      }
    } catch (err) {
      // Si la DB falla, devolver datos del token (degradacion graceful)
      logger.warn("[auth/customer/me] DB lookup failed, falling back to token payload", {
        customerId: payload.customerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: datos del token
  return NextResponse.json({
    authenticated: true,
    customer: {
      id: payload.customerId ?? null,
      phone: payload.customerId ?? null,
      name: payload.name,
    },
    tenantId: payload.tenantId,
  });
}
