import { NextRequest, NextResponse } from "next/server";
import { SettingsDB, type DbSettings } from "@/lib/jsondb";
import { enqueueActivityLog } from "@/lib/queue";
import { requireAdmin } from "@/lib/require-admin";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { hash } from "bcryptjs";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { invalidateByPrefix } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  resolveTenantSlugToId,
  syncBrandingToTenant,
  syncBrandingToStore,
  syncStoreCover,
  upsertStoreThemeJson,
} from "@/lib/db/settings-tenant-sync.db";

// [SECURITY] Defense-in-depth: validar formato slug antes de findUnique.
const TENANT_SLUG_RE = /^[a-z0-9-]{2,40}$/i;

export async function GET(req: NextRequest) {
  try {
    // [SEGURIDAD MULTI-TENANT] JWT > header (ver lib/resolve-tenant.ts).
    // Sin esto, el branding/businessName del tenant impersonado se mezcla
    // con el de "main" si el header está stale.
    const tenantId = await resolveTenantIdForRoute(req);
    const settings = await withDbRetry(() => SettingsDB.get(tenantId));
    // [SECURITY] Strip credentials + security toggles + secrets per-tenant.
    // El cliente debe re-tipear si quiere cambiar smtpPass/whatsappApiToken/etc.
    // El PUT ignora valores vacíos para estos campos (no sobreescribe).

    const {
      adminPassword: _pw,
      adminBypassLogin: _bypass,
      smtpPass: _smtp,
      whatsappApiToken: _wapp,
      sunatApiKey: _sunat,
      transferAccountNum: _tan,
      ...publicSettings
    } = settings as DbSettings & {
      adminPassword?: string;
      adminBypassLogin?: boolean;
      smtpPass?: string;
      whatsappApiToken?: string;
      sunatApiKey?: string;
      transferAccountNum?: string;
    };
    // [SECURITY F1] Agregar indicador booleano — el cliente sabe si hay pw
    // sin recibir el valor real. "admin2024" es el default de fábrica.
    const adminPasswordSet = Boolean(
      _pw && _pw !== "admin2024" && _pw !== ""
    );
    return NextResponse.json({ ...publicSettings, adminPasswordSet }, {
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
  const _rl = await applyRateLimit(req, "MODERATE", "settings"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // [SECURITY] Solo el SuperAdmin puede impersonar otro tenant via header.
    // Para cualquier otro rol, el tenantId canonico es el del JWT — sino un
    // admin de tenant A podria escribir settings de tenant B mandando un
    // header x-tenant-id arbitrario (privilege escalation).
    //
    // Esta logica DEBE alinearse con `resolveTenantIdForRoute` (usado en GET)
    // para que PUT escriba al mismo tenant del que GET lee. Antes habia una
    // asimetria que rompia la persistencia silenciosamente: PUT respondia
    // {ok:true} pero el siguiente GET devolvia los valores viejos porque
    // escribia y leia en tenants distintos. Bug encontrado al testear el
    // StoreCustomizer mientras `qaadmin@main` navegaba `/t/mi-pollo/admin`.
    const headerTenantId = req.headers.get("x-tenant-id");
    const isSuperAdmin = auth.role === "superadmin";
    const rawTenantId = (isSuperAdmin && headerTenantId && headerTenantId !== auth.tenantId)
      ? headerTenantId
      : auth.tenantId;

    // Resolver slug → cuid si lo recibimos como slug. Sin esto, el upsert
    // crea filas duplicadas (una con slug, otra con cuid) y el dueño nunca
    // ve sus uploads porque GET lee de un row distinto.
    let tenantId = rawTenantId;
    if (rawTenantId && !rawTenantId.startsWith("cm") && rawTenantId !== "main") {
      // [SECURITY] Validar formato slug antes de findUnique. Defensa en
      // profundidad: el header ya viene canonicalizado por proxy, pero un
      // refactor futuro podría romper la invariante.
      if (!TENANT_SLUG_RE.test(rawTenantId)) {
        return NextResponse.json({ error: "Invalid tenant identifier" }, { status: 400 });
      }
      const resolvedId = await resolveTenantSlugToId(rawTenantId);
      if (resolvedId) tenantId = resolvedId;
    }

    const body = await req.json() as Partial<DbSettings>;
    if (body.mode && body.mode !== "whatsapp" && body.mode !== "checkout") {
      return NextResponse.json({ error: "mode must be 'whatsapp' or 'checkout'" }, { status: 400 });
    }
    const current = await SettingsDB.get(tenantId);

    // Si SOLO viene storeTheme, guardar solo eso (no todo el objeto settings)
    // [BUG FIX 2026-05-05] MERGE en vez de REEMPLAZAR. Antes este path
    // sobrescribia el blob completo. Si un cliente envia solo
    // {storeTheme:{tiendaSections:[]}} se perdia logo/storeName/colores.
    // Mantenemos los campos existentes y aplicamos solo lo que llega.
    if (body.storeTheme && Object.keys(body).length === 1) {
      try {
        const merged = { ...(current.storeTheme ?? {}), ...body.storeTheme };
        await upsertStoreThemeJson(tenantId, merged as Record<string, unknown>);
        // CRÍTICO: invalidar cache de SettingsDB (TTL 60s) — sino la storefront
        // sirve datos viejos hasta que expire. Bug detectado al testear que los
        // colores del customizer no se aplicaban en /t/[slug]/tienda.
        invalidateByPrefix(`settings:${tenantId}`);
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
      ...(body.categoryOrder !== undefined && { categoryOrder: body.categoryOrder }),

      // ── New settings fields ──
      ...(body.razonSocial !== undefined && { razonSocial: body.razonSocial }),
      ...(body.ruc !== undefined && { ruc: body.ruc }),
      ...(body.businessEmail !== undefined && { businessEmail: body.businessEmail }),
      ...(body.currency !== undefined && { currency: body.currency }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
      ...(body.businessType !== undefined && { businessType: body.businessType }),
      ...(body.socialLinks !== undefined && { socialLinks: body.socialLinks }),
      // SECURITY 2026-05-06 (audit CI #1): validar regex hex. Antes un admin
      // malicioso podía guardar `primaryColor: "red}body{display:none}/*"` y
      // romper el CSS de toda la tienda (CSS injection stored).
      ...(typeof body.primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.primaryColor) && { primaryColor: body.primaryColor }),
      ...(typeof body.secondaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.secondaryColor) && { secondaryColor: body.secondaryColor }),
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
      // [SECURITY] Secrets: ignorar si vienen vacíos (el GET ya no los expone,
      // así que el cliente envía "" si el admin no tipea nada — preserva valor existente).
      ...(body.smtpPass !== undefined && body.smtpPass !== "" && { smtpPass: body.smtpPass }),
      ...(body.smtpFrom !== undefined && { smtpFrom: body.smtpFrom }),
      ...(body.whatsappApiToken !== undefined && body.whatsappApiToken !== "" && { whatsappApiToken: body.whatsappApiToken }),
      ...(body.whatsappBusinessNum !== undefined && { whatsappBusinessNum: body.whatsappBusinessNum }),
      ...(body.whatsappWebhookUrl !== undefined && { whatsappWebhookUrl: body.whatsappWebhookUrl }),
      ...(body.notifChannels !== undefined && { notifChannels: body.notifChannels }),
      ...(body.reorderReminderDays !== undefined && { reorderReminderDays: body.reorderReminderDays }),
      ...(body.plinEnabled !== undefined && { plinEnabled: body.plinEnabled }),
      ...(body.plinImage !== undefined && { plinImage: body.plinImage }),
      ...(body.plinName !== undefined && { plinName: body.plinName }),
      ...(body.plinPhone !== undefined && { plinPhone: body.plinPhone }),
      ...(body.sunatProvider !== undefined && { sunatProvider: body.sunatProvider }),
      ...(body.sunatApiKey !== undefined && body.sunatApiKey !== "" && { sunatApiKey: body.sunatApiKey }),
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
      ...(body.transferAccountNum !== undefined && body.transferAccountNum !== "" && { transferAccountNum: body.transferAccountNum }),
      ...(body.transferAccountHolder !== undefined && { transferAccountHolder: body.transferAccountHolder }),

      // ── StoreCustomizer ──
      // [BUG FIX 2026-05-05] MERGE storeTheme en vez de REEMPLAZAR.
      // Antes este path sobreescribia todo el blob. El StorefrontEditor envia
      // solo {tiendaSections, tiendaSectionOrder, sectionContent} y eso
      // borraba logo / storeName / colores / hero del row. Detectado tras
      // guardar visibilidad de secciones — la tienda perdia branding completo.
      ...(body.storeTheme !== undefined && {
        storeTheme: { ...(current.storeTheme ?? {}), ...body.storeTheme },
      }),
    };
    const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
     
    enqueueActivityLog({ action: "Editar", resource: "configuracion", userId: "admin", tenantId, details: { description: `Configuración actualizada: ${changed || "general"}` }, timestamp: new Date().toISOString() }).catch((err) => logger.warn("[settings] activity enqueue failed", { error: String(err) }));
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
      syncBrandingToTenant(tenantId, {
        logoUrl: body.logoUrl,
        businessName: body.businessName,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor,
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
      syncBrandingToStore(tenantId, {
        logoUrl: body.logoUrl,
        bannerUrl: body.bannerUrl,
        description: body.description,
        businessName: body.businessName,
      }).catch((err: unknown) => logger.warn("[settings] store sync skipped", { error: String(err) }));

      // Store.cover via raw SQL — el campo existe en DB (ALTER TABLE) pero el
      // schema.prisma no se regenera (zona peligrosa). Patrón expand seguro:
      // columnas nullable nuevas no rompen clientes viejos.
      if (body.coverUrl !== undefined) {
        syncStoreCover(tenantId, body.coverUrl)
          .catch((err: unknown) => logger.warn("[settings] store cover sync skipped", { error: String(err) }));
      }
    }

    return NextResponse.json(saved);
  } catch (e) {
    logger.error("[settings] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
