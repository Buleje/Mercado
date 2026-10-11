import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, SalesDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { enqueueActivityLog } from "@/lib/queue";

/**
 * GET /api/customers/[phone]/compras — lo que compró un cliente, para la ficha
 * 360 del panel: sus pedidos y sus ventas del POS, con los productos.
 *
 * Por qué existe (10-10): la ficha pedía /api/customers/[phone]/orders, que es
 * la ruta PÚBLICA del cliente — sólo responde con la sesión del propio
 * teléfono y, sin ella, devuelve `[]` (HOTFIX-C6). Desde el panel nunca hay
 * esa sesión: «Gastado S/ 0,00», historial y productos favoritos vacíos para
 * TODOS los clientes, y las ventas del POS ni se pedían.
 *
 * Mismos roles que GET /api/customers/[phone] (la ficha entera). La venta del
 * POS sale con `status: "entregado"` (ya está cobrada) y `origen: "venta"`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "customer-compras");
  if (rl) return rl;
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  if (!/^\d{6,15}$/.test(normalized)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  try {
    const [pedidos, ventas] = await Promise.all([
      OrdersDB.getByCustomerPhone(auth.tenantId, normalized),
      SalesDB.getByCustomerPhone(auth.tenantId, normalized),
    ]);
    enqueueActivityLog({
      action: "leer",
      resource: "cliente_pii",
      resourceId: normalized,
      userId: auth.username,
      tenantId: auth.tenantId,
      details: { description: `Compras del cliente ${normalized.slice(-4)} desde la ficha 360 del panel` },
      timestamp: new Date().toISOString(),
    }).catch((err) => logger.warn("[customers/compras] activity log failed", { error: String(err) }));
    const compras = [
      ...pedidos.map((o) => ({
        id: o.id,
        origen: "pedido" as const,
        status: o.status,
        total: o.total,
        paymentMethod: o.paymentMethod,
        items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, price: i.price })),
        createdAt: o.createdAt,
      })),
      ...ventas.map((s) => ({
        id: s.id,
        origen: "venta" as const,
        status: "entregado",
        total: s.total,
        paymentMethod: s.payment,
        items: s.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, price: i.price })),
        createdAt: s.createdAt,
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return NextResponse.json(compras);
  } catch (e) {
    logger.error("[customers/compras] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
