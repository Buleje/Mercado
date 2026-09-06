import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { CustomersDB } from "@/lib/db/customers.db";

/**
 * GET /api/marketplace/checkout/customer-by-phone?phone=9XXXXXXXX&storeSlug=...
 *
 * Público (sin auth): autocompleta el NOMBRE DE PILA del comprador en el
 * checkout invitado cuando es un cliente que ya compró antes en esta tienda.
 * Le ahorra re-tipear su nombre en cada pedido (el guest-checkout no tiene
 * sesión que recuerde sus datos).
 *
 * Privacidad (Ley 29733): expone SOLO el primer nombre, scoped al tenant del
 * store (jamás enumeración cross-tenant) y bajo rate limit ESTRICTO (anti-enum).
 * Decisión de negocio (Brandon, 2026-06-18): el tradeoff de enumeración de
 * nombres de pila es aceptable a cambio de la UX de autocompletado. No expone
 * apellidos, email, dirección ni si el teléfono "existe" en otros tenants.
 *
 * Mirrors el patrón público de /api/marketplace/ruc-lookup (proxy + rate limit).
 */

const QuerySchema = z.object({
  // Móvil peruano: 9 + 8 dígitos. Misma validación que el form de datos.
  phone: z.string().regex(/^9\d{8}$/),
  storeSlug: z.string().min(1).max(120),
});

export async function GET(req: NextRequest) {
  // STRICT (10 req / 15 min / IP): este endpoint revela PII (un nombre) por
  // teléfono → defensa anti-enumeración. Un cliente legítimo hace 1 lookup.
  const rl = applyRateLimit(req, "STRICT", "marketplace-customer-by-phone");
  if (rl) return rl;

  const traceId = newTraceId();
  try {
    const parsed = QuerySchema.safeParse({
      phone: (req.nextUrl.searchParams.get("phone") ?? "").trim(),
      storeSlug: (req.nextUrl.searchParams.get("storeSlug") ?? "").trim(),
    });
    // No filtramos el motivo exacto del 400: el cliente solo necesita found:false.
    if (!parsed.success) {
      return NextResponse.json({ found: false, firstName: null }, { status: 400 });
    }

    const { phone, storeSlug } = parsed.data;

    // Resolver tenant desde el store (getBySlug ya filtra isPublished). El
    // lookup queda scoped a ESE tenant — sin fuga cross-tenant.
    const store = await MarketplaceStoresDB.getBySlug(storeSlug);
    if (!store) {
      return NextResponse.json({ found: false, firstName: null }, { status: 404 });
    }

    const firstName = await CustomersDB.getFirstNameByPhone(store.tenantId, phone);
    return NextResponse.json({ found: !!firstName, firstName: firstName ?? null });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
