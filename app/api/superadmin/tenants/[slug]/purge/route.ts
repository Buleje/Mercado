import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateAll } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const PurgeSchema = z.object({
  confirm: z
    .string()
    .regex(/^PURGE-[a-z0-9-]+$/, "Formato confirm inválido. Usa 'PURGE-<slug>'"),
  reason: z.string().min(10).max(500),
});

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
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-tenants-X-purge"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  // F1: Double-step confirmation — evita borrado accidental de tienda
  const body = await req.json().catch((err) => { logger.warn("[purge] op failed", { err: String(err) }); return null; });
  const parsed = PurgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Confirmacion requerida",
        details: parsed.error.flatten(),
        hint: `Envia { confirm: 'PURGE-${slug}', reason: '<motivo minimo 10 chars>' }`,
      },
      { status: 400 },
    );
  }
  if (parsed.data.confirm !== `PURGE-${slug}`) {
    return NextResponse.json(
      {
        error: `Para confirmar, envia 'PURGE-${slug}' como \`confirm\``,
      },
      { status: 400 },
    );
  }
  const purgeReason = parsed.data.reason;

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
      reason: purgeReason,
    });

    // Audit Ley 29733 — loguear reason en audit trail
    try {
      const { logSuperadminAction } = await import("@/lib/audit/superadmin-audit");
      logSuperadminAction(
        "tenant_purge",
        `Purga de tienda '${slug}' por ${session.username} — ${deletedCount} registros borrados. Razon: ${purgeReason}`,
        {
          tenant: slug,
          deletedRows: deletedCount,
          reason: purgeReason,
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
          timestamp: new Date().toISOString(),
        },
        session.username,
      ).catch((err) => logger.warn("[superadmin] tenant purge audit failed", { err: String(err) }));
    } catch { /* audit logger no disponible */ }

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
      },
      { status: 500 },
    );
  }
}
