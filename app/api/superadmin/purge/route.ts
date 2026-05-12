import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateAll } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { verifyTotpCode } from "@/lib/auth/totp";
import { z } from "zod";

// SECURITY 2026-05-12 (audit pentest N4): purga total requiere TOTP obligatorio.
// Antes bastaba password (cookie de sesión) + confirm string trivialmente
// automatizable. TOTP forzado eleva la barrera a posesión de un dispositivo
// físico (TOTP app) — necesario para una operación que borra 104 tablas.
const PurgeSchema = z.object({
  confirm: z
    .string()
    .regex(/^PURGE-PLATFORM$/, "Para confirmar, envía 'PURGE-PLATFORM' como `confirm`"),
  reason: z.string().min(10).max(500),
  totpCode: z
    .string()
    .regex(/^\d{6}$/, "totpCode debe ser 6 dígitos de tu app TOTP"),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/superadmin/purge
// "Factory reset" — borra TODOS los datos de TODAS las tiendas.
// El sistema queda como recién instalado (solo quedan Tenant, AdminUser,
// Settings, Store, ThemeSettings, Navigation, BlockTemplate, ApiKey,
// PushSubscription, TenantInvitation, StorePermission).
// ═══════════════════════════════════════════════════════════════════════

// Todas las tablas de DATOS (104 tablas) — se truncan con CASCADE.
// CASCADE hace que PostgreSQL resuelva TODAS las FK automáticamente,
// sin importar el orden. Es atómico y mucho más rápido que DELETE.
const DATA_TABLES = [
  "Product", "Customer", "SavedCart", "SavedLocation",
  "Order", "OrderItem", "Review", "Supplier",
  "PurchaseOrder", "PurchaseItem", "Sale", "SaleItem",
  "Promotion", "Payable", "Payment", "CashRegister",
  "CashMovement", "InventoryMovement", "Coupon", "Return",
  "ReturnItem", "ShoppingList", "ShoppingListItem", "PriceHistory",
  "DeliverySlot", "AdminMessage", "SupplierEvaluation", "Expense",
  // ActivityLog y _prisma_migrations NUNCA se purgan — cumplimiento Ley 29733 Art. 16 + integridad migrations
  "Bundle", "BundleItem", "NotificationLog",
  "CustomerNotification", "Page", "PageBlock", "Media",
  "PageVersion", "StripeWebhookQueue", "Note", "MessageTemplate",
  "Reminder", "Batch", "SavedFilter", "ChatMessage",
  "ABTest", "ABTestEvent", "SurveyResponse", "OrderStatusHistory",
  "NewsletterSubscriber", "CronDeadLetter", "Warehouse", "Transfer",
  "Location", "VisitorWelcome", "Campaign", "CommissionRule",
  "DailySummary", "Fiado", "FiadoCuota", "Turno",
  "Receta", "RecetaIngrediente", "ProduccionLote", "Prestamo",
  "PrestamoCuota", "PrestamoDocumento", "TreasuryCuenta", "TreasuryMovimiento",
  "TreasuryTransferencia", "Cotizacion", "CotizacionItem", "GuiaRemision",
  "GuiaRemisionItem", "NotaCredito", "Notification", "ConteoFisico",
  "ConteoFisicoItem", "DiscountRule", "SupplierReturn", "SupplierReturnItem",
  "ComplianceItem", "CustomKpi", "StoreProduct", "DeliveryPartner",
  "DeliveryAssignment", "WholesaleOrder", "WholesaleOrderItem", "CommissionLedger",
  "SupplierPortal", "SupportTicket",
  // ── Tablas que faltaban (14) — sin esto quedaban datos huérfanos ────
  "ForecastLog", "ChurnPlaybook", "ChurnSignal",
  "CreditInstallment", "CreditProfile",
  "SunatInvoice", "SupplierOffer", "SupplierPriceVersion", "SupplierRating",
  "TenantHealthScore", "TenantSunatConfig", "TenantWhatsAppConfig",
  "WhatsAppConversation", "MpPendingPlan",
] as const;

// Tablas que NO se tocan (sistema — sin esto no se puede hacer login):
// Tenant, AdminUser, Settings, Store, ThemeSettings, Navigation,
// BlockTemplate, ApiKey, PushSubscription, TenantInvitation, StorePermission

export async function DELETE(req: NextRequest) {
  // STRICT rate-limit — un superadmin comprometido no debería poder ejecutar
  // purga en ráfaga aunque tenga credenciales + TOTP.
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-purge"); if (_rl) return _rl;
  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // F1: Double-step confirmation — operacion nuclear requiere confirmacion explicita
  const body = await req.json().catch((err) => { logger.warn("[purge] op failed", { err: String(err) }); return null; });
  const parsed = PurgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Confirmacion requerida",
        details: parsed.error.flatten(),
        hint: "Envia { confirm: 'PURGE-PLATFORM', reason: '<motivo minimo 10 chars>', totpCode: '<6 digitos>' }",
      },
      { status: 400 },
    );
  }
  if (parsed.data.confirm !== "PURGE-PLATFORM") {
    return NextResponse.json(
      { error: "Para confirmar, envia 'PURGE-PLATFORM' como `confirm`" },
      { status: 400 },
    );
  }

  // SECURITY 2026-05-12: TOTP obligatorio. Si el superadmin aun no enrolo
  // 2FA, lo forzamos antes de permitir la operacion nuclear.
  const totpRow = await SuperadminTotpDB.getByUsername(session.username);
  if (!totpRow?.totpSecret || !totpRow.totpEnabledAt) {
    return NextResponse.json(
      {
        error: "totp_required",
        message:
          "Esta operacion requiere 2FA. Habilita TOTP en /superadmin/security antes de purgar.",
      },
      { status: 412 },
    );
  }
  const totpValid = verifyTotpCode(totpRow.totpSecret, parsed.data.totpCode);
  if (!totpValid) {
    logger.warn("[SuperAdmin] purge TOTP invalido", {
      username: session.username,
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return NextResponse.json(
      { error: "totp_invalid", message: "Codigo TOTP invalido o expirado." },
      { status: 401 },
    );
  }

  const purgeReason = parsed.data.reason;

  try {
    // ── Contar registros ANTES del truncate para reportar ──────────────
    const beforeCounts: Record<string, number> = {};
    let totalBefore = 0;

    // Conteo paralelo en batches de 20 para no saturar la conexión
    const BATCH_SIZE = 20;
    for (let i = 0; i < DATA_TABLES.length; i += BATCH_SIZE) {
      const batch = DATA_TABLES.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (table) => {
          try {
            const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
              `SELECT COUNT(*) as count FROM "${table}"`
            );
            return { table, count: Number(result[0]?.count ?? 0) };
          } catch {
            return { table, count: 0 };
          }
        })
      );
      for (const { table, count } of results) {
        if (count > 0) {
          beforeCounts[table] = count;
          totalBefore += count;
        }
      }
    }

    if (totalBefore === 0) {
      return NextResponse.json({
        deletedRows: 0,
        details: {},
        message: "No había datos para eliminar — el sistema ya está limpio.",
      });
    }

    // ── TRUNCATE todas las tablas de datos en UN solo statement ────────
    // CASCADE resuelve TODAS las restricciones FK automáticamente.
    // Es atómico: o se borran todas o ninguna.
    const tableList = DATA_TABLES.map((t) => `"${t}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${tableList} CASCADE`);

    // ── Limpiar TODA la caché del servidor ─────────────────────────────
    invalidateAll();

    logger.info("[SuperAdmin] Nuclear reset — all data purged", {
      username: session.username,
      deletedRows: totalBefore,
      details: beforeCounts,
      reason: purgeReason,
    });

    // COMPLIANCE (Ley 29733 Art. 18 + 11): audit trail con reason obligatorio
    try {
      const { logSuperadminAction } = await import("@/lib/audit/superadmin-audit");
      logSuperadminAction(
        "nuclear_reset",
        `Purga total ejecutada por ${session.username} — ${totalBefore} registros borrados de ${Object.keys(beforeCounts).length} tablas. Razon: ${purgeReason}`,
        {
          deletedRows: totalBefore,
          tables: Object.keys(beforeCounts),
          reason: purgeReason,
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
          timestamp: new Date().toISOString(),
        },
        session.username,
      ).catch((err) => logger.warn("[superadmin] op failed", { err: String(err) }));
    } catch { /* audit logger no disponible */ }

    return NextResponse.json({
      deletedRows: totalBefore,
      details: beforeCounts,
      message: `Sistema limpiado — ${totalBefore} registros eliminados de ${Object.keys(beforeCounts).length} tablas.`,
    });
  } catch (e) {
    logger.error("[SuperAdmin] Error in nuclear reset", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al limpiar datos" },
      { status: 500 },
    );
  }
}
