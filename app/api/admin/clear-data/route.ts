import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — endpoint
// nuclear de eliminación con cookies (requireAdmin) + CSRF + step-up auth.
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clear-data
 * Nuclear delete: removes business data from tables in FK-safe order.
 * Settings, AdminUser y ActivityLog son preservados por defecto:
 *  - Settings/AdminUser: para que la cuenta no se rompa
 *  - ActivityLog: Ley 29733 Art. 11 obliga conservar registros de acceso.
 *    Si un admin malicioso (o cuenta comprometida) borra todo, el log
 *    queda como evidencia. Para borrar logs explícitamente, debe usar
 *    el modo `categories: ["activity"]` con doble confirmación.
 *
 * Body: { confirm: "BORRAR_TODO", confirmUsername: "<su-username>", categories?: string[] }
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
  // ❌ activityLog NUNCA va en el FULL_DELETE: Ley 29733 Art. 11
  // (obligación de conservar registros de acceso a datos personales).
  // Si el usuario realmente quiere borrarlo, debe pedirlo explícito vía
  // categories=["activity"] con doble confirmación.
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
  const _rl = await applyRateLimit(req, "MODERATE", "admin-clear-data"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    if (body?.confirm !== "BORRAR_TODO") {
      return NextResponse.json({ error: "Se requiere confirmación" }, { status: 400 });
    }
    // Doble confirmación: el admin debe escribir su propio username.
    // Esto evita que un script automatizado o un click accidental ejecute
    // la nuclear-delete con solo la string "BORRAR_TODO".
    if (body?.confirmUsername !== auth.username) {
      return NextResponse.json(
        { error: "Para confirmar, escribí tu usuario actual exactamente." },
        { status: 400 },
      );
    }

    const categories: string[] | undefined = body?.categories;
    const deleted: string[] = [];
    const failed: string[] = [];

    const { tenantId } = auth;

    // ── Audit pre-operación (Ley 29733 Art. 11) ───────────────────────────
    // Registramos la intención ANTES de borrar — si después se elimina
    // explícitamente el activityLog vía categories, este registro ya
    // habrá sido replicado a logs externos (Sentry, Vercel) por el logger.
    logger.error("[CLEAR-DATA] NUCLEAR DELETE INVOKED", {
      tenantId,
      username: auth.username,
      role: auth.role,
      categories: categories ?? "ALL",
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
      timestamp: new Date().toISOString(),
    });
    // Persistir en ActivityLog del tenant — fire-and-forget pero importante
    // eslint-disable-next-line no-restricted-properties -- audit del propio clear-data: tenantId obligatorio en data; no hay AuditDB wrapper específico para esta acción nuclear.
    prisma.activityLog
      .create({
        data: {
          tenantId,
          action: "nuclear-delete",
          entity: "admin.clear-data",
          entityId: JSON.stringify({ categories: categories ?? "ALL" }),
          detail: `Admin "${auth.username}" ejecutó borrado masivo (${categories ? categories.join(",") : "TODO"})`,
          user: auth.username,
        },
      })
      .catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

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

    // COMPLIANCE 2026-05-06 (Ley 29733 Art. 18): audit trail OBLIGATORIO de
    // operaciones destructivas. Antes solo iba a logger sin trazabilidad legal.
    try {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity(
        "clear_data",
        "admin",
        `Borrado masivo: ${deleted.length} tablas (${failed.length} omitidas)`,
        auth.username,
        auth.username,
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    } catch { /* logger no disponible */ }

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

