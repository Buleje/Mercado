import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import type {
  Settings as PSettings,
} from "@/lib/generated/prisma/client";
import {
  type DbSettings,
  type StoreMode,
  type NavLinkItem,
} from "./misc.db";

// ── JSON parse helper ─────────────────────────────────────────────────────────
function safeJson<T>(raw: string | null | undefined, fallback?: T): T | undefined {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function spreadJson<T>(raw: string | null | undefined, key: string, fallback?: T): Record<string, T> {
  const val = safeJson<T>(raw, fallback);
  return val !== undefined ? { [key]: val } : {};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapSettings(s: PSettings): DbSettings {
  const r = s as Record<string, unknown>;
  return {
    mode: s.mode as StoreMode,
    ...(s.businessName != null && { businessName: s.businessName }),
    ...(s.businessPhone != null && { businessPhone: s.businessPhone }),
    ...(s.businessAddress != null && { businessAddress: s.businessAddress }),
    ...(s.businessLat != null && { businessLat: s.businessLat }),
    ...(s.businessLon != null && { businessLon: s.businessLon }),
    ...(s.logoUrl != null && { logoUrl: s.logoUrl }),
    // coverUrl + bannerUrl viven en columnas TEXT agregadas via ALTER TABLE
    // (no están en schema.prisma — ver patrón expand seguro). Se leen via
    // raw access al record para evitar mismatch del Prisma Client.
    ...(r.coverUrl != null && { coverUrl: r.coverUrl as string }),
    ...(r.bannerUrl != null && { bannerUrl: r.bannerUrl as string }),
    ...(s.description != null && { description: s.description }),
    ...(s.hours != null && { hours: s.hours }),
    ...(s.deliveryZone != null && { deliveryZone: s.deliveryZone }),
    yapeEnabled: s.yapeEnabled,
    ...(s.yapeImage != null && { yapeImage: s.yapeImage }),
    ...(s.yapeName != null && { yapeName: s.yapeName }),
    ...(s.yapePhone != null && { yapePhone: s.yapePhone }),
    cashEnabled: s.cashEnabled,
    ...spreadJson<NavLinkItem[]>(s.navLinksJson, 'navLinks'),
    ...(s.adminPassword != null && { adminPassword: s.adminPassword }),
    maintenanceMode: s.maintenanceMode,
    ...(s.maintenanceMessage != null && { maintenanceMessage: s.maintenanceMessage }),
    adminBypassLogin: s.adminBypassLogin,
    ...spreadJson(r.comboTemplatesJson as string, 'comboTemplates'),

    // ── Datos del negocio ──
    ...(r.razonSocial != null && { razonSocial: r.razonSocial as string }),
    ...(r.ruc != null && { ruc: r.ruc as string }),
    ...(r.businessEmail != null && { businessEmail: r.businessEmail as string }),
    ...(r.currency != null && { currency: r.currency as string }),
    ...(r.timezone != null && { timezone: r.timezone as string }),
    ...(r.businessType != null && { businessType: r.businessType as string }),
    ...spreadJson(r.socialLinksJson as string, 'socialLinks'),

    // ── Apariencia ──
    ...(r.primaryColor != null && { primaryColor: r.primaryColor as string }),
    ...(r.secondaryColor != null && { secondaryColor: r.secondaryColor as string }),
    ...(r.slogan != null && { slogan: r.slogan as string }),

    // ── Sistema ──
    ...(r.dateFormat != null && { dateFormat: r.dateFormat as string }),
    ...(r.timeFormat != null && { timeFormat: r.timeFormat as string }),
    ...(r.decimals != null && { decimals: r.decimals as number }),
    ...(r.taxRate != null && { taxRate: r.taxRate as number }),
    ...(r.fiscalYearStart != null && { fiscalYearStart: r.fiscalYearStart as number }),

    // ── Ventas y comprobantes ──
    ...spreadJson(r.invoiceSeriesJson as string, 'invoiceSeries'),
    ...spreadJson(r.invoiceStartJson as string, 'invoiceStart'),
    ...(r.enabledDocTypes != null && { enabledDocTypes: r.enabledDocTypes as string }),
    ...(r.roundingMode != null && { roundingMode: r.roundingMode as string }),
    ...(r.maxDiscountPercent != null && { maxDiscountPercent: r.maxDiscountPercent as number }),
    ...(r.discountRequiresAuth != null && { discountRequiresAuth: r.discountRequiresAuth as boolean }),
    ...(r.invoiceFooterText != null && { invoiceFooterText: r.invoiceFooterText as string }),
    ...(r.sunatRuc != null && { sunatRuc: r.sunatRuc as string }),
    ...(r.sunatDenominacion != null && { sunatDenominacion: r.sunatDenominacion as string }),
    ...(r.sunatDireccion != null && { sunatDireccion: r.sunatDireccion as string }),

    // ── Inventario ──
    ...(r.defaultUnit != null && { defaultUnit: r.defaultUnit as string }),
    ...(r.globalMinStock != null && { globalMinStock: r.globalMinStock as number }),
    ...(r.stockAlertChannels != null && { stockAlertChannels: r.stockAlertChannels as string }),
    ...spreadJson<string[]>(r.adjustReasonsJson as string, 'adjustReasons'),
    ...(r.fefoEnabled != null && { fefoEnabled: r.fefoEnabled as boolean }),
    ...(r.fefoAlertDays != null && { fefoAlertDays: r.fefoAlertDays as number }),
    ...(r.inventoryCountFreq != null && { inventoryCountFreq: r.inventoryCountFreq as string }),

    // ── Caja y pagos ──
    ...(r.cashOpeningAmount != null && { cashOpeningAmount: Number(r.cashOpeningAmount) }),
    ...(r.cashAlertMax != null && { cashAlertMax: Number(r.cashAlertMax) }),
    ...(r.returnPolicyDays != null && { returnPolicyDays: r.returnPolicyDays as number }),
    ...(r.returnMaxNoAuth != null && { returnMaxNoAuth: Number(r.returnMaxNoAuth) }),
    ...(r.autoCloseTime != null && { autoCloseTime: r.autoCloseTime as string }),

    // ── Delivery ──
    ...spreadJson(r.deliveryZonesJson as string, 'deliveryZones'),
    ...(r.freeDeliveryMin != null && { freeDeliveryMin: Number(r.freeDeliveryMin) }),
    ...(r.deliveryMaxRadius != null && { deliveryMaxRadius: r.deliveryMaxRadius as number }),
    ...spreadJson(r.deliveryHoursJson as string, 'deliveryHours'),
    ...spreadJson(r.ridersJson as string, 'riders'),

    // ── Notificaciones ──
    ...(r.smtpHost != null && { smtpHost: r.smtpHost as string }),
    ...(r.smtpPort != null && { smtpPort: r.smtpPort as number }),
    ...(r.smtpUser != null && { smtpUser: r.smtpUser as string }),
    ...(r.smtpPass != null && { smtpPass: r.smtpPass as string }),
    ...(r.smtpFrom != null && { smtpFrom: r.smtpFrom as string }),
    ...(r.whatsappApiToken != null && { whatsappApiToken: r.whatsappApiToken as string }),
    ...(r.whatsappBusinessNum != null && { whatsappBusinessNum: r.whatsappBusinessNum as string }),
    ...(r.whatsappWebhookUrl != null && { whatsappWebhookUrl: r.whatsappWebhookUrl as string }),
    ...spreadJson(r.notifChannelsJson as string, 'notifChannels'),
    ...(r.reorderReminderDays != null && { reorderReminderDays: r.reorderReminderDays as number }),

    // ── Integraciones ──
    ...(r.plinEnabled != null && { plinEnabled: r.plinEnabled as boolean }),
    ...(r.plinImage != null && { plinImage: r.plinImage as string }),
    ...(r.plinName != null && { plinName: r.plinName as string }),
    ...(r.plinPhone != null && { plinPhone: r.plinPhone as string }),
    ...(r.sunatProvider != null && { sunatProvider: r.sunatProvider as string }),
    ...(r.sunatApiKey != null && { sunatApiKey: r.sunatApiKey as string }),
    ...(r.googleAnalyticsId != null && { googleAnalyticsId: r.googleAnalyticsId as string }),
    ...(r.googleTagManagerId != null && { googleTagManagerId: r.googleTagManagerId as string }),

    // ── Auditoría ──
    ...(r.logRetentionDays != null && { logRetentionDays: r.logRetentionDays as number }),
    ...(r.logActions != null && { logActions: r.logActions as string }),

    // ── Respaldo ──
    ...(r.backupSchedule != null && { backupSchedule: r.backupSchedule as string }),
    ...(r.lastBackupAt != null && { lastBackupAt: (r.lastBackupAt as Date).toISOString() }),

    // ── Suscripción ──
    ...(r.planName != null && { planName: r.planName as string }),
    ...(r.planExpiresAt != null && { planExpiresAt: (r.planExpiresAt as Date).toISOString() }),
    ...(r.maxProducts != null && { maxProducts: r.maxProducts as number }),
    ...(r.maxUsers != null && { maxUsers: r.maxUsers as number }),
    ...(r.maxBranches != null && { maxBranches: r.maxBranches as number }),
    ...spreadJson<string[]>(r.enabledModulesJson as string, 'enabledModules'),

    // ── Métodos de pago adicionales ──
    ...(r.transferEnabled != null && { transferEnabled: r.transferEnabled as boolean }),
    ...(r.transferBankName != null && { transferBankName: r.transferBankName as string }),
    ...(r.transferAccountNum != null && { transferAccountNum: r.transferAccountNum as string }),
    ...(r.transferAccountHolder != null && { transferAccountHolder: r.transferAccountHolder as string }),

    // ── StoreCustomizer ──
    ...spreadJson(r.storeThemeJson as string, 'storeTheme'),
  };
}

// ── Settings DB ───────────────────────────────────────────────────────────────

export const SettingsDB = {
  async get(tenantId: string): Promise<DbSettings> {
    return getOrSet<DbSettings>(`settings:${tenantId}`, 60, async () => {
      try {
        const tid = tenantId;
        // Try by tenantId first (multi-tenant), fallback to id:1 (legacy)
        let row = await prisma.settings.findUnique({ where: { tenantId: tid } })
          ?? (tid === "main" ? await prisma.settings.findUnique({ where: { id: 1 } }) : null);
        // El middleware `slug-routes.ts` envía el SLUG en `x-tenant-id`
        // (no el cuid). Si no encontramos por id, resolvemos slug → cuid.
        if (!row) {
          // FIX 2026-05-07 (audit N+1): usar resolveTenantSlugToId con cache+dedupe.
          const resolvedId = await resolveTenantSlugToId(tid);
          if (resolvedId && resolvedId !== tid) {
            row = await prisma.settings.findUnique({ where: { tenantId: resolvedId } });
          }
        }
        if (!row) return { mode: "whatsapp", adminBypassLogin: false };

        // Prisma `findUnique` ignora columnas que no están en schema.prisma.
        // coverUrl + bannerUrl se agregaron via ALTER TABLE pero el schema no
        // se regeneró (zona peligrosa). Leemos esos 2 campos via raw query.
        try {
          const extras = await prisma.$queryRawUnsafe<Array<{ coverUrl: string | null; bannerUrl: string | null }>>(
            `SELECT "coverUrl", "bannerUrl" FROM "Settings" WHERE "tenantId" = $1 LIMIT 1`,
            (row as { tenantId?: string }).tenantId ?? tid,
          );
          const e = extras[0];
          if (e) {
            (row as Record<string, unknown>).coverUrl = e.coverUrl;
            (row as Record<string, unknown>).bannerUrl = e.bannerUrl;
          }
        } catch (err) {
          logger.warn("[settings.db] cover/banner raw read skipped", { error: String(err) });
        }

        return mapSettings(row);
      } catch (error) {
        logger.warn("[settings] falling back to defaults", { error: error instanceof Error ? error.message : String(error) });
        return { mode: "whatsapp", adminBypassLogin: false };
      }
    });
  },
  async set(s: DbSettings, tenantId: string): Promise<DbSettings> {
    const tid = tenantId;
    const d: Record<string, unknown> = {
      mode: s.mode, businessName: s.businessName, businessPhone: s.businessPhone,
      businessAddress: s.businessAddress, logoUrl: s.logoUrl, description: s.description,
      hours: s.hours, deliveryZone: s.deliveryZone, yapeEnabled: s.yapeEnabled ?? false,
      yapeImage: s.yapeImage, yapeName: s.yapeName, yapePhone: s.yapePhone,
      cashEnabled: s.cashEnabled ?? true,
      // coverUrl + bannerUrl: columnas TEXT agregadas via ALTER TABLE pero
      // NO en schema.prisma (zona peligrosa). Se persisten DESPUÉS del upsert
      // con $executeRawUnsafe — ver más abajo.
      ...(s.navLinks !== undefined && { navLinksJson: JSON.stringify(s.navLinks) }),
      ...(s.businessLat !== undefined && { businessLat: s.businessLat }),
      ...(s.businessLon !== undefined && { businessLon: s.businessLon }),
      ...(s.adminPassword !== undefined && { adminPassword: s.adminPassword }),
      ...(s.maintenanceMode !== undefined && { maintenanceMode: s.maintenanceMode }),
      ...(s.maintenanceMessage !== undefined && { maintenanceMessage: s.maintenanceMessage }),
      ...(s.adminBypassLogin !== undefined && { adminBypassLogin: s.adminBypassLogin }),
      ...(s.comboTemplates !== undefined && { comboTemplatesJson: JSON.stringify(s.comboTemplates) }),

      // ── Datos del negocio ──
      ...(s.razonSocial !== undefined && { razonSocial: s.razonSocial }),
      ...(s.ruc !== undefined && { ruc: s.ruc }),
      ...(s.businessEmail !== undefined && { businessEmail: s.businessEmail }),
      ...(s.currency !== undefined && { currency: s.currency }),
      ...(s.timezone !== undefined && { timezone: s.timezone }),
      ...(s.businessType !== undefined && { businessType: s.businessType }),
      ...(s.socialLinks !== undefined && { socialLinksJson: JSON.stringify(s.socialLinks) }),

      // ── Apariencia ──
      ...(s.primaryColor !== undefined && { primaryColor: s.primaryColor }),
      ...(s.secondaryColor !== undefined && { secondaryColor: s.secondaryColor }),
      ...(s.slogan !== undefined && { slogan: s.slogan }),

      // ── Sistema ──
      ...(s.dateFormat !== undefined && { dateFormat: s.dateFormat }),
      ...(s.timeFormat !== undefined && { timeFormat: s.timeFormat }),
      ...(s.decimals !== undefined && { decimals: s.decimals }),
      ...(s.taxRate !== undefined && { taxRate: s.taxRate }),
      ...(s.fiscalYearStart !== undefined && { fiscalYearStart: s.fiscalYearStart }),

      // ── Ventas y comprobantes ──
      ...(s.invoiceSeries !== undefined && { invoiceSeriesJson: JSON.stringify(s.invoiceSeries) }),
      ...(s.invoiceStart !== undefined && { invoiceStartJson: JSON.stringify(s.invoiceStart) }),
      ...(s.enabledDocTypes !== undefined && { enabledDocTypes: s.enabledDocTypes }),
      ...(s.roundingMode !== undefined && { roundingMode: s.roundingMode }),
      ...(s.maxDiscountPercent !== undefined && { maxDiscountPercent: s.maxDiscountPercent }),
      ...(s.discountRequiresAuth !== undefined && { discountRequiresAuth: s.discountRequiresAuth }),
      ...(s.invoiceFooterText !== undefined && { invoiceFooterText: s.invoiceFooterText }),
      ...(s.sunatRuc !== undefined && { sunatRuc: s.sunatRuc }),
      ...(s.sunatDenominacion !== undefined && { sunatDenominacion: s.sunatDenominacion }),
      ...(s.sunatDireccion !== undefined && { sunatDireccion: s.sunatDireccion }),

      // ── Inventario ──
      ...(s.defaultUnit !== undefined && { defaultUnit: s.defaultUnit }),
      ...(s.globalMinStock !== undefined && { globalMinStock: s.globalMinStock }),
      ...(s.stockAlertChannels !== undefined && { stockAlertChannels: s.stockAlertChannels }),
      ...(s.adjustReasons !== undefined && { adjustReasonsJson: JSON.stringify(s.adjustReasons) }),
      ...(s.fefoEnabled !== undefined && { fefoEnabled: s.fefoEnabled }),
      ...(s.fefoAlertDays !== undefined && { fefoAlertDays: s.fefoAlertDays }),
      ...(s.inventoryCountFreq !== undefined && { inventoryCountFreq: s.inventoryCountFreq }),

      // ── Caja y pagos ──
      ...(s.cashOpeningAmount !== undefined && { cashOpeningAmount: s.cashOpeningAmount }),
      ...(s.cashAlertMax !== undefined && { cashAlertMax: s.cashAlertMax }),
      ...(s.returnPolicyDays !== undefined && { returnPolicyDays: s.returnPolicyDays }),
      ...(s.returnMaxNoAuth !== undefined && { returnMaxNoAuth: s.returnMaxNoAuth }),
      ...(s.autoCloseTime !== undefined && { autoCloseTime: s.autoCloseTime }),

      // ── Delivery ──
      ...(s.deliveryZones !== undefined && { deliveryZonesJson: JSON.stringify(s.deliveryZones) }),
      ...(s.freeDeliveryMin !== undefined && { freeDeliveryMin: s.freeDeliveryMin }),
      ...(s.deliveryMaxRadius !== undefined && { deliveryMaxRadius: s.deliveryMaxRadius }),
      ...(s.deliveryHours !== undefined && { deliveryHoursJson: JSON.stringify(s.deliveryHours) }),
      ...(s.riders !== undefined && { ridersJson: JSON.stringify(s.riders) }),

      // ── Notificaciones ──
      ...(s.smtpHost !== undefined && { smtpHost: s.smtpHost }),
      ...(s.smtpPort !== undefined && { smtpPort: s.smtpPort }),
      ...(s.smtpUser !== undefined && { smtpUser: s.smtpUser }),
      ...(s.smtpPass !== undefined && { smtpPass: s.smtpPass }),
      ...(s.smtpFrom !== undefined && { smtpFrom: s.smtpFrom }),
      ...(s.whatsappApiToken !== undefined && { whatsappApiToken: s.whatsappApiToken }),
      ...(s.whatsappBusinessNum !== undefined && { whatsappBusinessNum: s.whatsappBusinessNum }),
      ...(s.whatsappWebhookUrl !== undefined && { whatsappWebhookUrl: s.whatsappWebhookUrl }),
      ...(s.notifChannels !== undefined && { notifChannelsJson: JSON.stringify(s.notifChannels) }),
      ...(s.reorderReminderDays !== undefined && { reorderReminderDays: s.reorderReminderDays }),

      // ── Integraciones ──
      ...(s.plinEnabled !== undefined && { plinEnabled: s.plinEnabled }),
      ...(s.plinImage !== undefined && { plinImage: s.plinImage }),
      ...(s.plinName !== undefined && { plinName: s.plinName }),
      ...(s.plinPhone !== undefined && { plinPhone: s.plinPhone }),
      ...(s.sunatProvider !== undefined && { sunatProvider: s.sunatProvider }),
      ...(s.sunatApiKey !== undefined && { sunatApiKey: s.sunatApiKey }),
      ...(s.googleAnalyticsId !== undefined && { googleAnalyticsId: s.googleAnalyticsId }),
      ...(s.googleTagManagerId !== undefined && { googleTagManagerId: s.googleTagManagerId }),

      // ── Auditoría ──
      ...(s.logRetentionDays !== undefined && { logRetentionDays: s.logRetentionDays }),
      ...(s.logActions !== undefined && { logActions: s.logActions }),

      // ── Respaldo ──
      ...(s.backupSchedule !== undefined && { backupSchedule: s.backupSchedule }),
      ...(s.lastBackupAt !== undefined && { lastBackupAt: new Date(s.lastBackupAt) }),

      // ── Suscripción ──
      ...(s.planName !== undefined && { planName: s.planName }),
      ...(s.planExpiresAt !== undefined && { planExpiresAt: new Date(s.planExpiresAt) }),
      ...(s.maxProducts !== undefined && { maxProducts: s.maxProducts }),
      ...(s.maxUsers !== undefined && { maxUsers: s.maxUsers }),
      ...(s.maxBranches !== undefined && { maxBranches: s.maxBranches }),
      ...(s.enabledModules !== undefined && { enabledModulesJson: JSON.stringify(s.enabledModules) }),

      // ── Métodos de pago adicionales ──
      ...(s.transferEnabled !== undefined && { transferEnabled: s.transferEnabled }),
      ...(s.transferBankName !== undefined && { transferBankName: s.transferBankName }),
      ...(s.transferAccountNum !== undefined && { transferAccountNum: s.transferAccountNum }),
      ...(s.transferAccountHolder !== undefined && { transferAccountHolder: s.transferAccountHolder }),

      // ── StoreCustomizer ──
      ...(s.storeTheme !== undefined && { storeThemeJson: JSON.stringify(s.storeTheme) }),
    };
    const row = await prisma.settings.upsert({
      where: { tenantId: tid },
      create: { tenantId: tid, ...d },
      update: d,
    });

    // coverUrl + bannerUrl viven en columnas TEXT que NO están en schema.prisma
    // (patrón expand seguro, agregadas via ALTER TABLE IF NOT EXISTS).
    // Persistir via raw SQL — pasamos `null` cuando vienen como string vacío
    // para que el "Quitar" del UI también funcione.
    if (s.coverUrl !== undefined) {
      await prisma
        .$executeRawUnsafe(`UPDATE "Settings" SET "coverUrl" = $1 WHERE "tenantId" = $2`, s.coverUrl || null, tid)
        .catch((err) => logger.warn("[settings.db] coverUrl raw write failed", { error: String(err) }));
    }
    if (s.bannerUrl !== undefined) {
      await prisma
        .$executeRawUnsafe(`UPDATE "Settings" SET "bannerUrl" = $1 WHERE "tenantId" = $2`, s.bannerUrl || null, tid)
        .catch((err) => logger.warn("[settings.db] bannerUrl raw write failed", { error: String(err) }));
    }

    invalidateByPrefix(`settings:${tid}`);
    // Re-fetch fresh row para que mapSettings vea los campos cover/banner persistidos.
    const fresh = await prisma.settings.findUnique({ where: { tenantId: tid } });
    return mapSettings(fresh ?? row);
  },

  // ── Loyalty rules ────────────────────────────────────────────────────────

  /**
   * Leer reglas y recompensas de loyalty desde Settings.
   * Retorna null para cada campo si no se han configurado aún.
   */
  async getLoyaltyRules(tenantId: string): Promise<{ rules: unknown; rewards: unknown }> {
    const row = await prisma.settings.findUnique({
      where: { tenantId },
      select: { loyaltyRulesJson: true, loyaltyRewardsJson: true },
    });
    const safeParse = (json: string | null | undefined): unknown => {
      if (!json) return null;
      try { return JSON.parse(json); } catch { return null; }
    };
    return {
      rules: safeParse(row?.loyaltyRulesJson),
      rewards: safeParse(row?.loyaltyRewardsJson),
    };
  },

  /**
   * Persistir reglas / recompensas de loyalty (upsert para tenants sin row previo).
   * Solo actualiza los campos provistos.
   */
  async updateLoyaltyRules(
    tenantId: string,
    data: { rules?: unknown; rewards?: unknown },
  ): Promise<void> {
    const d: Record<string, string> = {};
    if (data.rules !== undefined)   d.loyaltyRulesJson   = JSON.stringify(data.rules);
    if (data.rewards !== undefined) d.loyaltyRewardsJson = JSON.stringify(data.rewards);
    if (Object.keys(d).length === 0) return;
    await prisma.settings.upsert({
      where: { tenantId },
      update: d,
      create: { tenantId, ...d },
    });
    invalidateByPrefix(`settings:${tenantId}`);
  },
};
