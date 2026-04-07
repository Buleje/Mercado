import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import type { CustomerPayload } from "@/lib/auth/customer-session";
import { logger } from "@/lib/logger";

/**
 * Verify customer session from a store API request.
 * Similar to requireAdmin but for customer-facing APIs.
 *
 * Usage:
 *   const customer = await requireCustomer(req);
 *   if (customer instanceof NextResponse) return customer;
 *   // customer.email, customer.tenantId, customer.customerId available
 */
export async function requireCustomer(
  req: NextRequest,
): Promise<CustomerPayload | NextResponse> {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  if (!token) {
    logger.warn("[CUSTOMER_AUTH] Unauthorized — no session cookie", {
      method,
      path,
      ip,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await getCustomerPayload(token);
  if (!payload) {
    logger.warn("[CUSTOMER_AUTH] Invalid or expired session", {
      method,
      path,
      ip,
    });
    return NextResponse.json({ error: "session expired" }, { status: 401 });
  }

  // Validate tenant consistency: middleware-set header takes precedence
  const headerTenantId = req.headers.get("x-tenant-id");
  if (headerTenantId && headerTenantId !== payload.tenantId) {
    logger.warn("[CUSTOMER_AUTH] Tenant mismatch — forbidden", {
      email: payload.email,
      sessionTenant: payload.tenantId,
      headerTenant: headerTenantId,
      method,
      path,
      ip,
    });
    return NextResponse.json(
      { error: "forbidden", message: "Tenant mismatch" },
      { status: 403 },
    );
  }

  logger.debug("[CUSTOMER_AUTH] OK", {
    email: payload.email,
    customerId: payload.customerId,
    tenantId: payload.tenantId,
    method,
    path,
  });

  return payload;
}
