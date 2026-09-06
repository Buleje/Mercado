import "server-only";
import type { NextRequest } from "next/server";
import {
  CUSTOMER_SESSION,
  getCustomerPayload,
} from "@/lib/auth/customer-session";
import { normalizePhone } from "@/lib/db/misc.db";

/**
 * Phone NORMALIZADO del cliente logueado (la clave de identidad de la junta),
 * o null si no hay sesión. Misma normalización que el resto del storefront.
 */
export async function customerPhoneFromReq(
  req: NextRequest,
): Promise<string | null> {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await getCustomerPayload(token);
  return payload?.customerId ? normalizePhone(payload.customerId) : null;
}
