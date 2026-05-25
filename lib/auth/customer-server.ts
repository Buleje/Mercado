import "server-only";
import { cookies } from "next/headers";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import type { CustomerPayload } from "@/lib/auth/customer-session";

/**
 * Lee la sesión del cliente desde las cookies en un Server Component / page.
 * Equivalente a requireCustomer() pero para RSC (no NextRequest).
 * Devuelve null si no hay sesión válida.
 */
export async function getCustomerFromCookies(): Promise<CustomerPayload | null> {
  const token = (await cookies()).get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getCustomerPayload(token);
}

/**
 * Identificador estable del cliente para queries por usuario
 * (gift-cards, cupones, etc.). Usa customerId (Customer.phone) y cae a email.
 * Devuelve null si no hay sesión — las queries deben tratarlo como "sin datos".
 */
export async function getCustomerUserId(): Promise<string | null> {
  const payload = await getCustomerFromCookies();
  if (!payload) return null;
  return payload.customerId ?? payload.email ?? null;
}
