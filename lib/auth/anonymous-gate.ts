import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { CUSTOMER_SESSION } from "@/lib/auth/customer-session";

/**
 * anonymousGate(req) — devuelve `NextResponse` 204 si el request no trae cookie
 * de sesión de customer, o `null` si sí la trae.
 *
 * Úsalo al INICIO de GETs public-facing (listar favoritos, historial, etc.)
 * que de otra forma devolverían 401 para visitantes anónimos. El browser loguea
 * 401 en consola aunque el cliente sepa ignorarlo — 204 No Content es silencioso
 * y expresa intención "sin datos para ti, pero no es un error".
 *
 * Solo para GET idempotentes. POST/PATCH/DELETE siguen con requireCustomer()
 * → 401 cuando no auth (correcto: mutar requiere auth explícita).
 *
 * Uso:
 *   export async function GET(req: NextRequest) {
 *     const anon = anonymousGate(req);
 *     if (anon) return anon;
 *     const customer = await requireCustomer(req);
 *     if (customer instanceof NextResponse) return customer;
 *     // ... lógica autenticada
 *   }
 */
export function anonymousGate(req: NextRequest): NextResponse | null {
  const hasCookie = !!req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  return hasCookie ? null : new NextResponse(null, { status: 204 });
}
