import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/clear-data
 * Nuclear delete: removes ALL business data from every table in FK-safe order.
 * Settings and AdminUser rows are intentionally preserved.
 * Body: { confirm: "BORRAR_TODO", categories?: string[] }
 */

// Delete order: children first, parents last (FK-safe)
const FULL_DELETE_ORDER: Array<[keyof typeof prisma, string]> = [
  // junction / leaf tables first
  ["aBTestEvent",          "aBTestEvent"],
  ["surveyResponse",       "surveyResponse"],
  ["pageVersion",          "pageVersion"],
  ["pageBlock",            "pageBlock"],
  ["blockTemplate",        "blockTemplate"],
  ["media",                "media"],
  ["themeSettings",        "themeSettings"],
  ["navigation",           "navigation"],
  ["aBTest",               "aBTest"],
  ["page",                 "page"],
  ["pushSubscription",     "pushSubscription"],
  ["customerNotification", "customerNotification"],
  ["notificationLog",      "notificationLog"],
  ["activityLog",          "activityLog"],
  ["adminMessage",         "adminMessage"],
  ["chatMessage",          "chatMessage"],
  ["returnItem",           "returnItem"],
  ["return",               "return"],
  ["expense",              "expense"],
  ["cashMovement",         "cashMovement"],
  ["cashRegister",         "cashRegister"],
  ["promotion",            "promotion"],
  ["coupon",               "coupon"],
  ["saleItem",             "saleItem"],
  ["sale",                 "sale"],
  ["deliverySlot",         "deliverySlot"],
  ["orderItem",            "orderItem"],
  ["order",                "order"],
  ["supplierEvaluation",   "supplierEvaluation"],
  ["purchaseItem",         "purchaseItem"],
  ["purchaseOrder",        "purchaseOrder"],
  ["payment",              "payment"],
  ["payable",              "payable"],
  ["review",               "review"],
  ["savedCart",            "savedCart"],
  ["savedLocation",        "savedLocation"],
  ["shoppingListItem",     "shoppingListItem"],
  ["shoppingList",         "shoppingList"],
  ["bundleItem",           "bundleItem"],
  ["bundle",               "bundle"],
  ["priceHistory",         "priceHistory"],
  ["inventoryMovement",    "inventoryMovement"],
  // parents last
  ["supplier",             "supplier"],
  ["customer",             "customer"],
  ["product",              "product"],
];

const CATEGORY_DELETIONS: Record<string, Array<[keyof typeof prisma, string]>> = {
  products: [
    ["bundleItem","bundleItem"],["bundle","bundle"],
    ["priceHistory","priceHistory"],["inventoryMovement","inventoryMovement"],
    ["saleItem","saleItem"],["purchaseItem","purchaseItem"],["orderItem","orderItem"],
    ["product","product"],
  ],
  customers: [
    ["customerNotification","customerNotification"],["savedCart","savedCart"],
    ["savedLocation","savedLocation"],["shoppingListItem","shoppingListItem"],
    ["shoppingList","shoppingList"],["customer","customer"],
  ],
  orders: [
    ["deliverySlot","deliverySlot"],["orderItem","orderItem"],["order","order"],
  ],
  sales: [
    ["saleItem","saleItem"],["sale","sale"],
  ],
  suppliers: [
    ["supplierEvaluation","supplierEvaluation"],["purchaseItem","purchaseItem"],
    ["purchaseOrder","purchaseOrder"],["payment","payment"],["payable","payable"],
    ["supplier","supplier"],
  ],
  promotions: [
    ["promotion","promotion"],["coupon","coupon"],
  ],
  cash: [
    ["cashMovement","cashMovement"],["cashRegister","cashRegister"],
  ],
  reviews: [
    ["review","review"],
  ],
  expenses: [
    ["expense","expense"],
  ],
  returns: [
    ["returnItem","returnItem"],["return","return"],
  ],
  activity: [
    ["activityLog","activityLog"],["adminMessage","adminMessage"],
    ["chatMessage","chatMessage"],["notificationLog","notificationLog"],
  ],
  cms: [
    ["aBTestEvent","aBTestEvent"],["aBTest","aBTest"],["surveyResponse","surveyResponse"],
    ["pageVersion","pageVersion"],["pageBlock","pageBlock"],["page","page"],
    ["blockTemplate","blockTemplate"],["media","media"],["themeSettings","themeSettings"],
    ["navigation","navigation"],
  ],
  notifications: [
    ["pushSubscription","pushSubscription"],["customerNotification","customerNotification"],
    ["notificationLog","notificationLog"],
  ],
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    if (body?.confirm !== "BORRAR_TODO") {
      return NextResponse.json({ error: "Se requiere confirmación" }, { status: 400 });
    }

    const categories: string[] | undefined = body?.categories;
    const deleted: string[] = [];
    const failed: string[] = [];

    const { tenantId } = auth;

    if (!categories || categories.length === 0) {
      // Full nuclear delete in correct FK order — SCOPED TO TENANT
      for (const [model, label] of FULL_DELETE_ORDER) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma[model] as any).deleteMany({ where: { tenantId } });
          deleted.push(label);
        } catch (e) {
          logger.warn("[CLEAR-DATA] skip", { label, tenantId, error: (e as Error).message });
          failed.push(label);
        }
      }
    } else {
      // Delete only selected categories (FK-safe per category) — SCOPED TO TENANT
      for (const key of categories) {
        const pairs = CATEGORY_DELETIONS[key];
        if (!pairs) continue;
        for (const [model, label] of pairs) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma[model] as any).deleteMany({ where: { tenantId } });
            deleted.push(label);
          } catch (e) {
            logger.warn("[CLEAR-DATA] skip", { label, tenantId, error: (e as Error).message });
            failed.push(label);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
      skipped: failed.length,
      message: `Datos eliminados correctamente (${deleted.length} tablas). ${failed.length > 0 ? `${failed.length} omitidas.` : ""}`,
    });
  } catch (e) {
    logger.error("[CLEAR-DATA] Fatal error", { tenantId: auth.tenantId, error: (e as Error).message });
    return NextResponse.json({ error: `Error al eliminar datos: ${(e as Error).message}` }, { status: 500 });
  }
}

