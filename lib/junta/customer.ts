import "server-only";
import type { NextRequest } from "next/server";
import {
  CUSTOMER_SESSION,
  getCustomerPayload,
  telefonoDeLaSesion,
} from "@/lib/auth/customer-session";

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
  // Solo el teléfono que la sesión PROBÓ (código), nunca un id de Google.
  return telefonoDeLaSesion(payload);
}
