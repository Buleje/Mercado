import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB, OrdersDB, CustomersDB } from "@/lib/jsondb";

export const dynamic = "force-dynamic";

type SuggestionType = "alerta" | "oportunidad" | "optimizacion" | "accion";
interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  body: string;
  module?: string;
  priority: "alta" | "media" | "baja";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const context = req.nextUrl.searchParams.get("context") ?? "general";
  const suggestions: Suggestion[] = [];

  try {
    const [products, orders, customers] = await Promise.all([
      ProductsDB.getAll(auth.tenantId).catch(() => []),
      OrdersDB.getAll(auth.tenantId).catch(() => []),
      CustomersDB.getAll(auth.tenantId).catch(() => []),
    ]);
    void customers; // used in customer suggestions below

    // Inventory suggestions
    if (context === "inventario" || context === "general" || context === "compras") {
      const lowStock = products.filter(p => (p.stock ?? 0) <= (p.stockMin ?? 0));
      const outOfStock = products.filter(p => (p.stock ?? 0) === 0);

      if (outOfStock.length > 0) {
        suggestions.push({
          id: "out-of-stock",
          type: "alerta",
          title: `${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} sin stock`,
          body: `Se acabó el stock de: ${outOfStock.slice(0, 3).map((p: { name: string }) => p.name).join(", ")}${outOfStock.length > 3 ? ` y ${outOfStock.length - 3} más` : ""}. Haz un pedido de compra antes de perder ventas.`,
          module: "compras",
          priority: "alta",
        });
      }

      if (lowStock.length > 0) {
        suggestions.push({
          id: "low-stock",
          type: "accion",
          title: `Stock bajo en ${lowStock.length} producto${lowStock.length > 1 ? "s" : ""}`,
          body: `${lowStock.slice(0, 3).map((p: { name: string }) => p.name).join(", ")} están por debajo del mínimo. Considera reabastecer esta semana.`,
          module: "inventario",
          priority: "media",
        });
      }
    }

    // Orders suggestions
    if (context === "general" || context === "clientes") {
      const now = Date.now();
      const pending = orders.filter((o: { status: string }) => o.status === "pendiente");
      const oldPending = pending.filter((o: { createdAt: string }) => now - new Date(o.createdAt).getTime() > 2 * 60 * 60 * 1000);

      if (oldPending.length > 0) {
        suggestions.push({
          id: "old-pending-orders",
          type: "alerta",
          title: `${oldPending.length} pedido${oldPending.length > 1 ? "s" : ""} sin confirmar hace +2 horas`,
          body: "Los pedidos sin respuesta pueden hacer que los clientes cancelen o pidan a otra parte. Confírmalos ahora.",
          module: "pedidos",
          priority: "alta",
        });
      }
    }

    // Promotions suggestions
    if (context === "promociones" || context === "general") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentOrders = orders.filter((o: { createdAt: string }) => new Date(o.createdAt) > thirtyDaysAgo);

      // Check for slow-moving products
      const soldProductIds = new Set(recentOrders.flatMap((o: { items: { id?: number }[] }) => o.items.map((i: { id?: number }) => i.id)));
      const slowProducts = products.filter(p => p.active && (p.stock ?? 0) > 5 && !soldProductIds.has(p.id));

      if (slowProducts.length > 0) {
        suggestions.push({
          id: "slow-products",
          type: "oportunidad",
          title: `${slowProducts.length} producto${slowProducts.length > 1 ? "s" : ""} sin ventas en 30 días`,
          body: `${slowProducts.slice(0, 2).map((p: { name: string }) => p.name).join(", ")} tienen stock pero no se han vendido. Crea una promoción 2x1 o descuento para moverlos.`,
          module: "promociones",
          priority: "media",
        });
      }
    }

    // Customer suggestions
    if (context === "clientes" || context === "general") {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const customerLastOrder = new Map<string, Date>();
      for (const o of orders) {
        const phone = o.customer?.phone;
        if (!phone) continue;
        const d = new Date(o.createdAt);
        if (!customerLastOrder.has(phone) || d > customerLastOrder.get(phone)!) {
          customerLastOrder.set(phone, d);
        }
      }
      const atRisk = [...customerLastOrder.entries()].filter(([, d]) => d < ninetyDaysAgo).length;
      if (atRisk > 0) {
        suggestions.push({
          id: "at-risk-customers",
          type: "optimizacion",
          title: `${atRisk} cliente${atRisk > 1 ? "s" : ""} inactivo${atRisk > 1 ? "s" : ""} hace 90+ días`,
          body: "Podrías enviar un cupón de reactivación o un mensaje de WhatsApp personalizado para traerlos de vuelta.",
          module: "clientes",
          priority: "media",
        });
      }
    }

    // General business suggestion
    if (context === "general" && suggestions.length === 0) {
      suggestions.push({
        id: "all-good",
        type: "oportunidad",
        title: "Todo en orden ✓",
        body: "No hay alertas urgentes en este momento. Es un buen momento para revisar tus métricas de conversión y explorar nuevas promociones.",
        module: "metricas-conversion",
        priority: "baja",
      });
    }

  } catch { /* return empty on error */ }

  return NextResponse.json({ suggestions: suggestions.slice(0, 5) });
}
