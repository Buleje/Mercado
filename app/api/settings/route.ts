export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { SettingsDB, type DbSettings } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { hash } from "bcryptjs";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const settings = await SettingsDB.get(tenantId);
    // Never expose credentials or security toggles to public callers
     
    const { adminPassword: _pw, adminBypassLogin: _bypass, ...publicSettings } = settings as DbSettings & { adminPassword?: string; adminBypassLogin?: boolean };
    return NextResponse.json(publicSettings, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
    const body = await req.json() as Partial<DbSettings>;
    if (body.mode && body.mode !== "whatsapp" && body.mode !== "checkout") {
      return NextResponse.json({ error: "mode must be 'whatsapp' or 'checkout'" }, { status: 400 });
    }
    const current = await SettingsDB.get();
    const updated: DbSettings = {
      ...current,
      ...(body.mode !== undefined && { mode: body.mode }),
      ...(body.businessName !== undefined && { businessName: body.businessName }),
      ...(body.businessPhone !== undefined && { businessPhone: body.businessPhone }),
      ...(body.businessAddress !== undefined && { businessAddress: body.businessAddress }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
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
    };
    const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Editar", "configuracion", `Configuración actualizada: ${changed || "general"}`, undefined, "admin", requestId).catch(() => {});
    return NextResponse.json(await SettingsDB.set(updated));
  } catch (e) {
    logger.error("[settings] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
