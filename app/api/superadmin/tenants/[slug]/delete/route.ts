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

    const tid = slug;

    // Helper: intenta deleteMany, ignora si la tabla no tiene tenantId o relación
    const safeDelete = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (e) {
        logger.warn(`[delete-tenant] skip ${label}`, { err: (e as Error).message?.slice(0, 80) });
      }
    };

    // Borrado en cascada — cada operación es tolerante a fallos
    // Las tablas que no aplican (sin tenantId, sin datos) se ignoran

    // Nivel 1: tablas hijas
    await safeDelete("orderItem", () => prisma.orderItem.deleteMany({ where: { order: { tenantId: tid } } }));
    await safeDelete("saleItem", () => prisma.saleItem.deleteMany({ where: { sale: { tenantId: tid } } }));
    await safeDelete("returnItem", () => prisma.returnItem.deleteMany({ where: { return: { tenantId: tid } } }));
    await safeDelete("fiadoCuota", () => prisma.fiadoCuota.deleteMany({ where: { fiado: { tenantId: tid } } }));
    await safeDelete("prestamoCuota", () => prisma.prestamoCuota.deleteMany({ where: { prestamo: { tenantId: tid } } }));
    await safeDelete("prestamoDoc", () => prisma.prestamoDocumento.deleteMany({ where: { prestamo: { tenantId: tid } } }));
    await safeDelete("purchaseItem", () => prisma.purchaseItem.deleteMany({ where: { order: { tenantId: tid } } }));
    await safeDelete("bundleItem", () => prisma.bundleItem.deleteMany({ where: { bundle: { tenantId: tid } } }));
    await safeDelete("shoppingListItem", () => prisma.shoppingListItem.deleteMany({ where: { list: { tenantId: tid } } }));
    await safeDelete("orderStatusHistory", () => prisma.orderStatusHistory.deleteMany({ where: { order: { tenantId: tid } } }));
    await safeDelete("recetaIngrediente", () => prisma.recetaIngrediente.deleteMany({ where: { receta: { tenantId: tid } } }));
    await safeDelete("cotizacionItem", () => prisma.cotizacionItem.deleteMany({ where: { cotizacion: { tenantId: tid } } }));
    await safeDelete("pageBlock", () => prisma.pageBlock.deleteMany({ where: { page: { tenantId: tid } } }));
    await safeDelete("pageVersion", () => prisma.pageVersion.deleteMany({ where: { page: { tenantId: tid } } }));
    await safeDelete("aBTestEvent", () => prisma.aBTestEvent.deleteMany({ where: { test: { tenantId: tid } } }));

    // Nivel 2: tablas con tenantId directo — batch delete
    const tenantTables = [
      "payment", "cashMovement", "inventoryMovement", "produccionLote",
      "treasuryTransferencia", "treasuryMovimiento",
      "return", "order", "sale", "cashRegister", "fiado", "prestamo",
      "purchaseOrder", "payable", "shoppingList", "bundle", "receta",
      "cotizacion", "page", "aBTest", "turno", "treasuryCuenta",
      "product", "customer", "supplier", "promotion", "coupon", "review",
      "expense", "deliverySlot", "priceHistory", "note", "media", "reminder",
      "messageTemplate", "chatMessage", "savedFilter", "surveyResponse",
      "newsletterSubscriber", "campaign", "dailySummary", "warehouse",
      "apiKey", "visitorWelcome", "savedCart", "savedLocation",
      "supplierEvaluation", "batch", "notification", "customerNotification",
      "guiaRemision", "guiaRemisionItem", "notaCredito",
      "transfer", "conteoFisico", "conteoFisicoItem", "merma",
      "discountRule", "commissionRule",
      "adminUser", "settings", "notificationLog", "pushSubscription",
      "activityLog", "adminMessage", "themeSettings", "navigation",
      "tenantInvitation", "cronDeadLetter",
      "store", "storeProduct", "storePermission", "supplierPortal",
      "deliveryPartner", "deliveryAssignment", "wholesaleOrder",
      "wholesaleOrderItem", "commissionLedger", "supportTicket",
    ] as const;

    for (const table of tenantTables) {
      await safeDelete(table, () => (prisma as Record<string, any>)[table]?.deleteMany?.({ where: { tenantId: tid } }));
    }

    // Nivel final: el tenant
    await prisma.tenant.delete({ where: { slug } });

    logger.info("[SuperAdmin] Tenant deleted", {
      username: session.username,
      slug,
      tenantName: tenant.name,
    });

    return NextResponse.json({
      deleted: slug,
      tenantName: tenant.name,
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
