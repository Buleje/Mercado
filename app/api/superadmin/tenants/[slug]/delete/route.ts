import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/** Helper: delete rows by tenantId (tries both tenant.id and slug) */
async function deleteByTenant(table: string, tenantId: string, slug: string): Promise<number> {
  try {
    return await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "tenantId" = $1 OR "tenantId" = $2`,
      tenantId, slug,
    );
  } catch {
    return 0; // Table might not have tenantId column
  }
}

/** Helper: delete rows by subquery on parent FK */
async function deleteByParentFK(
  childTable: string, childFK: string,
  parentTable: string, parentPK: string,
  tenantId: string, slug: string,
): Promise<number> {
  try {
    return await prisma.$executeRawUnsafe(
      `DELETE FROM "${childTable}" WHERE "${childFK}" IN (
        SELECT "${parentPK}" FROM "${parentTable}" WHERE "tenantId" = $1 OR "tenantId" = $2
      )`,
      tenantId, slug,
    );
  } catch {
    return 0;
  }
}

// DELETE /api/superadmin/tenants/[slug]/delete
// Elimina una tienda y TODOS sus datos asociados en cascada.
// Requiere sesión SuperAdmin (PLATFORM_SESSION).
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
    // Verificar que el tenant existe antes de intentar borrar
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Proteger tenants del sistema
    if (slug === "main") {
      return NextResponse.json(
        { error: "No se puede eliminar la tienda principal del sistema" },
        { status: 403 },
      );
    }

    // ── Phase 1: Delete child tables that reference OTHER tables by non-tenantId FK ──
    // These don't have tenantId, so we delete by subquery on their parent's FK
    let deletedCount = 0;
    const phase1: [string, string, string, string][] = [
      // [childTable, childFK, parentTable, parentPK]
      ["StoreProduct", "storeId", "Store", "id"],
      ["StorePermission", "storeId", "Store", "id"],
      ["DeliveryAssignment", "orderId", "Order", "id"],
      ["WholesaleOrderItem", "wholesaleOrderId", "WholesaleOrder", "id"],
      ["SupplierPortal", "supplierId", "Supplier", "id"],
    ];
    for (const [child, fk, parent, pk] of phase1) {
      deletedCount += await deleteByParentFK(child, fk, parent, pk, tenant.id, slug);
    }

    // ── Phase 2: Delete all tables that HAVE tenantId column ──
    // Order: child items first, then documents, then catalogs
    const tablesWithTenantId = [
      // Items/detalles (FK a documentos padre)
      "OrderItem", "SaleItem", "ReturnItem", "FiadoCuota", "PrestamoCuota",
      "PrestamoDocumento", "PurchaseItem", "BundleItem", "ShoppingListItem",
      "OrderStatusHistory", "RecetaIngrediente", "CotizacionItem", "PageBlock",
      "PageVersion", "ABTestEvent", "GuiaRemisionItem", "ConteoFisicoItem",
      "SupplierReturnItem",
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
      // Catálogos / maestros
      "Batch", "Transfer", "Merma", "DiscountRule", "CommissionRule",
      "ComplianceItem", "CustomKpi", "PriceHistory",
      "Review", "Product", "Customer", "Supplier", "Promotion", "Coupon",
      "Expense", "DeliverySlot", "Note", "Media", "Reminder",
      "MessageTemplate", "ChatMessage", "SavedFilter", "SurveyResponse",
      "NewsletterSubscriber", "Campaign", "DailySummary", "Warehouse",
      "VisitorWelcome", "SavedCart", "SavedLocation", "SupplierEvaluation",
      "Location", "SupportTicket",
      // Configuración y sistema
      "AdminUser", "Settings", "NotificationLog", "PushSubscription",
      "ActivityLog", "AdminMessage", "ThemeSettings", "Navigation",
      "TenantInvitation", "CronDeadLetter", "ApiKey",
      // Store (after its children were deleted in Phase 1)
      "Store",
    ];
    for (const table of tablesWithTenantId) {
      deletedCount += await deleteByTenant(table, tenant.id, slug);
    }

    // ── Phase 3: Delete the tenant itself ──
    await prisma.tenant.delete({ where: { slug } });

    logger.info("[SuperAdmin] Tenant deleted", {
      username: session.username,
      slug,
      tenantName: tenant.name,
    });

    return NextResponse.json({
      deleted: slug,
      tenantName: tenant.name,
      deletedRows: deletedCount,
      message: "Tienda y todos sus datos eliminados permanentemente",
    });
  } catch (e) {
    logger.error("[SuperAdmin] Error deleting tenant", {
      err: e instanceof Error ? e.message : String(e),
      slug,
    });
    return NextResponse.json(
      { error: "Error al eliminar la tienda" },
      { status: 500 },
    );
  }
}
