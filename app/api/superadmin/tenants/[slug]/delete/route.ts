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

    // Borrado en cascada dentro de una transacción atómica.
    // Orden obligatorio: tablas hija primero, luego padre, luego entidades, luego config.
    await prisma.$transaction([
      // ── Nivel 1: tablas hijas (filas child) ──────────────────────────────
      prisma.orderItem.deleteMany({ where: { order: { tenantId: tid } } }),
      prisma.saleItem.deleteMany({ where: { sale: { tenantId: tid } } }),
      prisma.returnItem.deleteMany({ where: { return: { tenantId: tid } } }),
      prisma.fiadoCuota.deleteMany({ where: { fiado: { tenantId: tid } } }),
      prisma.prestamoCuota.deleteMany({ where: { prestamo: { tenantId: tid } } }),
      prisma.prestamoDocumento.deleteMany({ where: { prestamo: { tenantId: tid } } }),
      prisma.purchaseItem.deleteMany({ where: { order: { tenantId: tid } } }),
      prisma.bundleItem.deleteMany({ where: { bundle: { tenantId: tid } } }),
      prisma.shoppingListItem.deleteMany({ where: { list: { tenantId: tid } } }),
      prisma.payment.deleteMany({ where: { tenantId: tid } }),
      prisma.cashMovement.deleteMany({ where: { tenantId: tid } }),
      prisma.inventoryMovement.deleteMany({ where: { tenantId: tid } }),
      prisma.orderStatusHistory.deleteMany({ where: { order: { tenantId: tid } } }),
      prisma.recetaIngrediente.deleteMany({ where: { receta: { tenantId: tid } } }),
      prisma.produccionLote.deleteMany({ where: { tenantId: tid } }),
      prisma.cotizacionItem.deleteMany({ where: { cotizacion: { tenantId: tid } } }),
      prisma.pageBlock.deleteMany({ where: { page: { tenantId: tid } } }),
      prisma.pageVersion.deleteMany({ where: { page: { tenantId: tid } } }),
      prisma.aBTestEvent.deleteMany({ where: { test: { tenantId: tid } } }),
      prisma.treasuryTransferencia.deleteMany({ where: { tenantId: tid } }),
      prisma.treasuryMovimiento.deleteMany({ where: { tenantId: tid } }),

      // ── Nivel 2: tablas padre ─────────────────────────────────────────────
      prisma.return.deleteMany({ where: { tenantId: tid } }),
      prisma.order.deleteMany({ where: { tenantId: tid } }),
      prisma.sale.deleteMany({ where: { tenantId: tid } }),
      prisma.cashRegister.deleteMany({ where: { tenantId: tid } }),
      prisma.fiado.deleteMany({ where: { tenantId: tid } }),
      prisma.prestamo.deleteMany({ where: { tenantId: tid } }),
      prisma.purchaseOrder.deleteMany({ where: { tenantId: tid } }),
      prisma.payable.deleteMany({ where: { tenantId: tid } }),
      prisma.shoppingList.deleteMany({ where: { tenantId: tid } }),
      prisma.bundle.deleteMany({ where: { tenantId: tid } }),
      prisma.receta.deleteMany({ where: { tenantId: tid } }),
      prisma.cotizacion.deleteMany({ where: { tenantId: tid } }),
      prisma.page.deleteMany({ where: { tenantId: tid } }),
      prisma.aBTest.deleteMany({ where: { tenantId: tid } }),
      prisma.turno.deleteMany({ where: { tenantId: tid } }),
      prisma.treasuryCuenta.deleteMany({ where: { tenantId: tid } }),

      // ── Nivel 3: entidades principales ───────────────────────────────────
      prisma.product.deleteMany({ where: { tenantId: tid } }),
      prisma.customer.deleteMany({ where: { tenantId: tid } }),
      prisma.supplier.deleteMany({ where: { tenantId: tid } }),
      prisma.promotion.deleteMany({ where: { tenantId: tid } }),
      prisma.coupon.deleteMany({ where: { tenantId: tid } }),
      prisma.review.deleteMany({ where: { tenantId: tid } }),
      prisma.expense.deleteMany({ where: { tenantId: tid } }),
      prisma.deliverySlot.deleteMany({ where: { tenantId: tid } }),
      prisma.priceHistory.deleteMany({ where: { tenantId: tid } }),
      prisma.note.deleteMany({ where: { tenantId: tid } }),
      prisma.media.deleteMany({ where: { tenantId: tid } }),
      prisma.reminder.deleteMany({ where: { tenantId: tid } }),
      prisma.messageTemplate.deleteMany({ where: { tenantId: tid } }),
      prisma.chatMessage.deleteMany({ where: { tenantId: tid } }),
      prisma.savedFilter.deleteMany({ where: { tenantId: tid } }),
      prisma.surveyResponse.deleteMany({ where: { tenantId: tid } }),
      prisma.newsletterSubscriber.deleteMany({ where: { tenantId: tid } }),
      prisma.campaign.deleteMany({ where: { tenantId: tid } }),
      prisma.dailySummary.deleteMany({ where: { tenantId: tid } }),
      prisma.warehouse.deleteMany({ where: { tenantId: tid } }),
      prisma.apiKey.deleteMany({ where: { tenantId: tid } }),
      prisma.visitorWelcome.deleteMany({ where: { tenantId: tid } }),
      prisma.savedCart.deleteMany({ where: { tenantId: tid } }),
      prisma.savedLocation.deleteMany({ where: { tenantId: tid } }),
      prisma.supplierEvaluation.deleteMany({ where: { tenantId: tid } }),
      prisma.batch.deleteMany({ where: { tenantId: tid } }),

      // ── Nivel 4: config y usuarios ────────────────────────────────────────
      prisma.adminUser.deleteMany({ where: { tenantId: tid } }),
      prisma.settings.deleteMany({ where: { tenantId: tid } }),
      prisma.notificationLog.deleteMany({ where: { tenantId: tid } }),
      prisma.pushSubscription.deleteMany({ where: { tenantId: tid } }),
      prisma.activityLog.deleteMany({ where: { tenantId: tid } }),
      prisma.adminMessage.deleteMany({ where: { tenantId: tid } }),
      prisma.themeSettings.deleteMany({ where: { tenantId: tid } }),
      prisma.navigation.deleteMany({ where: { tenantId: tid } }),
      prisma.commissionRule.deleteMany({ where: { tenantId: tid } }),
      prisma.tenantInvitation.deleteMany({ where: { tenantId: tid } }),
      prisma.cronDeadLetter.deleteMany({ where: { tenantId: tid } }),

      // ── Nivel 5: el tenant mismo (último) ────────────────────────────────
      prisma.tenant.delete({ where: { slug } }),
    ]);

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
