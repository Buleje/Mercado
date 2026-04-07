/**
 * lib/forecasting/auto-reorder.ts
 *
 * Motor de reorden automática basado en predicciones de demanda.
 *
 * - generateReorderSuggestions: detecta qué productos necesitan reorden
 *   considerando lead time del proveedor y safety stock.
 * - createAutoPurchaseOrders: crea PurchaseOrders reales en DB agrupadas
 *   por proveedor, con status "auto_generated".
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { predictDemand } from "./demand-predictor";
import { PurchasesDB } from "@/lib/db/purchases.db";
import { logActivity } from "@/lib/activity-logger";
import { createNotification } from "@/lib/create-notification";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface ReorderSuggestion {
  productId: number;
  productName: string;
  currentStock: number;
  supplierId: string;
  supplierName: string;
  /** Días que tarda el proveedor (calculado de POs históricas) */
  leadTimeDays: number;
  /** Demanda predicha para el período leadTimeDays */
  demandDuringLeadTime: number;
  /** 20% de la demanda predicha para el período */
  safetyStock: number;
  /** Cantidad a pedir = demandaDuranteLT + safetyStock − stockActual */
  suggestedQuantity: number;
  unitCost: number;
  estimatedTotal: number;
  unit: string;
  confidence: number;
}

export interface AutoPurchaseOrderResult {
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  itemCount: number;
  total: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_LEAD_TIME = 3; // días cuando no hay historial de POs
const SAFETY_STOCK_FACTOR = 0.20; // 20% de la demanda predicha

// ── Helpers internos ──────────────────────────────────────────────────────────

/**
 * Calcula el lead time promedio de un proveedor a partir de sus POs cerradas.
 * Mide días entre createdAt y deliveryDate de POs en estado "recibido".
 */
async function calcLeadTime(supplierId: string, tenantId: string): Promise<number> {
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      supplierId,
      tenantId,
      status: "recibido",
      deliveryDate: { not: null },
    },
    select: { createdAt: true, deliveryDate: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (pos.length === 0) return DEFAULT_LEAD_TIME;

  const diffs = pos
    .filter((po) => po.deliveryDate != null)
    .map((po) => {
      const ms = (po.deliveryDate as Date).getTime() - po.createdAt.getTime();
      return Math.max(ms / (1000 * 60 * 60 * 24), 0);
    });

  if (diffs.length === 0) return DEFAULT_LEAD_TIME;

  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(Math.ceil(avg), 1);
}

/**
 * Obtiene el último proveedor y costo de un producto a partir de PurchaseItems.
 */
async function getLastSupplier(
  productId: number,
  tenantId: string,
): Promise<{ supplierId: string; supplierName: string; unitCost: number } | null> {
  const item = await prisma.purchaseItem.findFirst({
    where: {
      productId,
      purchaseOrder: { tenantId },
    },
    orderBy: { id: "desc" },
    select: {
      unitCost: true,
      purchaseOrder: {
        select: { supplierId: true, supplierName: true },
      },
    },
  });

  if (!item) return null;

  return {
    supplierId: item.purchaseOrder.supplierId,
    supplierName: item.purchaseOrder.supplierName,
    unitCost: item.unitCost,
  };
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Analiza todos los productos activos del tenant y devuelve los que
 * necesitan reorden: aquellos cuyo stock actual < demanda durante lead time + safety stock.
 */
export async function generateReorderSuggestions(
  tenantId: string,
): Promise<ReorderSuggestion[]> {
  // 1. Productos activos con stock conocido
  const products = await prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null, stock: { not: null } },
    select: { id: true, name: true, stock: true, costPrice: true, unit: true },
  });

  const suggestions: ReorderSuggestion[] = [];

  for (const product of products) {
    const currentStock = product.stock ?? 0;

    // 2. Obtener proveedor histórico
    const supplierInfo = await getLastSupplier(product.id, tenantId);
    if (!supplierInfo) continue; // sin proveedor conocido, no se puede ordenar

    // 3. Calcular lead time del proveedor
    const leadTimeDays = await calcLeadTime(supplierInfo.supplierId, tenantId);

    // 4. Predecir demanda para el período de lead time
    const prediction = await predictDemand(tenantId, product.id, leadTimeDays);
    if (!prediction || prediction.predictedQuantity === 0) continue;

    const demandDuringLeadTime = prediction.predictedQuantity;
    const safetyStock = Math.ceil(demandDuringLeadTime * SAFETY_STOCK_FACTOR);
    const reorderPoint = demandDuringLeadTime + safetyStock;

    // 5. Solo incluir si el stock actual no cubre la demanda + safety
    if (currentStock >= reorderPoint) continue;

    const suggestedQuantity = Math.max(reorderPoint - currentStock, 1);
    const unitCost = supplierInfo.unitCost ?? product.costPrice ?? 0;

    suggestions.push({
      productId: product.id,
      productName: product.name,
      currentStock,
      supplierId: supplierInfo.supplierId,
      supplierName: supplierInfo.supplierName,
      leadTimeDays,
      demandDuringLeadTime,
      safetyStock,
      suggestedQuantity,
      unitCost,
      estimatedTotal: Math.round(suggestedQuantity * unitCost * 100) / 100,
      unit: product.unit,
      confidence: prediction.confidence,
    });
  }

  // Ordenar por urgencia: menor stock primero
  return suggestions.sort((a, b) => a.currentStock - b.currentStock);
}

