import { NextRequest, NextResponse } from "next/server";
import { SettingsDB, type DbSettings } from "@/lib/jsondb";
import { enqueueActivityLog } from "@/lib/queue";
import { requireAdmin } from "@/lib/require-admin";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { hash } from "bcryptjs";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // [SEGURIDAD MULTI-TENANT] JWT > header (ver lib/resolve-tenant.ts).
    // Sin esto, el branding/businessName del tenant impersonado se mezcla
    // con el de "main" si el header está stale.
    const tenantId = await resolveTenantIdForRoute(req);
    const settings = await withDbRetry(() => SettingsDB.get(tenantId));
    // Never expose credentials or security toggles to public callers
     
    const { adminPassword: _pw, adminBypassLogin: _bypass, ...publicSettings } = settings as DbSettings & { adminPassword?: string; adminBypassLogin?: boolean };
    return NextResponse.json(publicSettings, {
      headers: {
        "Cache-Control": "private, no-cache, max-age=0",
      },
    });
  } catch (e) {
    logger.error("[settings] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Si el SuperAdmin impersona una tienda, el header x-tenant-id puede diferir
    // del tenantId del token. Damos prioridad al header explícito.
    const headerTenantId = req.headers.get("x-tenant-id");
    const effectiveTenantId = (headerTenantId && headerTenantId !== "main")
      ? headerTenantId
      : auth.tenantId;
    const tenantId = effectiveTenantId;
    const body = await req.json() as Partial<DbSettings>;
    if (body.mode && body.mode !== "whatsapp" && body.mode !== "checkout") {
      return NextResponse.json({ error: "mode must be 'whatsapp' or 'checkout'" }, { status: 400 });
    }
    const current = await SettingsDB.get(tenantId);

    // Si SOLO viene storeTheme, guardar solo eso (no todo el objeto settings)
    if (body.storeTheme && Object.keys(body).length === 1) {
      try {
        await prisma.settings.upsert({
          where: { tenantId },
          create: { tenantId, storeThemeJson: JSON.stringify(body.storeTheme) },
          update: { storeThemeJson: JSON.stringify(body.storeTheme) },
        });
        return NextResponse.json({ ok: true });
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        logger.error("[settings] storeTheme save error", { err: msg, tenantId });
        return NextResponse.json({ error: "Error guardando tema", detail: msg }, { status: 500 });
      }
    }

    const updated: DbSettings = {
      ...current,
      ...(body.mode !== undefined && { mode: body.mode }),
      ...(body.businessName !== undefined && { businessName: body.businessName }),
      ...(body.businessPhone !== undefined && { businessPhone: body.businessPhone }),
      ...(body.businessAddress !== undefined && { businessAddress: body.businessAddress }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      ...(body.coverUrl !== undefined && { coverUrl: body.coverUrl }),
      ...(body.bannerUrl !== undefined && { bannerUrl: body.bannerUrl }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.hours !== undefined && { hours: body.hours }),
      ...(body.deliveryZone !== undefined && { deliveryZone: body.deliveryZone }),
      ...(body.businessLat !== undefined && { businessLat: body.businessLat }),
      ...(body.businessLon !== undefined && { businessLon: body.businessLon }),
      ...(body.yapeEnabled !== undefined && { yapeEnabled: body.yapeEnabled }),
      ...(body.yapeImage !== undefined && { yapeImage: body.yapeImage }),
      ...(body.yapeName !== undefined && { yapeName: body.yapeName }),
      ...(body.yapePhone !== undefined && { yapePhone: body.yapePhone }),
      ...(body.cashEnabled !== undefined && { cashEnabled: body.cashEnabled }),
      ...(body.navLinks !== undefined && { navLinks: body.navLinks }),
      // Hash the admin password with bcrypt before persisting (never store plaintext)
      ...(body.adminPassword !== undefined && body.adminPassword !== "" && {
        adminPassword: await hash(body.adminPassword, 12),
      }),
      ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
      ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      // adminBypassLogin is permanently disabled — this toggle must never be re-enabled via API
      ...(body.homepageContent !== undefined && { homepageContent: body.homepageContent }),
      ...(body.comboTemplates !== undefined && { comboTemplates: body.comboTemplates }),

      // ── New settings fields ──
      ...(body.razonSocial !== undefined && { razonSocial: body.razonSocial }),
      ...(body.ruc !== undefined && { ruc: body.ruc }),
      ...(body.businessEmail !== undefined && { businessEmail: body.businessEmail }),
      ...(body.currency !== undefined && { currency: body.currency }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
      ...(body.businessType !== undefined && { businessType: body.businessType }),
      ...(body.socialLinks !== undefined && { socialLinks: body.socialLinks }),
      ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
      ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
      ...(body.slogan !== undefined && { slogan: body.slogan }),
      ...(body.dateFormat !== undefined && { dateFormat: body.dateFormat }),
      ...(body.timeFormat !== undefined && { timeFormat: body.timeFormat }),
      ...(body.decimals !== undefined && { decimals: body.decimals }),
      ...(body.taxRate !== undefined && { taxRate: body.taxRate }),
      ...(body.fiscalYearStart !== undefined && { fiscalYearStart: body.fiscalYearStart }),
      ...(body.invoiceSeries !== undefined && { invoiceSeries: body.invoiceSeries }),
      ...(body.invoiceStart !== undefined && { invoiceStart: body.invoiceStart }),
      ...(body.enabledDocTypes !== undefined && { enabledDocTypes: body.enabledDocTypes }),
      ...(body.roundingMode !== undefined && { roundingMode: body.roundingMode }),
      ...(body.maxDiscountPercent !== undefined && { maxDiscountPercent: body.maxDiscountPercent }),
      ...(body.discountRequiresAuth !== undefined && { discountRequiresAuth: body.discountRequiresAuth }),
      ...(body.invoiceFooterText !== undefined && { invoiceFooterText: body.invoiceFooterText }),
      ...(body.sunatRuc !== undefined && { sunatRuc: body.sunatRuc }),
      ...(body.sunatDenominacion !== undefined && { sunatDenominacion: body.sunatDenominacion }),
      ...(body.sunatDireccion !== undefined && { sunatDireccion: body.sunatDireccion }),
      ...(body.defaultUnit !== undefined && { defaultUnit: body.defaultUnit }),
      ...(body.globalMinStock !== undefined && { globalMinStock: body.globalMinStock }),
      ...(body.stockAlertChannels !== undefined && { stockAlertChannels: body.stockAlertChannels }),
      ...(body.adjustReasons !== undefined && { adjustReasons: body.adjustReasons }),
      ...(body.fefoEnabled !== undefined && { fefoEnabled: body.fefoEnabled }),
      ...(body.fefoAlertDays !== undefined && { fefoAlertDays: body.fefoAlertDays }),
      ...(body.inventoryCountFreq !== undefined && { inventoryCountFreq: body.inventoryCountFreq }),
      ...(body.cashOpeningAmount !== undefined && { cashOpeningAmount: body.cashOpeningAmount }),
      ...(body.cashAlertMax !== undefined && { cashAlertMax: body.cashAlertMax }),
      ...(body.returnPolicyDays !== undefined && { returnPolicyDays: body.returnPolicyDays }),
      ...(body.returnMaxNoAuth !== undefined && { returnMaxNoAuth: body.returnMaxNoAuth }),
      ...(body.autoCloseTime !== undefined && { autoCloseTime: body.autoCloseTime }),
      ...(body.deliveryZones !== undefined && { deliveryZones: body.deliveryZones }),
      ...(body.freeDeliveryMin !== undefined && { freeDeliveryMin: body.freeDeliveryMin }),
      ...(body.deliveryMaxRadius !== undefined && { deliveryMaxRadius: body.deliveryMaxRadius }),
      ...(body.deliveryHours !== undefined && { deliveryHours: body.deliveryHours }),
      ...(body.riders !== undefined && { riders: body.riders }),
      ...(body.smtpHost !== undefined && { smtpHost: body.smtpHost }),
      ...(body.smtpPort !== undefined && { smtpPort: body.smtpPort }),
      ...(body.smtpUser !== undefined && { smtpUser: body.smtpUser }),
      ...(body.smtpPass !== undefined && { smtpPass: body.smtpPass }),
      ...(body.smtpFrom !== undefined && { smtpFrom: body.smtpFrom }),
      ...(body.whatsappApiToken !== undefined && { whatsappApiToken: body.whatsappApiToken }),
      ...(body.whatsappBusinessNum !== undefined && { whatsappBusinessNum: body.whatsappBusinessNum }),
      ...(body.whatsappWebhookUrl !== undefined && { whatsappWebhookUrl: body.whatsappWebhookUrl }),
      ...(body.notifChannels !== undefined && { notifChannels: body.notifChannels }),
      ...(body.reorderReminderDays !== undefined && { reorderReminderDays: body.reorderReminderDays }),
      ...(body.plinEnabled !== undefined && { plinEnabled: body.plinEnabled }),
      ...(body.plinImage !== undefined && { plinImage: body.plinImage }),
      ...(body.plinName !== undefined && { plinName: body.plinName }),
      ...(body.plinPhone !== undefined && { plinPhone: body.plinPhone }),
      ...(body.sunatProvider !== undefined && { sunatProvider: body.sunatProvider }),
      ...(body.sunatApiKey !== undefined && { sunatApiKey: body.sunatApiKey }),
      ...(body.googleAnalyticsId !== undefined && { googleAnalyticsId: body.googleAnalyticsId }),
      ...(body.googleTagManagerId !== undefined && { googleTagManagerId: body.googleTagManagerId }),
      ...(body.logRetentionDays !== undefined && { logRetentionDays: body.logRetentionDays }),
      ...(body.logActions !== undefined && { logActions: body.logActions }),
      ...(body.backupSchedule !== undefined && { backupSchedule: body.backupSchedule }),
      ...(body.lastBackupAt !== undefined && { lastBackupAt: body.lastBackupAt }),
      ...(body.planName !== undefined && { planName: body.planName }),
      ...(body.planExpiresAt !== undefined && { planExpiresAt: body.planExpiresAt }),
      ...(body.maxProducts !== undefined && { maxProducts: body.maxProducts }),
      ...(body.maxUsers !== undefined && { maxUsers: body.maxUsers }),
      ...(body.maxBranches !== undefined && { maxBranches: body.maxBranches }),
      ...(body.enabledModules !== undefined && { enabledModules: body.enabledModules }),
      ...(body.transferEnabled !== undefined && { transferEnabled: body.transferEnabled }),
      ...(body.transferBankName !== undefined && { transferBankName: body.transferBankName }),
      ...(body.transferAccountNum !== undefined && { transferAccountNum: body.transferAccountNum }),
      ...(body.transferAccountHolder !== undefined && { transferAccountHolder: body.transferAccountHolder }),

      // ── StoreCustomizer ──
      ...(body.storeTheme !== undefined && { storeTheme: body.storeTheme }),
    };
    const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
    // eslint-disable-next-line no-restricted-syntax -- activity log fire-and-forget; no debe bloquear la respuesta de Settings
    enqueueActivityLog({ action: "Editar", resource: "configuracion", userId: "admin", tenantId: effectiveTenantId, details: { description: `Configuración actualizada: ${changed || "general"}` }, timestamp: new Date().toISOString() }).catch(() => {});
    const saved = await SettingsDB.set(updated, tenantId);

    // ── Sync de branding cross-modelo ─────────────────────────────────────────
    // El logo/banner/businessName/colors viven en 3 lugares por razones
    // históricas: Settings (panel admin), Tenant (header/branding global) y
    // Store (marketplace card). Para que el cambio se vea EN TODOS LADOS
    // sin que el dueño se entere de la duplicación, propagamos en background.
    if (
      body.logoUrl !== undefined ||
      body.businessName !== undefined ||
      body.primaryColor !== undefined ||
      body.secondaryColor !== undefined
    ) {
      prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl || null }),
          ...(body.businessName !== undefined && body.businessName && { name: body.businessName }),
          ...(body.primaryColor !== undefined && body.primaryColor && { primaryColor: body.primaryColor }),
          ...(body.secondaryColor !== undefined && body.secondaryColor && { secondaryColor: body.secondaryColor }),
        },
      }).catch((err: unknown) => logger.warn("[settings] tenant sync skipped", { error: String(err) }));
    }

    if (
      body.logoUrl !== undefined ||
      body.coverUrl !== undefined ||
      body.bannerUrl !== undefined ||
      body.description !== undefined ||
      body.businessName !== undefined
    ) {
      // Update Store row (si existe) — el marketplace lee de aquí.
      prisma.store.updateMany({
        where: { tenantId },
        data: {
          ...(body.logoUrl !== undefined && { logo: body.logoUrl || null }),
          ...(body.bannerUrl !== undefined && { banner: body.bannerUrl || null }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.businessName !== undefined && body.businessName && { name: body.businessName }),
        },
      }).catch((err: unknown) => logger.warn("[settings] store sync skipped", { error: String(err) }));

      // Store.cover via raw SQL — el campo existe en DB (ALTER TABLE) pero el
      // schema.prisma no se regenera (zona peligrosa). Patrón expand seguro:
      // columnas nullable nuevas no rompen clientes viejos.
      if (body.coverUrl !== undefined) {
        prisma.$executeRaw`UPDATE "Store" SET "cover" = ${body.coverUrl || null} WHERE "tenantId" = ${tenantId}`
          .catch((err: unknown) => logger.warn("[settings] store cover sync skipped", { error: String(err) }));
      }
    }

    return NextResponse.json(saved);
  } catch (e) {
    logger.error("[settings] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
