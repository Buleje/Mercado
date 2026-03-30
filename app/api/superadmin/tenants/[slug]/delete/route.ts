import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
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

    // Usar SQL directo para borrado cascade — más confiable que Prisma ORM
    // porque no depende de que cada modelo tenga `tenantId` en el schema del ORM
    const tables = [
      "OrderItem", "SaleItem", "ReturnItem", "FiadoCuota", "PrestamoCuota",
      "PrestamoDocumento", "PurchaseItem", "BundleItem", "ShoppingListItem",
      "OrderStatusHistory", "RecetaIngrediente", "CotizacionItem", "PageBlock",
      "PageVersion", "ABTestEvent", "Payment", "CashMovement", "InventoryMovement",
      "ProduccionLote", "TreasuryTransferencia", "TreasuryMovimiento",
      "GuiaRemisionItem", "NotaCredito", "GuiaRemision", "Notification",
      "CustomerNotification", "Return", "Order", "Sale", "CashRegister",
      "Fiado", "Prestamo", "PurchaseOrder", "Payable", "ShoppingList", "Bundle",
      "Receta", "Cotizacion", "Page", "ABTest", "Turno", "TreasuryCuenta",
      "Product", "Customer", "Supplier", "Promotion", "Coupon", "Review",
      "Expense", "DeliverySlot", "PriceHistory", "Note", "Media", "Reminder",
      "MessageTemplate", "ChatMessage", "SavedFilter", "SurveyResponse",
      "NewsletterSubscriber", "Campaign", "DailySummary", "Warehouse", "ApiKey",
      "VisitorWelcome", "SavedCart", "SavedLocation", "SupplierEvaluation", "Batch",
      "Transfer", "ConteoFisico", "ConteoFisicoItem", "DiscountRule", "CommissionRule",
      "Merma", "ComplianceItem", "SupplierReturn", "SupplierReturnItem", "CustomKpi",
      "Location", "AdminUser", "Settings", "NotificationLog", "PushSubscription",
      "ActivityLog", "AdminMessage", "ThemeSettings", "Navigation", "TenantInvitation",
      "CronDeadLetter", "Store", "StoreProduct", "StorePermission", "SupplierPortal",
      "DeliveryPartner", "DeliveryAssignment", "WholesaleOrder", "WholesaleOrderItem",
      "CommissionLedger", "SupportTicket", "StripeWebhookQueue",
    ];

    let deletedCount = 0;
    for (const table of tables) {
      try {
        const result = await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1`, slug);
        deletedCount += result;
      } catch {
        // Table might not have tenantId column — skip silently
      }
    }

    // Delete the tenant itself
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
      { error: "Error al eliminar la tienda", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
