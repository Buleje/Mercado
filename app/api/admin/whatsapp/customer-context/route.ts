import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CustomersDB } from "@/lib/db/customers.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { FiadosDB } from "@/lib/db/fiados.db";

const PhoneSchema = z.string().regex(/^\d{8,15}$/);

/**
 * GET /api/admin/whatsapp/customer-context?phone= — ficha del cliente del hilo.
 * Cruza el teléfono de WhatsApp con el CRM: pedidos, gasto total y fiado
 * pendiente (oro para cobrar desde el chat).
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-context");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = PhoneSchema.safeParse(req.nextUrl.searchParams.get("phone") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "phone requerido" }, { status: 400 });
  }
  const phone = parsed.data;
  // El webhook guarda E.164 sin + (519...); el CRM suele guardar los 9 locales
  const local = phone.length === 11 && phone.startsWith("519") ? phone.slice(2) : phone;

  try {
    const [customer, orders, fiadosA, fiadosB] = await Promise.all([
      CustomersDB.getByPhone(phone, auth.tenantId),
      OrdersDB.getAllFiltered({ tenantId: auth.tenantId, phone, limit: 200 }),
      FiadosDB.list(auth.tenantId, { customerId: local }),
      local !== phone
        ? FiadosDB.list(auth.tenantId, { customerId: phone })
        : Promise.resolve([]),
    ]);

    const totalSpent = orders
      .filter((o) => o.status !== "cancelado")
      .reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const lastOrderAt = orders[0]?.createdAt ?? null;

    const fiados = [...fiadosA, ...fiadosB];
    const fiadoSaldo = fiados
      .filter((f) => f.status === "ACTIVO" || f.status === "VENCIDO")
      .reduce((acc, f) => acc + (Number(f.saldo) || 0), 0);

    return NextResponse.json({
      customer: customer
        ? {
            name: customer.name,
            loyaltyTier: customer.loyaltyTier,
            loyaltyPoints: customer.loyaltyPoints,
          }
        : null,
      ordersCount: orders.length,
      totalSpent: Math.round(totalSpent * 100) / 100,
      lastOrderAt,
      fiadoSaldo: Math.round(fiadoSaldo * 100) / 100,
    });
  } catch (e) {
    logger.error("[admin/whatsapp/customer-context] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
