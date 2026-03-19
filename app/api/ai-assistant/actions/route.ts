export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { ProductsDB, OrdersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/ai-assistant/actions
 * Executes business actions requested by the AI assistant.
 * Each action has a type and payload — the assistant suggests them, the user confirms.
 */

type ActionResult = { ok: boolean; message: string; data?: unknown };

async function executeAction(action: { type: string; payload: Record<string, unknown> }): Promise<ActionResult> {
  switch (action.type) {
    // ── Product actions ────────────────────────────────────────────────────
    case "update_price": {
      const { productId, newPrice } = action.payload as { productId: number; newPrice: number };
      if (!productId || typeof newPrice !== "number" || newPrice <= 0) {
        return { ok: false, message: "productId y newPrice (> 0) son requeridos." };
      }
      const product = await ProductsDB.getById(productId);
      if (!product) return { ok: false, message: `Producto #${productId} no encontrado.` };
      const oldPrice = product.price;
      await ProductsDB.upsert({ ...product, price: newPrice });
      return { ok: true, message: `Precio de "${product.name}" actualizado: S/${oldPrice.toFixed(2)} → S/${newPrice.toFixed(2)}` };
    }

    case "update_stock": {
      const { productId, newStock } = action.payload as { productId: number; newStock: number };
      if (!productId || typeof newStock !== "number" || newStock < 0) {
        return { ok: false, message: "productId y newStock (>= 0) son requeridos." };
      }
      const product = await ProductsDB.getById(productId);
      if (!product) return { ok: false, message: `Producto #${productId} no encontrado.` };
      await ProductsDB.upsert({ ...product, stock: newStock });
      return { ok: true, message: `Stock de "${product.name}" actualizado a ${newStock} ${product.unit}` };
    }

    case "toggle_product": {
      const { productId, active } = action.payload as { productId: number; active: boolean };
      if (!productId) return { ok: false, message: "productId es requerido." };
      const product = await ProductsDB.getById(productId);
      if (!product) return { ok: false, message: `Producto #${productId} no encontrado.` };
      await ProductsDB.upsert({ ...product, active: active ?? !product.active });
      return { ok: true, message: `"${product.name}" ${active ? "activado" : "desactivado"} en tienda.` };
    }

    case "create_product": {
      const p = action.payload as {
        name: string; category: string; price: number; unit?: string;
        costPrice?: number; stock?: number; stockMin?: number;
      };
      if (!p.name || !p.category || !p.price) {
        return { ok: false, message: "name, category y price son requeridos." };
      }
      const all = await ProductsDB.getAll();
      const maxId = all.reduce((m, x) => Math.max(m, x.id), 0);
      const newProduct = await ProductsDB.upsert({
        id: maxId + 1,
        name: p.name,
        category: p.category,
        price: p.price,
        costPrice: p.costPrice,
        image: "/placeholder.webp",
        unit: p.unit ?? "unidad",
        stock: p.stock ?? 0,
        stockMin: p.stockMin ?? 5,
        active: true,
      });
      return { ok: true, message: `Producto "${newProduct.name}" creado (ID: ${newProduct.id}, S/${newProduct.price.toFixed(2)})`, data: { id: newProduct.id } };
    }

    // ── Order actions ──────────────────────────────────────────────────────
    case "update_order_status": {
      const { orderId, status } = action.payload as { orderId: string; status: string };
      const validStatuses = ["pendiente", "confirmado", "preparando", "en-camino", "entregado", "cancelado"];
      if (!orderId || !validStatuses.includes(status)) {
        return { ok: false, message: `orderId y status válido (${validStatuses.join(", ")}) son requeridos.` };
      }
      const order = await OrdersDB.update(orderId, { status: status as "pendiente" });
      if (!order) return { ok: false, message: `Pedido ${orderId} no encontrado.` };
      return { ok: true, message: `Pedido ${orderId} actualizado a "${status}".` };
    }

    default:
      return { ok: false, message: `Acción desconocida: "${action.type}". Acciones válidas: update_price, update_stock, toggle_product, create_product, update_order_status.` };
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "STRICT", "ai-actions");
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => null);
  if (!body?.action?.type) {
    return NextResponse.json({ error: "Se requiere { action: { type, payload } }" }, { status: 400 });
  }

  const result = await executeAction(body.action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