/**
 * Crea PurchaseOrders reales en DB a partir de las sugerencias.
 * Agrupa por proveedor para minimizar el número de órdenes.
 * Status: "auto_generated" para distinguirlas de las manuales.
 */
export async function createAutoPurchaseOrders(
  tenantId: string,
  suggestions: ReorderSuggestion[],
): Promise<AutoPurchaseOrderResult[]> {
  if (suggestions.length === 0) return [];

  // Agrupar sugerencias por proveedor
  const bySupplier = new Map<
    string,
    { supplierName: string; items: ReorderSuggestion[] }
  >();

  for (const s of suggestions) {
    if (!bySupplier.has(s.supplierId)) {
      bySupplier.set(s.supplierId, { supplierName: s.supplierName, items: [] });
    }
    bySupplier.get(s.supplierId)!.items.push(s);
  }

  const results: AutoPurchaseOrderResult[] = [];

  for (const [supplierId, { supplierName, items }] of bySupplier.entries()) {
    const total = items.reduce((sum, i) => sum + i.estimatedTotal, 0);
    const poId = `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Crear la PO usando la DB class (no Prisma directo)
    const now = new Date().toISOString();
    const po = await PurchasesDB.add({
      id: poId,
      supplierId,
      supplierName,
      total: Math.round(total * 100) / 100,
      status: "auto_generated",
      notes: `Generado automáticamente por AI Demand Forecasting — ${new Date().toLocaleDateString("es-PE")}`,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.productName,
        quantity: i.suggestedQuantity,
        unitCost: i.unitCost,
        unit: i.unit,
      })),
      createdAt: now,
      updatedAt: now,
    });

    // Fire-and-forget: registrar actividad
    logActivity(
      "auto_purchase_order_created",
      "PurchaseOrder",
      `PO auto-generada para ${supplierName}: ${items.length} productos, total S/ ${total.toFixed(2)}`,
      po.id,
      "ai-forecasting",
    ).catch(() => {});

    // Fire-and-forget: notificar al admin
    createNotification({
      tenantId,
      title: "Orden de compra generada automáticamente",
      body: `${items.length} producto(s) para ${supplierName} — S/ ${total.toFixed(2)}`,
      type: "purchase",
      severity: "MEDIUM",
      entityId: po.id,
    }).catch(() => {});

    results.push({
      supplierId,
      supplierName,
      purchaseOrderId: po.id,
      itemCount: items.length,
      total: Math.round(total * 100) / 100,
    });
  }

  return results;
}
