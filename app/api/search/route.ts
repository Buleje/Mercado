import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB, CustomersDB, OrdersDB, SuppliersDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "GENEROUS", "search");
  if (limited) return limited;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [products, customers, orders, suppliers] = await Promise.all([
    ProductsDB.getAll(auth.tenantId).catch(() => []),
    CustomersDB.getAll(auth.tenantId).catch(() => []),
    OrdersDB.getAll(auth.tenantId).catch(() => []),
    SuppliersDB.getAll(auth.tenantId).catch(() => []),
  ]);

  type SearchResult = {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    badge?: string;
    badgeColor?: string;
    tab: string;
  };
  const results: SearchResult[] = [];

  // Products
  for (const p of products) {
    if (
      p.name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      String(p.barcode ?? "").includes(q)
    ) {
      results.push({
        id: `producto-${p.id}`,
        type: "producto",
        title: p.name,
        subtitle: `${p.category} · S/${p.price} · Stock: ${p.stock}`,
        badge: (p.stock ?? 0) <= (p.stockMin ?? 0) ? "Stock bajo" : undefined,
        badgeColor: (p.stock ?? 0) <= (p.stockMin ?? 0) ? "#ef4444" : undefined,
        tab: "inventario",
      });
    }
  }

  // Customers
  for (const c of customers) {
    if (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.location?.toLowerCase().includes(q)
    ) {
      results.push({
        id: `cliente-${c.phone}`,
        type: "cliente",
        title: c.name,
        subtitle: `Tel: ${c.phone}${c.location ? " · " + c.location.slice(0, 40) : ""}`,
        tab: "clientes",
      });
    }
  }

  // Orders
  for (const o of orders) {
    if (
      String(o.id).includes(q) ||
      o.customer?.name?.toLowerCase().includes(q) ||
      o.customer?.phone?.includes(q) ||
      o.items?.some((i: { name?: string }) => i.name?.toLowerCase().includes(q))
    ) {
      const statusColors: Record<string, string> = {
        pendiente: "#f59e0b",
        confirmado: "#3b82f6",
        en_camino: "#8b5cf6",
        entregado: "#10b981",
        cancelado: "#ef4444",
      };
      results.push({
        id: `pedido-${o.id}`,
        type: "pedido",
        title: `Pedido #${o.id} – ${o.customer?.name ?? "Sin nombre"}`,
        subtitle: `S/${o.total} · ${new Date(o.createdAt).toLocaleDateString("es-PE")}`,
        badge: o.status,
        badgeColor: statusColors[o.status] ?? "#6b7280",
        tab: "pedidos",
      });
    }
  }

  // Suppliers
  for (const s of suppliers) {
    if (
      s.name?.toLowerCase().includes(q) ||
      s.phone?.includes(q)
    ) {
      results.push({
        id: `proveedor-${s.id}`,
        type: "proveedor",
        title: s.name,
        subtitle: s.phone ? `Tel: ${s.phone}` : "Proveedor",
        tab: "proveedores",
      });
    }
  }

  // Limit to 20 results
  return NextResponse.json({ results: results.slice(0, 20) });
}
