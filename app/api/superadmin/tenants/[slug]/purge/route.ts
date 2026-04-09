import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateAll } from "@/lib/cache";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/** Helper: delete rows by tenantId (tries both tenant.id and slug) */
async function deleteByTenant(
  table: string,
  tenantId: string,
  slug: string,
): Promise<number> {
  try {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "tenantId" = $1 OR "tenantId" = $2`,
      tenantId,
      slug,
    );
    return result;
  } catch {
    return 0; // Table might not have tenantId column
  }
}

/** Helper: delete rows by subquery on parent FK */
async function deleteByParentFK(
  childTable: string,
  childFK: string,
  parentTable: string,
  parentPK: string,
  tenantId: string,
  slug: string,
): Promise<number> {
  try {
    return await prisma.$executeRawUnsafe(
      `DELETE FROM "${childTable}" WHERE "${childFK}" IN (
        SELECT "${parentPK}" FROM "${parentTable}" WHERE "tenantId" = $1 OR "tenantId" = $2
      )`,
      tenantId,
      slug,
    );
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/superadmin/tenants/[slug]/purge
// "Limpiar datos" de UNA tienda específica — borra productos, pedidos,
// movimientos, ventas y todo los datos de esa tienda, pero MANTIENE
// la tienda (Tenant), usuarios (AdminUser), y configuración (Settings,
// Store, ThemeSettings, Navigation).
// ═══════════════════════════════════════════════════════════════════════
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tienda no encontrada" },
        { status: 404 },
      );
    }

    let deletedCount = 0;

    // ── Phase 1: Delete child tables that reference OTHER tables by non-tenantId FK ──
    const phase1: [string, string, string, string][] = [
      ["StoreProduct", "storeId", "Store", "id"],
      ["DeliveryAssignment", "orderId", "Order", "id"],
      ["WholesaleOrderItem", "wholesaleOrderId", "WholesaleOrder", "id"],
      ["SupplierPortal", "supplierId", "Supplier", "id"],
    ];
    for (const [child, fk, parent, pk] of phase1) {
      deletedCount += await deleteByParentFK(
        child,
        fk,
        parent,
        pk,
        tenant.id,
        slug,
      );
    }

    // ── Phase 2: Delete all data tables that HAVE tenantId column ──
    // Order: child items first, then documents, then catalogs
    const dataTablesOrdered = [
      // Items/detalles (FK a documentos padre)
      "OrderItem", "SaleItem", "ReturnItem", "FiadoCuota", "PrestamoCuota",
      "PrestamoDocumento", "PurchaseItem", "BundleItem", "ShoppingListItem",
      "OrderStatusHistory", "RecetaIngrediente", "CotizacionItem", "PageBlock",
      "PageVersion", "ABTestEvent", "GuiaRemisionItem", "ConteoFisicoItem",
      "SupplierReturnItem", "CreditInstallment",
      // Financieros / movimientos
      "Payment", "CashMovement", "InventoryMovement", "ProduccionLote",
      "TreasuryTransferencia", "TreasuryMovimiento", "CommissionLedger",
      "StripeWebhookQueue",
      // Documentos padre
      "NotaCredito", "GuiaRemision", "Notification", "CustomerNotification",
      "Return", "Order", "Sale", "CashRegister", "Fiado", "Prestamo",
      "PurchaseOrder", "Payable", "ShoppingList", "Bundle", "Receta",
      "Cotizacion", "Page", "ABTest", "Turno", "TreasuryCuenta",
      "ConteoFisico", "SupplierReturn", "WholesaleOrder",
      // Forecast / IA
      "ForecastLog", "ChurnPlaybook", "ChurnSignal", "CreditProfile",
      // Catálogos / maestros
      "Batch", "Transfer", "DiscountRule", "CommissionRule",
      "ComplianceItem", "CustomKpi", "PriceHistory",
      "Review", "Product", "Customer", "Supplier", "Promotion", "Coupon",
      "Expense", "DeliverySlot", "Note", "Media", "Reminder",
      "MessageTemplate", "ChatMessage", "SavedFilter", "SurveyResponse",
      "NewsletterSubscriber", "Campaign", "DailySummary", "Warehouse",
      "VisitorWelcome", "SavedCart", "SavedLocation", "SupplierEvaluation",
      "Location", "SupportTicket", "AdminMessage",
      // SUNAT / WhatsApp Config
      "SunatInvoice", "SupplierOffer", "SupplierPriceVersion", "SupplierRating",
      "TenantSunatConfig", "TenantWhatsAppConfig", "WhatsAppConversation",
      "TenantHealthScore", "MpPendingPlan",
      // Logs (último — no bloquean nada)
      "ActivityLog", "NotificationLog", "CronDeadLetter",
    ];

    for (const table of dataTablesOrdered) {
      deletedCount += await deleteByTenant(table, tenant.id, slug);
    }

    // ── Limpiar caché ──────────────────────────────────────────────────
    invalidateAll();

    logger.info("[SuperAdmin] Tenant data purged", {
      username: session.username,
      tenant: slug,
      deletedRows: deletedCount,
    });

    return NextResponse.json({
      deletedRows: deletedCount,
      tenant: slug,
      message: `Datos de "${tenant.name}" limpiados — ${deletedCount} registros eliminados. La tienda sigue activa pero sin datos.`,
    });
  } catch (e) {
    logger.error("[SuperAdmin] Error purging tenant data", {
      err: e instanceof Error ? e.message : String(e),
      slug,
    });
    return NextResponse.json(
      {
        error: "Error al limpiar datos de la tienda",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
