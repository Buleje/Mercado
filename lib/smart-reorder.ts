/**
 * smart-reorder.ts
 * Algoritmo de sugerencias de reorden inteligente basado en velocidad de venta.
 * NO usa API externa — puro Math sobre datos históricos.
 */

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  currentStock: number;
  dailyRate: number;          // unidades/día promedio
  daysUntilEmpty: number;     // días hasta agotarse
  suggestedQuantity: number;  // para cubrir 15 días de stock
  urgency: "critico" | "pronto" | "planificar";
  estimatedCost: number;      // sugerido * costPrice
}

interface ProductRecord {
  id: number | string;
  name: string;
  stock?: number | null;
  stockMin?: number | null;
  costPrice?: number | null;
  price?: number;
  active?: boolean;
}

interface SaleItem {
  productId: number | string;
  quantity: number;
  name?: string;
}

interface SaleRecord {
  items: SaleItem[];
  createdAt: string;
}

interface OrderItem {
  id: number | string;
  quantity: number;
  name?: string;
}

interface OrderRecord {
  status: string;
  items: OrderItem[];
  createdAt: string;
}

const LEAD_TIME_DAYS = 3;     // días que tarda en llegar el proveedor
const SAFETY_FACTOR = 1.5;    // buffer de seguridad
const TARGET_DAYS = 15;       // cuántos días de stock queremos tener

/**
 * Calcula sugerencias de reorden basadas en velocidad de venta histórica.
 * @param products  Lista de productos activos con stock y costo
 * @param sales     Historial de ventas directas (últimos 30 días)
 * @param orders    Historial de pedidos confirmados (últimos 30 días)
 * @param days      Ventana de análisis en días (default 30)
 */
export function calculateReorderSuggestions(
  products: ProductRecord[],
  sales: SaleRecord[],
  orders: OrderRecord[],
  days = 30,
): ReorderSuggestion[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // ── Acumular unidades vendidas por productId ──────────────────────────────
  const unitsMap = new Map<string, number>();

  for (const sale of sales) {
    const d = new Date(sale.createdAt);
    if (d < cutoff) continue;
    for (const item of sale.items ?? []) {
      const key = String(item.productId);
      unitsMap.set(key, (unitsMap.get(key) ?? 0) + (item.quantity ?? 0));
    }
  }

  for (const order of orders) {
    if (order.status === "cancelado") continue;
    const d = new Date(order.createdAt);
    if (d < cutoff) continue;
    for (const item of order.items ?? []) {
      const key = String(item.id);
      unitsMap.set(key, (unitsMap.get(key) ?? 0) + (item.quantity ?? 0));
    }
  }

  // ── Calcular sugerencias ──────────────────────────────────────────────────
  const suggestions: ReorderSuggestion[] = [];

  for (const product of products) {
    if (product.active === false) continue;

    const stock = product.stock ?? 0;
    const productId = String(product.id);
    const unitsSold = unitsMap.get(productId) ?? 0;

    // Sin historial de ventas → ignorar (no sabemos velocidad)
    if (unitsSold === 0) continue;

    const dailyRate = unitsSold / days;
    const daysUntilEmpty = dailyRate > 0 ? Math.floor(stock / dailyRate) : Infinity;

    // Solo sugerir si se agota dentro de 15 días
    if (daysUntilEmpty > TARGET_DAYS) continue;

    // Punto de reorden: velocidad * lead_time * safety
    const reorderPoint = dailyRate * LEAD_TIME_DAYS * SAFETY_FACTOR;

    // Cantidad sugerida: stock para TARGET_DAYS menos el stock actual
    const targetStock = Math.ceil(dailyRate * TARGET_DAYS);
    const suggestedQuantity = Math.max(
      Math.ceil(targetStock - stock + reorderPoint),
      1,
    );

    const costPrice = product.costPrice ?? (product.price ?? 0) * 0.7;
    const estimatedCost = suggestedQuantity * costPrice;

    const urgency: ReorderSuggestion["urgency"] =
      daysUntilEmpty < 3 ? "critico" :
      daysUntilEmpty < 7 ? "pronto" : "planificar";

    suggestions.push({
      productId,
      productName: product.name,
      currentStock: stock,
      dailyRate: Math.round(dailyRate * 10) / 10,
      daysUntilEmpty: isFinite(daysUntilEmpty) ? daysUntilEmpty : 999,
      suggestedQuantity,
      urgency,
      estimatedCost: Math.round(estimatedCost),
    });
  }

  // Ordenar: crítico primero, luego pronto, luego planificar; dentro de cada grupo por días
  const urgencyOrder: Record<ReorderSuggestion["urgency"], number> = {
    critico: 0,
    pronto: 1,
    planificar: 2,
  };

  return suggestions
    .sort((a, b) => {
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      return uDiff !== 0 ? uDiff : a.daysUntilEmpty - b.daysUntilEmpty;
    })
    .slice(0, 20); // máx 20 sugerencias
}
