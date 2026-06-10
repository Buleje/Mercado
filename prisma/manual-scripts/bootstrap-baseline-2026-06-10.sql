-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('pendiente', 'recibido', 'parcial', 'cancelado', 'auto_generated');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FiadoStatus" AS ENUM ('ACTIVO', 'PAGADO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TurnoStatus" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "PrestamoStatus" AS ENUM ('ACTIVO', 'PAGADO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrestamoTipo" AS ENUM ('PERSONAL', 'BANCARIO', 'TERCERO', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "PrestamoDireccion" AS ENUM ('DADO', 'RECIBIDO');

-- CreateEnum
CREATE TYPE "PrestamoEntidadTipo" AS ENUM ('BANCO', 'PERSONA_NATURAL', 'EMPRESA', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "PrestamoSistemaAmortizacion" AS ENUM ('FRANCES', 'ALEMAN', 'AMERICANO');

-- CreateEnum
CREATE TYPE "TreasuryCuentaTipo" AS ENUM ('BANCO_AHORRO', 'BANCO_CORRIENTE', 'CAJA_FISICA', 'MONEDERO_DIGITAL');

-- CreateEnum
CREATE TYPE "TreasuryMovimientoTipo" AS ENUM ('INGRESO', 'EGRESO', 'TRANSFERENCIA_IN', 'TRANSFERENCIA_OUT');

-- CreateEnum
CREATE TYPE "TreasuryMovimientoOrigen" AS ENUM ('MANUAL', 'VENTA', 'GASTO', 'PRESTAMO_DADO', 'PRESTAMO_CUOTA', 'COMPRA_PROVEEDOR', 'CIERRE_CAJA', 'TRANSFERENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "CotizacionStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "GuiaStatus" AS ENUM ('BORRADOR', 'EMITIDA', 'EN_TRANSITO', 'ENTREGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "NotaCreditoStatus" AS ENUM ('BORRADOR', 'EMITIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "SubscriptionFreq" AS ENUM ('weekly', 'biweekly', 'monthly', 'bimonthly');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "GiftCardDesign" AS ENUM ('cumpleanos', 'navidad', 'felicitaciones', 'aniversario', 'gracias', 'anio_nuevo', 'bienvenida', 'general');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('pending_delivery', 'active', 'fully_redeemed', 'partially_redeemed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "SocioPlan" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SocioStatus" AS ENUM ('trial', 'active', 'past_due', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('pending', 'paid', 'failed', 'waived');

-- CreateEnum
CREATE TYPE "CashbackEntryType" AS ENUM ('earned', 'redeemed', 'expired', 'bonus', 'adjustment');

-- CreateEnum
CREATE TYPE "VendorDistrict" AS ENUM ('callerya', 'yarinacocha', 'manantay', 'puerto_callao', 'pucallpa_centro', 'san_fernando', 'masisea', 'otros_ucayali');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('bodega', 'minimarket', 'carniceria', 'fruteria', 'panaderia', 'licoreria', 'farmacia', 'ferreteria', 'restaurante_comida');

-- CreateEnum
CREATE TYPE "VendorPlan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'under_review', 'info_requested', 'approved', 'tenant_provisioned', 'rejected');

-- CreateEnum
CREATE TYPE "ApplicationReviewAction" AS ENUM ('start_review', 'request_info', 'approve', 'reject', 'reopen');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "ModerationState" AS ENUM ('approved', 'flagged', 'removed');

-- CreateEnum
CREATE TYPE "LiveViewerEventType" AS ENUM ('joined', 'left', 'heartbeat', 'product_click', 'add_to_cart', 'ordered');

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('bodega', 'restaurante', 'madereria', 'farmacia', 'ferreteria', 'panaderia', 'otro');

-- CreateEnum
CREATE TYPE "AdelantoModalidad" AS ENUM ('CUENTA_CORRIENTE', 'ENTREGAS_PACTADAS');

-- CreateEnum
CREATE TYPE "AdelantoStatus" AS ENUM ('ABIERTO', 'LIQUIDADO', 'EXCEDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AdelantoEntregaTipo" AS ENUM ('LIBRE', 'PRODUCTO');

-- CreateEnum
CREATE TYPE "WoodEntryStatus" AS ENUM ('pendiente', 'validado', 'rechazado', 'procesado', 'anulado');

-- CreateEnum
CREATE TYPE "WoodOriginType" AS ENUM ('concesion', 'predio_privado', 'comunidad_nativa', 'reforestacion', 'retroaserradero', 'otro');

-- CreateEnum
CREATE TYPE "WoodProductType" AS ENUM ('rolliza', 'aserrada', 'tablones', 'listones', 'durmientes', 'pulgada', 'carbon', 'lena', 'otro');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RUC', 'DNI', 'CE', 'PASAPORTE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "type" TEXT NOT NULL DEFAULT 'store',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customDomain" TEXT,
    "ownerEmail" TEXT,
    "ownerPhone" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#00B4A6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#f4a261',
    "referralCode" TEXT,
    "referredBy" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeCurrentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "industry" "Industry" NOT NULL DEFAULT 'bodega',
    "mpCustomerId" TEXT,
    "mpSubscriptionId" TEXT,
    "mpPaymentMethod" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpires" TIMESTAMP(3),
    "useThirdPartyDelivery" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2),
    "image" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "badge" TEXT,
    "barcode" TEXT,
    "stock" INTEGER,
    "stockMin" INTEGER,
    "stockMax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "shelfLifeDays" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'product',
    "brand" TEXT,
    "sku" TEXT,
    "taxType" TEXT DEFAULT 'gravado',
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "durationLabel" TEXT,
    "pricingUnit" TEXT,
    "notes" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywordsJson" TEXT,
    "ogImage" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "priceModifier" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "attributesJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModifierGroup" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModifierOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantCatalogTemplate" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantCatalogTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantCatalogOption" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantCatalogOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "activeLocationId" TEXT,
    "aiNotes" TEXT,
    "aiNotesDate" TIMESTAMP(3),
    "birthday" TIMESTAMP(3),
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "loyaltyTier" TEXT NOT NULL DEFAULT 'bronce',
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notifOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "notifPromotions" BOOLEAN NOT NULL DEFAULT true,
    "notifRestock" BOOLEAN NOT NULL DEFAULT false,
    "privateNotes" TEXT,
    "referralCode" TEXT,
    "referredBy" TEXT,
    "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tags" TEXT,
    "tipoPersona" TEXT,
    "tipoDocumento" TEXT,
    "documento" TEXT,
    "razonSocial" TEXT,
    "estado" TEXT DEFAULT 'activo',
    "whatsappSecundario" TEXT,
    "email" TEXT,
    "departamento" TEXT,
    "provincia" TEXT,
    "distrito" TEXT,
    "direccion" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "categoria" TEXT,
    "canal" TEXT,
    "listaPrecio" TEXT,
    "vendedorAsignado" TEXT,
    "diasCredito" INTEGER DEFAULT 0,
    "alertasWhatsapp" BOOLEAN DEFAULT true,
    "fechaNacimiento" DATE,
    "genero" TEXT,
    "comoLlego" TEXT,
    "observaciones" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCart" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerId" TEXT,
    "tenantId" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLocation" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerLocation" TEXT NOT NULL DEFAULT '',
    "customerReference" TEXT NOT NULL DEFAULT '',
    "total" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "paymentMethod" TEXT,
    "yapeOperationNumber" TEXT,
    "deuda" BOOLEAN,
    "appliedCouponCode" TEXT,
    "couponDiscount" DECIMAL(12,2),
    "appliedPromoId" TEXT,
    "discountAmount" DECIMAL(12,2),
    "totalCogs" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "deletedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "riderName" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "paymentApprovalId" TEXT,
    "customerId" TEXT,
    "deliveryStatus" TEXT,
    "driverId" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "modifiersJson" JSONB,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "phone" TEXT,
    "productId" INTEGER,
    "storeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "adminReply" TEXT,
    "adminReplyDate" TIMESTAMP(3),
    "qualityRating" INTEGER,
    "priceRating" INTEGER,
    "deliveryRating" INTEGER,
    "photosJson" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "helpfulUpvotes" INTEGER NOT NULL DEFAULT 0,
    "helpfulDownvotes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "voteType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'checkout',
    "businessName" TEXT,
    "businessPhone" TEXT,
    "businessAddress" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "hours" TEXT,
    "deliveryZone" TEXT,
    "yapeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "yapeImage" TEXT,
    "yapeName" TEXT,
    "yapePhone" TEXT,
    "cashEnabled" BOOLEAN NOT NULL DEFAULT true,
    "navLinksJson" TEXT,
    "businessLat" DOUBLE PRECISION,
    "businessLon" DOUBLE PRECISION,
    "adminPassword" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "adminBypassLogin" BOOLEAN NOT NULL DEFAULT false,
    "comboTemplatesJson" TEXT,
    "featureFlagsJson" TEXT,
    "razonSocial" TEXT,
    "ruc" TEXT,
    "businessEmail" TEXT,
    "currency" TEXT DEFAULT 'PEN',
    "timezone" TEXT DEFAULT 'America/Lima',
    "businessType" TEXT,
    "socialLinksJson" TEXT,
    "primaryColor" TEXT DEFAULT '#2d6a4f',
    "secondaryColor" TEXT DEFAULT '#f4a261',
    "slogan" TEXT,
    "dateFormat" TEXT DEFAULT 'DD/MM/YYYY',
    "timeFormat" TEXT DEFAULT '24h',
    "decimals" INTEGER DEFAULT 2,
    "taxRate" DECIMAL(5,2) DEFAULT 18,
    "fiscalYearStart" INTEGER DEFAULT 1,
    "invoiceSeriesJson" TEXT,
    "invoiceStartJson" TEXT,
    "enabledDocTypes" TEXT DEFAULT 'factura,boleta,ticket',
    "roundingMode" TEXT DEFAULT 'none',
    "maxDiscountPercent" DOUBLE PRECISION DEFAULT 100,
    "discountRequiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "invoiceFooterText" TEXT,
    "sunatRuc" TEXT,
    "sunatDenominacion" TEXT,
    "sunatDireccion" TEXT,
    "defaultUnit" TEXT DEFAULT 'unidad',
    "globalMinStock" INTEGER DEFAULT 5,
    "stockAlertChannels" TEXT DEFAULT 'dashboard',
    "adjustReasonsJson" TEXT,
    "fefoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fefoAlertDays" INTEGER DEFAULT 15,
    "inventoryCountFreq" TEXT DEFAULT 'monthly',
    "cashOpeningAmount" DECIMAL(12,2) DEFAULT 100,
    "cashAlertMax" DECIMAL(12,2) DEFAULT 500,
    "returnPolicyDays" INTEGER DEFAULT 7,
    "returnMaxNoAuth" DECIMAL(12,2) DEFAULT 50,
    "autoCloseTime" TEXT,
    "deliveryZonesJson" TEXT,
    "freeDeliveryMin" DECIMAL(12,2) DEFAULT 0,
    "deliveryMaxRadius" DOUBLE PRECISION DEFAULT 10,
    "deliveryHoursJson" TEXT,
    "ridersJson" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT,
    "whatsappApiToken" TEXT,
    "whatsappBusinessNum" TEXT,
    "whatsappWebhookUrl" TEXT,
    "notifChannelsJson" TEXT,
    "reorderReminderDays" INTEGER,
    "plinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "plinImage" TEXT,
    "plinName" TEXT,
    "plinPhone" TEXT,
    "sunatProvider" TEXT,
    "sunatApiKey" TEXT,
    "googleAnalyticsId" TEXT,
    "googleTagManagerId" TEXT,
    "logRetentionDays" INTEGER DEFAULT 90,
    "logActions" TEXT DEFAULT 'sales,edits,access',
    "backupSchedule" TEXT DEFAULT 'none',
    "lastBackupAt" TIMESTAMP(3),
    "planName" TEXT DEFAULT 'free',
    "planExpiresAt" TIMESTAMP(3),
    "maxProducts" INTEGER DEFAULT 500,
    "maxUsers" INTEGER DEFAULT 3,
    "maxBranches" INTEGER DEFAULT 1,
    "enabledModulesJson" TEXT,
    "transferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "transferBankName" TEXT,
    "transferAccountNum" TEXT,
    "transferAccountHolder" TEXT,
    "productCategoriesJson" TEXT,
    "storeThemeJson" TEXT,
    "loyaltyRulesJson" TEXT,
    "loyaltyRewardsJson" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "tipoPersona" TEXT,
    "tipoDocumento" TEXT,
    "documento" TEXT,
    "razonSocial" TEXT,
    "estado" TEXT DEFAULT 'activo',
    "whatsappSecundario" TEXT,
    "personaContacto" TEXT,
    "departamento" TEXT,
    "provincia" TEXT,
    "distrito" TEXT,
    "direccion" TEXT,
    "categoria" TEXT,
    "condicionPago" TEXT,
    "diasCredito" INTEGER DEFAULT 0,
    "cuentaBancaria" TEXT,
    "banco" TEXT,
    "observaciones" TEXT,
    "contactName" TEXT,
    "appliedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "paymentMethod" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "discount" DECIMAL(12,2) DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "totalCogs" DECIMAL(12,2),
    "payment" TEXT NOT NULL DEFAULT 'efectivo',
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "change" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerPhone" TEXT,
    "customerId" TEXT,
    "cashierId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comprobanteTipo" TEXT DEFAULT 'ticket',
    "comprobanteRuc" TEXT,
    "comprobanteNumero" TEXT,
    "descuentoMonto" DECIMAL(10,2),
    "descuentoPorcentaje" DECIMAL(5,2),
    "paymentDetails" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "minPurchase" DECIMAL(12,2),
    "imageUrl" TEXT,
    "message" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetPhones" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'efectivo',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closingAmount" DECIMAL(12,2),
    "expectedAmount" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'abierta',
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'efectivo',
    "description" TEXT NOT NULL DEFAULT '',
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "lossType" TEXT,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL DEFAULT 0,
    "newStock" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "warehouseId" TEXT,
    "createdBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2),
    "minPurchase" DECIMAL(12,2),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "saleId" TEXT,
    "orderId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "customerPhone" TEXT,
    "creditApplied" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" SERIAL NOT NULL,
    "returnId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" SERIAL NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "oldPrice" DECIMAL(12,2) NOT NULL,
    "newPrice" DECIMAL(12,2) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySlot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMessage" (
    "id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierEvaluation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "punctuality" INTEGER NOT NULL DEFAULT 3,
    "quality" INTEGER NOT NULL DEFAULT 3,
    "price" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" SERIAL NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "user" TEXT NOT NULL DEFAULT 'admin',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "phone" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "name" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "totpLastUsedStep" INTEGER,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperadminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperadminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "orderId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageHero" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageSlug" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "ctaText" TEXT,
    "ctaLink" TEXT,
    "gradientFrom" TEXT,
    "gradientTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageHero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'default',
    "settings" JSONB,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageBlock" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "props" JSONB NOT NULL,
    "styles" JSONB,
    "mobileProps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "props" JSONB NOT NULL,
    "styles" JSONB,
    "preview" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "alt" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "folder" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "blurhash" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "settings" JSONB,
    "comment" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colors" JSONB NOT NULL,
    "fonts" JSONB NOT NULL,
    "spacing" JSONB,
    "header" JSONB,
    "footer" JSONB,
    "animations" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Navigation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "settings" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Navigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantWhatsAppConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "whatsappToken" TEXT NOT NULL,
    "webhookVerifyToken" TEXT NOT NULL,
    "businessName" TEXT,
    "yapeNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantWhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "cartItems" JSONB NOT NULL DEFAULT '[]',
    "deliveryAddress" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookQueue" (
    "id" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpPendingPlan" (
    "id" TEXT NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "preferenceId" TEXT,
    "preapprovalId" TEXT,
    "externalRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MpPendingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variablesJson" TEXT NOT NULL DEFAULT '[]',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL DEFAULT 'Otros',
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL DEFAULT '',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "costUnit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "productId" INTEGER,
    "warehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "module" TEXT NOT NULL,
    "conditionsJson" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT 'Cliente',
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "variants" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABTestEvent" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "value" DECIMAL(12,2),
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerPhone" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'nps',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedBy" TEXT,
    "note" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronDeadLetter" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronHealthLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronHealthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'principal',
    "location" TEXT NOT NULL DEFAULT '',
    "manager" TEXT NOT NULL DEFAULT 'Administrador',
    "capacity" INTEGER NOT NULL DEFAULT 10000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'und',
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "requestedBy" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "aisle" TEXT NOT NULL DEFAULT '',
    "shelf" TEXT NOT NULL DEFAULT '',
    "bin" TEXT NOT NULL DEFAULT '',
    "warehouseId" TEXT NOT NULL,
    "productId" INTEGER,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorWelcome" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "devices" TEXT NOT NULL,
    "userAgent" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'todos',
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "totalAudience" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "minSales" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxSales" DECIMAL(12,2),
    "rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "totalVentas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cantidadVentas" INTEGER NOT NULL DEFAULT 0,
    "ticketPromedio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "efectivoContado" DECIMAL(10,2),
    "efectivoEsperado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "diferenciaCaja" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fiadosCobrados" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fiadosNuevos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fiadosVencidos" INTEGER NOT NULL DEFAULT 0,
    "mejorHora" TEXT,
    "productoTop" TEXT,
    "stockAlertas" TEXT,
    "notas" TEXT,
    "creadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fiado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT,
    "status" "FiadoStatus" NOT NULL DEFAULT 'ACTIVO',
    "fechaVence" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fiado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiadoCuota" (
    "id" TEXT NOT NULL,
    "fiadoId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "pagadoEn" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiadoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "cashRegisterId" TEXT,
    "inicioEfectivo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cierreEfectivo" DECIMAL(10,2),
    "ventasTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "TurnoStatus" NOT NULL DEFAULT 'ABIERTO',
    "abrioEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerroEn" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "productoId" INTEGER,
    "costoTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "emoji" TEXT,
    "tiempoMinutos" INTEGER,
    "porciones" INTEGER,
    "dificultad" TEXT,
    "categoria" TEXT,
    "pasosJson" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaIngrediente" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',

    CONSTRAINT "RecetaIngrediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduccionLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "costoReal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "producidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProduccionLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestamo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "tipo" "PrestamoTipo" NOT NULL DEFAULT 'PERSONAL',
    "direccion" "PrestamoDireccion" NOT NULL DEFAULT 'DADO',
    "entidadNombre" TEXT,
    "entidadTipo" "PrestamoEntidadTipo",
    "nroOperacion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "tasaInteres" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tea" DECIMAL(6,4),
    "moraInteres" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "numeroCuotas" INTEGER NOT NULL DEFAULT 1,
    "sistemaAmortizacion" "PrestamoSistemaAmortizacion" NOT NULL DEFAULT 'FRANCES',
    "periodoGracia" INTEGER NOT NULL DEFAULT 0,
    "status" "PrestamoStatus" NOT NULL DEFAULT 'ACTIVO',
    "fechaDesembolso" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "garantia" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestamoCuota" (
    "id" TEXT NOT NULL,
    "prestamoId" TEXT NOT NULL,
    "numeroCuota" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "capital" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechaVence" TIMESTAMP(3) NOT NULL,
    "pagadoEn" TIMESTAMP(3),
    "montoPagado" DECIMAL(12,2),
    "moraCalculada" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PrestamoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestamoDocumento" (
    "id" TEXT NOT NULL,
    "prestamoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'otro',
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrestamoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryCuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TreasuryCuentaTipo" NOT NULL,
    "banco" TEXT,
    "numeroCuenta" TEXT,
    "cci" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldoInicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryMovimiento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tipo" "TreasuryMovimientoTipo" NOT NULL,
    "origen" "TreasuryMovimientoOrigen" NOT NULL DEFAULT 'MANUAL',
    "monto" DECIMAL(12,2) NOT NULL,
    "saldoAnterior" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldoPosterior" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "referencia" TEXT,
    "categoria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryTransferencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryTransferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "customerId" TEXT,
    "clienteNombre" TEXT NOT NULL,
    "clienteRuc" TEXT,
    "validoHasta" TIMESTAMP(3) NOT NULL,
    "status" "CotizacionStatus" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "igv" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionItem" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "productoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precioUnit" DECIMAL(10,2) NOT NULL,
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "CotizacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaRemision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "orderId" TEXT,
    "motivoTraslado" TEXT NOT NULL,
    "fechaTraslado" TIMESTAMP(3) NOT NULL,
    "destinatarioNombre" TEXT NOT NULL,
    "destinatarioRuc" TEXT,
    "destinatarioDireccion" TEXT NOT NULL,
    "transportistaRuc" TEXT,
    "transportistaNombre" TEXT,
    "vehiculoPlaca" TEXT,
    "conductorNombre" TEXT,
    "conductorDni" TEXT,
    "bultos" INTEGER,
    "documentoRef" TEXT,
    "puntoPartida" TEXT NOT NULL,
    "puntoLlegada" TEXT NOT NULL,
    "status" "GuiaStatus" NOT NULL DEFAULT 'BORRADOR',
    "pesoTotal" DECIMAL(10,3),
    "pesoBruto" DECIMAL(10,3),
    "notas" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaRemision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaRemisionItem" (
    "id" TEXT NOT NULL,
    "guiaId" TEXT NOT NULL,
    "productoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'NIU',
    "pesoUnitario" DECIMAL(10,3),

    CONSTRAINT "GuiaRemisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "orderId" TEXT,
    "saleId" TEXT,
    "motivoCodigo" TEXT NOT NULL,
    "motivoDesc" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "NotaCreditoStatus" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConteoFisico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'completo',
    "status" TEXT NOT NULL DEFAULT 'INICIADO',
    "creadoPor" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),

    CONSTRAINT "ConteoFisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConteoFisicoItem" (
    "id" TEXT NOT NULL,
    "conteoId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "stockSistema" INTEGER NOT NULL,
    "stockContado" INTEGER,
    "diferencia" INTEGER,
    "ajustado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConteoFisicoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "categorias" TEXT NOT NULL DEFAULT '[]',
    "condicion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT,
    "proveedorNombre" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" SERIAL NOT NULL,
    "returnId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'und',

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDue" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "lastFiled" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomKpi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "formula" TEXT,
    "currentValue" DOUBLE PRECISION DEFAULT 0,
    "target" DOUBLE PRECISION DEFAULT 0,
    "unit" TEXT DEFAULT 'S/',
    "trend" TEXT DEFAULT 'flat',
    "changePercent" DOUBLE PRECISION DEFAULT 0,
    "period" TEXT DEFAULT 'Hoy',
    "category" TEXT DEFAULT 'Ventas',
    "color" TEXT DEFAULT 'bg-emerald-500',
    "history" JSONB NOT NULL DEFAULT '[]',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "banner" TEXT,
    "category" TEXT NOT NULL DEFAULT 'bodega',
    "zone" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "vacationMode" BOOLEAN NOT NULL DEFAULT false,
    "vacationMessage" TEXT,
    "whatsappPublic" TEXT,
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreBanner" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL DEFAULT 'hero',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "wholesalePrice" DECIMAL(12,2),
    "minOrderQty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "volumePricingTiers" JSONB,
    "discountPrice" DECIMAL(12,2),
    "discountUntil" TIMESTAMP(3),
    "discountLabel" VARCHAR(40),

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "zone" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL DEFAULT 'moto',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 5.0,
    "notes" TEXT,
    "passwordHash" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "currentOrderId" TEXT,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maxRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "totalOffers" INTEGER NOT NULL DEFAULT 0,
    "totalAccepted" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "feeOffered" DECIMAL(12,2) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "fee" DECIMAL(12,2) NOT NULL,
    "tipAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tipMessage" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "routeStartedAt" TIMESTAMP(3),
    "proofPhotoUrl" TEXT,
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySOSAlert" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeliverySOSAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTracking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "distanceM" INTEGER,
    "etaMinutes" INTEGER,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "photoUrl" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "vehicleType" TEXT NOT NULL DEFAULT 'moto',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "actualStartAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "completedStops" INTEGER NOT NULL DEFAULT 0,
    "totalDistanceM" INTEGER,
    "optimizedByAi" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRouteStop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "address" TEXT NOT NULL,
    "addressDetail" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "estimatedArrivalAt" TIMESTAMP(3),
    "actualArrivalAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "proofPhotoUrl" TEXT,
    "proofSignatureUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "unreadForBuyer" INTEGER NOT NULL DEFAULT 0,
    "unreadForSeller" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageText" TEXT,
    "lastSenderType" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "attachmentUrl" TEXT,
    "metadataJson" TEXT,
    "readByBuyerAt" TIMESTAMP(3),
    "readBySellerAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesaleOrder" (
    "id" TEXT NOT NULL,
    "buyerTenantId" TEXT NOT NULL,
    "sellerTenantId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesaleOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesaleOrderItem" (
    "id" TEXT NOT NULL,
    "wholesaleOrderId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "appliedDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "WholesaleOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePermission" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT,
    "partnerId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPortal" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSunatConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "direccionFiscal" TEXT,
    "ubigeo" TEXT,
    "nubefactToken" TEXT NOT NULL,
    "nubefactUrl" TEXT NOT NULL DEFAULT 'https://api.nubefact.com/api/v1',
    "boletaSeries" TEXT NOT NULL DEFAULT 'B001',
    "facturaSeries" TEXT NOT NULL DEFAULT 'F001',
    "lastBoletaNum" INTEGER NOT NULL DEFAULT 0,
    "lastFacturaNum" INTEGER NOT NULL DEFAULT 0,
    "isProduction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSunatConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SunatInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerRuc" TEXT,
    "customerName" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "xmlContent" TEXT,
    "cdrResponse" TEXT,
    "sunatStatus" TEXT NOT NULL DEFAULT 'pending',
    "nubefactId" TEXT,
    "pdfUrl" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SunatInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantHealthScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "loginsLast7d" INTEGER NOT NULL DEFAULT 0,
    "loginsLast30d" INTEGER NOT NULL DEFAULT 0,
    "ordersLast7d" INTEGER NOT NULL DEFAULT 0,
    "ordersLast30d" INTEGER NOT NULL DEFAULT 0,
    "featuresUsed" INTEGER NOT NULL DEFAULT 0,
    "daysSinceLastOrder" INTEGER NOT NULL DEFAULT 0,
    "daysSinceLastLogin" INTEGER NOT NULL DEFAULT 0,
    "trialDaysLeft" INTEGER,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantHealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "detail" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "intervention" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnPlaybook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerSignal" TEXT NOT NULL,
    "triggerSeverity" TEXT NOT NULL DEFAULT 'high',
    "action" TEXT NOT NULL,
    "templateId" TEXT,
    "discountPercent" INTEGER,
    "discountDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "creditScore" INTEGER NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usedCredit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "availableCredit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'none',
    "totalLoans" INTEGER NOT NULL DEFAULT 0,
    "paidOnTime" INTEGER NOT NULL DEFAULT 0,
    "paidLate" INTEGER NOT NULL DEFAULT 0,
    "defaulted" INTEGER NOT NULL DEFAULT 0,
    "avgTicket" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "purchaseFreqDays" DOUBLE PRECISION,
    "lastScoreUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditInstallment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditProfileId" TEXT NOT NULL,
    "orderId" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "installmentAmount" DECIMAL(12,2) NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditScoreHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "creditProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "creditLimit" DECIMAL(12,2) NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "breakdownPurchaseHistory" INTEGER NOT NULL DEFAULT 0,
    "breakdownPaymentPunctuality" INTEGER NOT NULL DEFAULT 0,
    "breakdownAvgTicket" INTEGER NOT NULL DEFAULT 0,
    "breakdownSeniority" INTEGER NOT NULL DEFAULT 0,
    "breakdownLoyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiadoId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "CreditReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "predictedQty" DOUBLE PRECISION NOT NULL,
    "actualQty" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL,
    "daysAhead" INTEGER NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceVersion" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "oldPrice" DECIMAL(12,2) NOT NULL,
    "newPrice" DECIMAL(12,2) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "ordersPlaced" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "ordersOnTime" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryDays" DOUBLE PRECISION,
    "fillRate" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOffer" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountPercent" DOUBLE PRECISION,
    "minQuantity" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'assistant',
    "title" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "feedback" TEXT,
    "feedbackNote" TEXT,
    "mode" TEXT,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAnalytics" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "addsToCart" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockoutPrediction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "predictedDaysToStockout" DOUBLE PRECISION NOT NULL,
    "avgDailyUnits" DOUBLE PRECISION NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockoutPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesAnomaly" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "comparisonDate" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "expected" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "deltaPct" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsoredBoost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "bidAmount" DECIMAL(10,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "impressionsCount" INTEGER NOT NULL DEFAULT 0,
    "clicksCount" INTEGER NOT NULL DEFAULT 0,
    "conversionsCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpentPen" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxBudgetPen" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsoredBoost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "clickedProductId" INTEGER,
    "lastSearchedAt" TIMESTAMP(3) NOT NULL,
    "searchCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SearchSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItemStatus" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TenantFeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAbandonedCart" (
    "id" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAbandonedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantStorePage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroImageUrl" TEXT,
    "heroCtaLabel" TEXT,
    "heroCtaUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#00B4A6',
    "accentColor" TEXT NOT NULL DEFAULT '#f4a261',
    "aboutTitle" TEXT,
    "aboutBody" TEXT,
    "whatsappPhone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "footerHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantStorePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPageProductOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "exclusivePrice" DECIMAL(12,2),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPageProductOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPagePromotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" DECIMAL(12,2) NOT NULL,
    "bannerImageUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPagePromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPageVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "path" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPageVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "frequency" "SubscriptionFreq" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "status" "SubscriptionStatus" NOT NULL,
    "nextDeliveryAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_deliveries" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeLast4" TEXT NOT NULL,
    "amountSoles" DECIMAL(10,2) NOT NULL,
    "balanceSoles" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "design" "GiftCardDesign" NOT NULL,
    "status" "GiftCardStatus" NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "recipientUserId" TEXT,
    "dedicatoria" TEXT,
    "expiresAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstRedeemedAt" TIMESTAMP(3),
    "fullyRedeemedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_redemptions" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "amountRedeemed" DECIMAL(10,2) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socio_memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SocioPlan" NOT NULL,
    "status" "SocioStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socio_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socio_billing_cycles" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountSoles" DECIMAL(10,2) NOT NULL,
    "status" "BillingCycleStatus" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socio_billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socio_cashback_entries" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "CashbackEntryType" NOT NULL,
    "amountSoles" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socio_cashback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "district" "VendorDistrict" NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactDni" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "rucDocumentUrl" TEXT,
    "storefrontPhotoUrl" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "schedule" JSONB NOT NULL,
    "deliveryZones" JSONB NOT NULL,
    "deliveryFeeSoles" DECIMAL(10,2) NOT NULL,
    "plan" "VendorPlan" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStartedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "reviewerUserId" TEXT,
    "decisionReason" TEXT,
    "infoRequestNote" TEXT,
    "tenantId" TEXT,
    "tenantSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_application_reviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "action" "ApplicationReviewAction" NOT NULL,
    "note" TEXT,
    "previousStatus" "ApplicationStatus" NOT NULL,
    "newStatus" "ApplicationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_application_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "status" "LiveStatus" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "streamUrl" TEXT,
    "recordingUrl" TEXT,
    "viewersPeak" INTEGER NOT NULL DEFAULT 0,
    "viewersAvg" INTEGER NOT NULL DEFAULT 0,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "ordersGenerated" INTEGER NOT NULL DEFAULT 0,
    "gmvSoles" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "categoryChips" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_products" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "featuredOrder" INTEGER NOT NULL,
    "highlightedAt" TIMESTAMP(3),
    "addedToCart" INTEGER NOT NULL DEFAULT 0,
    "orderedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_chat_messages" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "moderationState" "ModerationState" NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_viewer_events" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "eventType" "LiveViewerEventType" NOT NULL,
    "productId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_viewer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "detectedAmount" DECIMAL(12,2),
    "imageUrl" TEXT NOT NULL,
    "visionResponse" JSONB,
    "yapeOpCode" TEXT,
    "yapeLast4" TEXT,
    "yapeDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDeadLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventPayload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "handlerName" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EventDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'otros',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "customerId" TEXT,
    "orderId" TEXT,
    "supplierId" TEXT,
    "ocrText" TEXT,
    "ocrMetadata" JSONB,
    "aiCategory" TEXT,
    "aiTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiryReminderSentAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeNote" TEXT,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "password" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAuditLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdelantoBeneficiario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "notas" TEXT,
    "limiteCredito" DECIMAL(12,2),
    "ultimoRecordatorio" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdelantoBeneficiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdelantoRecurrente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "modalidad" "AdelantoModalidad" NOT NULL DEFAULT 'CUENTA_CORRIENTE',
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "frecuencia" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "diaMes" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaEjecucion" TIMESTAMP(3),
    "proximaEjecucion" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdelantoRecurrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adelanto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "modalidad" "AdelantoModalidad" NOT NULL DEFAULT 'CUENTA_CORRIENTE',
    "montoAdelantado" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "fechaAdelanto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AdelantoStatus" NOT NULL DEFAULT 'ABIERTO',
    "saldoPendiente" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "comprobanteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Adelanto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdelantoEntrega" (
    "id" TEXT NOT NULL,
    "adelantoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "AdelantoEntregaTipo" NOT NULL DEFAULT 'LIBRE',
    "descripcion" TEXT,
    "productId" INTEGER,
    "cantidad" DECIMAL(12,3),
    "valor" DECIMAL(12,2) NOT NULL,
    "sumadoAStock" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "comprobanteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdelantoEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdelantoEntregaPactada" (
    "id" TEXT NOT NULL,
    "adelantoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descripcionEsperada" TEXT NOT NULL,
    "valorEsperado" DECIMAL(12,2) NOT NULL,
    "fechaEsperada" TIMESTAMP(3),
    "cumplidaEn" TIMESTAMP(3),
    "entregaId" TEXT,

    CONSTRAINT "AdelantoEntregaPactada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WoodEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gtfNumber" TEXT NOT NULL,
    "gtfDate" TIMESTAMP(3),
    "gtfSeries" TEXT,
    "providerName" TEXT NOT NULL,
    "providerDocument" TEXT,
    "providerDocumentType" "DocumentType",
    "originType" "WoodOriginType" NOT NULL DEFAULT 'otro',
    "originCode" TEXT,
    "originRegion" TEXT,
    "originDistrict" TEXT,
    "speciesCommonName" TEXT NOT NULL,
    "speciesScientificName" TEXT,
    "speciesCites" BOOLEAN NOT NULL DEFAULT false,
    "productType" "WoodProductType" NOT NULL DEFAULT 'rolliza',
    "volumeM3" DECIMAL(12,4) NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "avgLengthM" DECIMAL(8,2),
    "avgDiameterCm" DECIMAL(8,2),
    "humidityPct" DECIMAL(5,2),
    "defectsNotes" TEXT,
    "notes" TEXT,
    "photos" JSONB,
    "status" "WoodEntryStatus" NOT NULL DEFAULT 'pendiente',
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestLothCaratula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registroNumber" TEXT,
    "tomo" TEXT,
    "titularName" TEXT NOT NULL,
    "representanteLegal" TEXT,
    "tituloHabilitante" TEXT,
    "ruc" TEXT,
    "dni" TEXT,
    "domicilio" TEXT,
    "departamento" TEXT,
    "provincia" TEXT,
    "distrito" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "docGestionType" TEXT,
    "docGestionName" TEXT,
    "resolucionNumber" TEXT,
    "resolucionDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestLothCaratula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestLothEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caratulaId" TEXT,
    "planId" TEXT,
    "section" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "treeCode" TEXT,
    "trozaCode" TEXT,
    "despachoCode" TEXT,
    "isRama" BOOLEAN NOT NULL DEFAULT false,
    "speciesCommon" TEXT,
    "speciesScientific" TEXT,
    "cites" BOOLEAN NOT NULL DEFAULT false,
    "diamMayorM" DECIMAL(8,3),
    "diamMenorM" DECIMAL(8,3),
    "lengthM" DECIMAL(8,2),
    "volumeM3" DECIMAL(12,4),
    "productType" TEXT,
    "quantity" DECIMAL(14,4),
    "unit" TEXT,
    "pieces" INTEGER,
    "gtfNumber" TEXT,
    "gpsLat" DECIMAL(10,7),
    "gpsLng" DECIMAL(10,7),
    "photoUrl" TEXT,
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "consumoInterno" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT,
    "correctsLineNo" INTEGER,
    "correctionNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestLothEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caratulaId" TEXT,
    "planType" TEXT NOT NULL DEFAULT 'PO',
    "planNumber" TEXT,
    "tituloHabilitante" TEXT,
    "resolucionNumber" TEXT,
    "resolucionDate" TIMESTAMP(3),
    "titularName" TEXT NOT NULL,
    "arffs" TEXT,
    "region" TEXT,
    "parcelaCorta" TEXT,
    "areaHa" DECIMAL(12,2),
    "uitRef" DECIMAL(10,2),
    "costoExtraccionM3" DECIMAL(12,2),
    "costoTransformacionM3" DECIMAL(12,2),
    "costoFleteM3" DECIMAL(12,2),
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestPlanSpecies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "speciesCommon" TEXT NOT NULL,
    "speciesScientific" TEXT,
    "cites" BOOLEAN NOT NULL DEFAULT false,
    "categoria" TEXT,
    "volumenAutorizadoM3" DECIMAL(12,4) NOT NULL,
    "arbolesAutorizados" INTEGER,
    "valorEstadoNaturalSoles" DECIMAL(12,2),
    "precioVentaSoles" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestPlanSpecies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestCensusTree" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "treeCode" TEXT NOT NULL,
    "speciesCommon" TEXT NOT NULL,
    "speciesScientific" TEXT,
    "cites" BOOLEAN NOT NULL DEFAULT false,
    "dapM" DECIMAL(8,3),
    "alturaComercialM" DECIMAL(8,2),
    "factorForma" DECIMAL(5,3),
    "volumenEstimadoM3" DECIMAL(12,4),
    "utmZona" TEXT,
    "utmX" DECIMAL(12,2),
    "utmY" DECIMAL(12,2),
    "parcelaCorta" TEXT,
    "calidad" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'en_pie',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestCensusTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestGtf" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT,
    "gtfNumber" TEXT NOT NULL,
    "gtfDate" TIMESTAMP(3),
    "tipo" TEXT NOT NULL DEFAULT 'trozas',
    "titularName" TEXT,
    "tituloHabilitante" TEXT,
    "parcelaCorta" TEXT,
    "transportista" TEXT,
    "transportistaDoc" TEXT,
    "conductor" TEXT,
    "conductorLicencia" TEXT,
    "placaVehiculo" TEXT,
    "origen" TEXT,
    "destino" TEXT,
    "items" JSONB,
    "volumenTotalM3" DECIMAL(12,4),
    "piezasTotal" INTEGER,
    "observations" TEXT,
    "status" TEXT NOT NULL DEFAULT 'emitida',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestGtf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForestCtpEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gtfIngreso" TEXT,
    "materiaPrimaRef" TEXT,
    "speciesCommon" TEXT,
    "speciesScientific" TEXT,
    "cites" BOOLEAN NOT NULL DEFAULT false,
    "productType" TEXT,
    "volumeInputM3" DECIMAL(12,4),
    "rendimientoPct" DECIMAL(5,2),
    "quantity" DECIMAL(14,4),
    "unit" TEXT,
    "pieces" INTEGER,
    "gtfNumber" TEXT,
    "destino" TEXT,
    "observations" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ForestCtpEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoProducer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "sector" TEXT,
    "parcelaHa" DECIMAL(10,2),
    "variedad" TEXT,
    "certificacion" TEXT,
    "altitudMsnm" INTEGER,
    "telefono" TEXT,
    "observaciones" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CacaoProducer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loteCode" TEXT NOT NULL,
    "productorId" TEXT,
    "productorNombre" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variedad" TEXT,
    "tipoGrano" TEXT NOT NULL DEFAULT 'seco',
    "pesoKg" DECIMAL(12,2) NOT NULL,
    "humedadPct" DECIMAL(5,2),
    "precioPorKg" DECIMAL(10,2),
    "premioPorKg" DECIMAL(10,2),
    "totalPagado" DECIMAL(14,2),
    "cutGranos" INTEGER,
    "pctBienFermentado" DECIMAL(5,2),
    "pctVioleta" DECIMAL(5,2),
    "pctPizarroso" DECIMAL(5,2),
    "pctMohoso" DECIMAL(5,2),
    "granosPor100g" INTEGER,
    "pctCascara" DECIMAL(5,2),
    "pctImpurezas" DECIMAL(5,2),
    "indiceFermentacion" DECIMAL(5,2),
    "grado" TEXT,
    "destino" TEXT,
    "observaciones" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CacaoLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoBeneficio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loteId" TEXT,
    "loteCode" TEXT,
    "fermInicio" TIMESTAMP(3),
    "fermDias" INTEGER,
    "fermVolteos" INTEGER,
    "fermTempMaxC" DECIMAL(5,2),
    "tipoFermentador" TEXT,
    "secInicio" TIMESTAMP(3),
    "secDias" INTEGER,
    "metodoSecado" TEXT,
    "humedadInicial" DECIMAL(5,2),
    "humedadFinal" DECIMAL(5,2),
    "pesoHumedoKg" DECIMAL(12,2),
    "pesoSecoKg" DECIMAL(12,2),
    "mermaPct" DECIMAL(5,2),
    "estado" TEXT NOT NULL DEFAULT 'fermentando',
    "observaciones" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CacaoBeneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoVenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ventaCode" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compradorNombre" TEXT,
    "canal" TEXT,
    "pesoKg" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "precioPorKg" DECIMAL(10,2),
    "tipoCambio" DECIMAL(8,4),
    "totalPen" DECIMAL(14,2),
    "esFob" BOOLEAN NOT NULL DEFAULT false,
    "variedad" TEXT,
    "grado" TEXT,
    "observaciones" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "annulledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CacaoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reclamo" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "domicilio" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "esMenor" BOOLEAN NOT NULL DEFAULT false,
    "apoderado" TEXT,
    "tipoBien" TEXT NOT NULL,
    "montoReclamado" DECIMAL(12,2),
    "descripcionBien" TEXT NOT NULL,
    "numeroPedido" TEXT,
    "tienda" TEXT,
    "tenantId" TEXT,
    "tipoReclamo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "pedidoConsumidor" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "respuesta" TEXT,
    "respondidoEn" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reclamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plate" TEXT,
    "imageUrl" TEXT,
    "purchaseValue" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'operativo',
    "hourlyRate" DECIMAL(12,2),
    "rateUnit" TEXT NOT NULL DEFAULT 'hora',
    "capacityPerDay" INTEGER DEFAULT 8,
    "currentHours" DECIMAL(12,1),
    "fuelTargetPerUnit" DECIMAL(12,3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetIncome" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client" TEXT,
    "quantity" DECIMAL(10,2),
    "unit" TEXT NOT NULL DEFAULT 'hora',
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "hourStart" DECIMAL(12,1),
    "hourEnd" DECIMAL(12,1),
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL DEFAULT 'combustible',
    "gallons" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intervalHours" INTEGER,
    "intervalDays" INTEGER,
    "lastDoneHours" DECIMAL(12,1),
    "lastDoneAt" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetInspection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'salida',
    "client" TEXT,
    "hours" DECIMAL(12,1),
    "itemsJson" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_referralCode_key" ON "Tenant"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeSubscriptionId_key" ON "Tenant"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_emailVerifyToken_key" ON "Tenant"("emailVerifyToken");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_active_idx" ON "Tenant"("active");

-- CreateIndex
CREATE INDEX "Tenant_stripeCustomerId_idx" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Tenant_industry_idx" ON "Tenant"("industry");

-- CreateIndex
CREATE INDEX "Product_tenantId_active_idx" ON "Product"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Product_tenantId_category_active_idx" ON "Product"("tenantId", "category", "active");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_tenantId_idx" ON "ProductImage"("tenantId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_tenantId_idx" ON "ProductVariant"("tenantId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductModifierGroup_productId_idx" ON "ProductModifierGroup"("productId");

-- CreateIndex
CREATE INDEX "ProductModifierGroup_tenantId_idx" ON "ProductModifierGroup"("tenantId");

-- CreateIndex
CREATE INDEX "ProductModifierOption_groupId_idx" ON "ProductModifierOption"("groupId");

-- CreateIndex
CREATE INDEX "ProductModifierOption_tenantId_idx" ON "ProductModifierOption"("tenantId");

-- CreateIndex
CREATE INDEX "VariantCatalogTemplate_category_idx" ON "VariantCatalogTemplate"("category");

-- CreateIndex
CREATE INDEX "VariantCatalogTemplate_isPublished_idx" ON "VariantCatalogTemplate"("isPublished");

-- CreateIndex
CREATE INDEX "VariantCatalogOption_templateId_idx" ON "VariantCatalogOption"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_tenantId_createdAt_idx" ON "Customer"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE INDEX "idx_loyalty_tx_customer_created_desc" ON "LoyaltyTransaction"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_loyalty_tx_tenant_created_desc" ON "LoyaltyTransaction"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_reason_idx" ON "LoyaltyTransaction"("tenantId", "reason");

-- CreateIndex
CREATE INDEX "SavedCart_tenantId_idx" ON "SavedCart"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCart_customerPhone_tenantId_key" ON "SavedCart"("customerPhone", "tenantId");

-- CreateIndex
CREATE INDEX "SavedLocation_customerPhone_idx" ON "SavedLocation"("customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerPhone_idx" ON "Order"("tenantId", "customerPhone");

-- CreateIndex
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("tenantId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "Order_driverId_idx" ON "Order"("driverId");

-- CreateIndex
CREATE INDEX "Order_paymentApprovalId_idx" ON "Order"("paymentApprovalId");

-- CreateIndex
CREATE INDEX "Order_source_deletedAt_createdAt_idx" ON "Order"("source", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_productId_idx" ON "Review"("productId");

-- CreateIndex
CREATE INDEX "Review_storeId_idx" ON "Review"("storeId");

-- CreateIndex
CREATE INDEX "Review_storeId_status_date_idx" ON "Review"("storeId", "status", "date" DESC);

-- CreateIndex
CREATE INDEX "Review_productId_status_date_idx" ON "Review"("productId", "status", "date" DESC);

-- CreateIndex
CREATE INDEX "Review_tenantId_verified_idx" ON "Review"("tenantId", "verified");

-- CreateIndex
CREATE INDEX "Review_orderId_idx" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_tenantId_productId_status_deletedAt_idx" ON "Review"("tenantId", "productId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "ReviewVote_tenantId_idx" ON "ReviewVote"("tenantId");

-- CreateIndex
CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewVote_customerPhone_idx" ON "ReviewVote"("customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_reviewId_customerPhone_key" ON "ReviewVote"("reviewId", "customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_tenantId_key" ON "Settings"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_estado_idx" ON "Supplier"("estado");

-- CreateIndex
CREATE INDEX "Supplier_ruc_idx" ON "Supplier"("ruc");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_status_idx" ON "PurchaseOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseOrderId_idx" ON "PurchaseItem"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Sale_customerPhone_idx" ON "Sale"("customerPhone");

-- CreateIndex
CREATE INDEX "Sale_cashierId_idx" ON "Sale"("cashierId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_idx" ON "Sale"("tenantId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_createdAt_idx" ON "Sale"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_tenantId_customerPhone_idx" ON "Sale"("tenantId", "customerPhone");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_idx" ON "Promotion"("tenantId");

-- CreateIndex
CREATE INDEX "Payable_supplierId_idx" ON "Payable"("supplierId");

-- CreateIndex
CREATE INDEX "Payable_tenantId_idx" ON "Payable"("tenantId");

-- CreateIndex
CREATE INDEX "Payable_dueDate_idx" ON "Payable"("dueDate");

-- CreateIndex
CREATE INDEX "Payable_tenantId_status_idx" ON "Payable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payment_payableId_idx" ON "Payment"("payableId");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");

-- CreateIndex
CREATE INDEX "CashMovement_cashRegisterId_idx" ON "CashMovement"("cashRegisterId");

-- CreateIndex
CREATE INDEX "CashMovement_saleId_idx" ON "CashMovement"("saleId");

-- CreateIndex
CREATE INDEX "CashMovement_cashRegisterId_createdAt_idx" ON "CashMovement"("cashRegisterId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_idx" ON "InventoryMovement"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryMovement_warehouseId_idx" ON "InventoryMovement"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_createdAt_idx" ON "InventoryMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Coupon_tenantId_idx" ON "Coupon"("tenantId");

-- CreateIndex
CREATE INDEX "Coupon_storeId_code_idx" ON "Coupon"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_tenantId_code_key" ON "Coupon"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Return_tenantId_idx" ON "Return"("tenantId");

-- CreateIndex
CREATE INDEX "Return_saleId_idx" ON "Return"("saleId");

-- CreateIndex
CREATE INDEX "Return_orderId_idx" ON "Return"("orderId");

-- CreateIndex
CREATE INDEX "Return_tenantId_createdAt_idx" ON "Return"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ShoppingList_customerPhone_idx" ON "ShoppingList"("customerPhone");

-- CreateIndex
CREATE INDEX "ShoppingList_tenantId_idx" ON "ShoppingList"("tenantId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_shoppingListId_idx" ON "ShoppingListItem"("shoppingListId");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_idx" ON "PriceHistory"("productId");

-- CreateIndex
CREATE INDEX "PriceHistory_changedAt_idx" ON "PriceHistory"("changedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_idx" ON "PriceHistory"("tenantId");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_productId_changedAt_idx" ON "PriceHistory"("tenantId", "productId", "changedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySlot_orderId_key" ON "DeliverySlot"("orderId");

-- CreateIndex
CREATE INDEX "DeliverySlot_tenantId_idx" ON "DeliverySlot"("tenantId");

-- CreateIndex
CREATE INDEX "AdminMessage_tenantId_idx" ON "AdminMessage"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierEvaluation_supplierId_idx" ON "SupplierEvaluation"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierEvaluation_tenantId_idx" ON "SupplierEvaluation"("tenantId");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE INDEX "Bundle_tenantId_idx" ON "Bundle"("tenantId");

-- CreateIndex
CREATE INDEX "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");

-- CreateIndex
CREATE INDEX "ActivityLog_entity_idx" ON "ActivityLog"("entity");

-- CreateIndex
CREATE INDEX "ActivityLog_user_idx" ON "ActivityLog"("user");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_idx" ON "ActivityLog"("tenantId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_createdAt_idx" ON "ActivityLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_phone_idx" ON "PushSubscription"("phone");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_idx" ON "PushSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "AdminUser_tenantId_idx" ON "AdminUser"("tenantId");

-- CreateIndex
CREATE INDEX "AdminUser_totpEnabledAt_idx" ON "AdminUser"("totpEnabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_tenantId_username_key" ON "AdminUser"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "SuperadminUser_username_key" ON "SuperadminUser"("username");

-- CreateIndex
CREATE INDEX "SuperadminUser_username_idx" ON "SuperadminUser"("username");

-- CreateIndex
CREATE INDEX "NotificationLog_type_idx" ON "NotificationLog"("type");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_tenantId_idx" ON "NotificationLog"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationLog_tenantId_createdAt_idx" ON "NotificationLog"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerNotification_customerPhone_idx" ON "CustomerNotification"("customerPhone");

-- CreateIndex
CREATE INDEX "CustomerNotification_createdAt_idx" ON "CustomerNotification"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerNotification_tenantId_idx" ON "CustomerNotification"("tenantId");

-- CreateIndex
CREATE INDEX "PageHero_tenantId_pageSlug_idx" ON "PageHero"("tenantId", "pageSlug");

-- CreateIndex
CREATE UNIQUE INDEX "PageHero_tenantId_pageSlug_sortOrder_key" ON "PageHero"("tenantId", "pageSlug", "sortOrder");

-- CreateIndex
CREATE INDEX "Page_slug_idx" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_status_idx" ON "Page"("status");

-- CreateIndex
CREATE INDEX "Page_publishedAt_idx" ON "Page"("publishedAt");

-- CreateIndex
CREATE INDEX "Page_tenantId_idx" ON "Page"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_tenantId_slug_key" ON "Page"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "PageBlock_pageId_order_idx" ON "PageBlock"("pageId", "order");

-- CreateIndex
CREATE INDEX "PageBlock_type_idx" ON "PageBlock"("type");

-- CreateIndex
CREATE INDEX "BlockTemplate_type_idx" ON "BlockTemplate"("type");

-- CreateIndex
CREATE INDEX "BlockTemplate_category_idx" ON "BlockTemplate"("category");

-- CreateIndex
CREATE INDEX "BlockTemplate_tenantId_idx" ON "BlockTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "Media_folder_idx" ON "Media"("folder");

-- CreateIndex
CREATE INDEX "Media_mimeType_idx" ON "Media"("mimeType");

-- CreateIndex
CREATE INDEX "Media_tenantId_idx" ON "Media"("tenantId");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_createdAt_idx" ON "PageVersion"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeSettings_tenantId_key" ON "ThemeSettings"("tenantId");

-- CreateIndex
CREATE INDEX "ThemeSettings_tenantId_idx" ON "ThemeSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Navigation_tenantId_key" ON "Navigation"("tenantId");

-- CreateIndex
CREATE INDEX "Navigation_tenantId_idx" ON "Navigation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantWhatsAppConfig_tenantId_key" ON "TenantWhatsAppConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantWhatsAppConfig_phoneNumberId_idx" ON "TenantWhatsAppConfig"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_tenantId_idx" ON "WhatsAppConversation"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_expiresAt_idx" ON "WhatsAppConversation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_phone_key" ON "WhatsAppConversation"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookQueue_stripeId_key" ON "StripeWebhookQueue"("stripeId");

-- CreateIndex
CREATE INDEX "StripeWebhookQueue_processedAt_idx" ON "StripeWebhookQueue"("processedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookQueue_nextRetryAt_idx" ON "StripeWebhookQueue"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "MpPendingPlan_preferenceId_key" ON "MpPendingPlan"("preferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "MpPendingPlan_preapprovalId_key" ON "MpPendingPlan"("preapprovalId");

-- CreateIndex
CREATE INDEX "MpPendingPlan_tenantSlug_idx" ON "MpPendingPlan"("tenantSlug");

-- CreateIndex
CREATE INDEX "MpPendingPlan_externalRef_idx" ON "MpPendingPlan"("externalRef");

-- CreateIndex
CREATE INDEX "Note_tenantId_idx" ON "Note"("tenantId");

-- CreateIndex
CREATE INDEX "MessageTemplate_tenantId_idx" ON "MessageTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "Reminder_tenantId_idx" ON "Reminder"("tenantId");

-- CreateIndex
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");

-- CreateIndex
CREATE INDEX "Reminder_dueDate_idx" ON "Reminder"("dueDate");

-- CreateIndex
CREATE INDEX "Batch_tenantId_idx" ON "Batch"("tenantId");

-- CreateIndex
CREATE INDEX "Batch_expiryDate_idx" ON "Batch"("expiryDate");

-- CreateIndex
CREATE INDEX "Batch_productId_idx" ON "Batch"("productId");

-- CreateIndex
CREATE INDEX "Batch_warehouseId_idx" ON "Batch"("warehouseId");

-- CreateIndex
CREATE INDEX "Batch_tenantId_expiryDate_idx" ON "Batch"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "SavedFilter_tenantId_idx" ON "SavedFilter"("tenantId");

-- CreateIndex
CREATE INDEX "ChatMessage_customerPhone_idx" ON "ChatMessage"("customerPhone");

-- CreateIndex
CREATE INDEX "ChatMessage_read_idx" ON "ChatMessage"("read");

-- CreateIndex
CREATE INDEX "ChatMessage_tenantId_idx" ON "ChatMessage"("tenantId");

-- CreateIndex
CREATE INDEX "ABTest_active_idx" ON "ABTest"("active");

-- CreateIndex
CREATE INDEX "ABTest_tenantId_idx" ON "ABTest"("tenantId");

-- CreateIndex
CREATE INDEX "ABTestEvent_testId_variantId_idx" ON "ABTestEvent"("testId", "variantId");

-- CreateIndex
CREATE INDEX "ABTestEvent_visitorId_idx" ON "ABTestEvent"("visitorId");

-- CreateIndex
CREATE INDEX "ABTestEvent_tenantId_idx" ON "ABTestEvent"("tenantId");

-- CreateIndex
CREATE INDEX "SurveyResponse_customerPhone_idx" ON "SurveyResponse"("customerPhone");

-- CreateIndex
CREATE INDEX "SurveyResponse_type_idx" ON "SurveyResponse"("type");

-- CreateIndex
CREATE INDEX "SurveyResponse_tenantId_idx" ON "SurveyResponse"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_orderId_type_key" ON "SurveyResponse"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_token_key" ON "TenantInvitation"("token");

-- CreateIndex
CREATE INDEX "TenantInvitation_token_idx" ON "TenantInvitation"("token");

-- CreateIndex
CREATE INDEX "TenantInvitation_tenantId_idx" ON "TenantInvitation"("tenantId");

-- CreateIndex
CREATE INDEX "TenantInvitation_email_idx" ON "TenantInvitation"("email");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_tenantId_idx" ON "OrderStatusHistory"("tenantId");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_tenantId_idx" ON "NewsletterSubscriber"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_tenantId_email_key" ON "NewsletterSubscriber"("tenantId", "email");

-- CreateIndex
CREATE INDEX "CronDeadLetter_jobName_createdAt_idx" ON "CronDeadLetter"("jobName", "createdAt");

-- CreateIndex
CREATE INDEX "CronHealthLog_jobName_createdAt_idx" ON "CronHealthLog"("jobName", "createdAt");

-- CreateIndex
CREATE INDEX "CronHealthLog_createdAt_idx" ON "CronHealthLog"("createdAt");

-- CreateIndex
CREATE INDEX "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_tenantId_code_key" ON "Warehouse"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Transfer_tenantId_idx" ON "Transfer"("tenantId");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE INDEX "Transfer_fromWarehouseId_idx" ON "Transfer"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "Transfer_toWarehouseId_idx" ON "Transfer"("toWarehouseId");

-- CreateIndex
CREATE INDEX "Transfer_productId_idx" ON "Transfer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_tenantId_code_key" ON "Transfer"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE INDEX "Location_warehouseId_idx" ON "Location"("warehouseId");

-- CreateIndex
CREATE INDEX "Location_productId_idx" ON "Location"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_code_key" ON "Location"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "VisitorWelcome_tenantId_idx" ON "VisitorWelcome"("tenantId");

-- CreateIndex
CREATE INDEX "VisitorWelcome_createdAt_idx" ON "VisitorWelcome"("createdAt");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_idx" ON "CommissionRule"("tenantId");

-- CreateIndex
CREATE INDEX "CommissionRule_cashierId_idx" ON "CommissionRule"("cashierId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRule_tenantId_cashierId_minSales_key" ON "CommissionRule"("tenantId", "cashierId", "minSales");

-- CreateIndex
CREATE INDEX "DailySummary_tenantId_fecha_idx" ON "DailySummary"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "DailySummary_tenantId_idx" ON "DailySummary"("tenantId");

-- CreateIndex
CREATE INDEX "Fiado_tenantId_status_idx" ON "Fiado"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Fiado_customerId_idx" ON "Fiado"("customerId");

-- CreateIndex
CREATE INDEX "FiadoCuota_fiadoId_idx" ON "FiadoCuota"("fiadoId");

-- CreateIndex
CREATE INDEX "Turno_tenantId_status_idx" ON "Turno"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Turno_adminUserId_idx" ON "Turno"("adminUserId");

-- CreateIndex
CREATE INDEX "Turno_cashRegisterId_idx" ON "Turno"("cashRegisterId");

-- CreateIndex
CREATE INDEX "Receta_tenantId_idx" ON "Receta"("tenantId");

-- CreateIndex
CREATE INDEX "RecetaIngrediente_recetaId_idx" ON "RecetaIngrediente"("recetaId");

-- CreateIndex
CREATE INDEX "ProduccionLote_tenantId_idx" ON "ProduccionLote"("tenantId");

-- CreateIndex
CREATE INDEX "ProduccionLote_recetaId_idx" ON "ProduccionLote"("recetaId");

-- CreateIndex
CREATE INDEX "Prestamo_tenantId_status_idx" ON "Prestamo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Prestamo_tenantId_tipo_idx" ON "Prestamo"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "Prestamo_tenantId_direccion_idx" ON "Prestamo"("tenantId", "direccion");

-- CreateIndex
CREATE INDEX "Prestamo_customerId_idx" ON "Prestamo"("customerId");

-- CreateIndex
CREATE INDEX "PrestamoCuota_prestamoId_idx" ON "PrestamoCuota"("prestamoId");

-- CreateIndex
CREATE INDEX "PrestamoCuota_fechaVence_idx" ON "PrestamoCuota"("fechaVence");

-- CreateIndex
CREATE INDEX "PrestamoDocumento_prestamoId_idx" ON "PrestamoDocumento"("prestamoId");

-- CreateIndex
CREATE INDEX "TreasuryCuenta_tenantId_activa_idx" ON "TreasuryCuenta"("tenantId", "activa");

-- CreateIndex
CREATE INDEX "TreasuryCuenta_tenantId_tipo_idx" ON "TreasuryCuenta"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "TreasuryMovimiento_tenantId_createdAt_idx" ON "TreasuryMovimiento"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TreasuryMovimiento_cuentaId_createdAt_idx" ON "TreasuryMovimiento"("cuentaId", "createdAt");

-- CreateIndex
CREATE INDEX "TreasuryMovimiento_tenantId_origen_idx" ON "TreasuryMovimiento"("tenantId", "origen");

-- CreateIndex
CREATE INDEX "TreasuryTransferencia_tenantId_createdAt_idx" ON "TreasuryTransferencia"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Cotizacion_tenantId_status_idx" ON "Cotizacion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Cotizacion_numero_idx" ON "Cotizacion"("numero");

-- CreateIndex
CREATE INDEX "CotizacionItem_cotizacionId_idx" ON "CotizacionItem"("cotizacionId");

-- CreateIndex
CREATE INDEX "GuiaRemision_tenantId_status_idx" ON "GuiaRemision"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GuiaRemision_numero_idx" ON "GuiaRemision"("numero");

-- CreateIndex
CREATE INDEX "GuiaRemisionItem_guiaId_idx" ON "GuiaRemisionItem"("guiaId");

-- CreateIndex
CREATE INDEX "NotaCredito_tenantId_status_idx" ON "NotaCredito"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NotaCredito_numero_idx" ON "NotaCredito"("numero");

-- CreateIndex
CREATE INDEX "Notification_tenantId_readAt_idx" ON "Notification"("tenantId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ConteoFisico_tenantId_status_idx" ON "ConteoFisico"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ConteoFisicoItem_conteoId_idx" ON "ConteoFisicoItem"("conteoId");

-- CreateIndex
CREATE INDEX "DiscountRule_tenantId_idx" ON "DiscountRule"("tenantId");

-- CreateIndex
CREATE INDEX "DiscountRule_activa_tenantId_idx" ON "DiscountRule"("activa", "tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturn_tenantId_idx" ON "SupplierReturn"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturn_estado_tenantId_idx" ON "SupplierReturn"("estado", "tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_returnId_idx" ON "SupplierReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ComplianceItem_tenantId_idx" ON "ComplianceItem"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceItem_status_tenantId_idx" ON "ComplianceItem"("status", "tenantId");

-- CreateIndex
CREATE INDEX "ComplianceItem_nextDue_tenantId_idx" ON "ComplianceItem"("nextDue", "tenantId");

-- CreateIndex
CREATE INDEX "CustomKpi_tenantId_idx" ON "CustomKpi"("tenantId");

-- CreateIndex
CREATE INDEX "CustomKpi_category_tenantId_idx" ON "CustomKpi"("category", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_tenantId_idx" ON "Store"("tenantId");

-- CreateIndex
CREATE INDEX "Store_isPublished_rating_reviewCount_idx" ON "Store"("isPublished", "rating" DESC, "reviewCount" DESC);

-- CreateIndex
CREATE INDEX "Store_isPublished_zone_idx" ON "Store"("isPublished", "zone");

-- CreateIndex
CREATE INDEX "StoreBanner_storeId_idx" ON "StoreBanner"("storeId");

-- CreateIndex
CREATE INDEX "StoreBanner_tenantId_idx" ON "StoreBanner"("tenantId");

-- CreateIndex
CREATE INDEX "StoreBanner_storeId_section_position_idx" ON "StoreBanner"("storeId", "section", "position");

-- CreateIndex
CREATE INDEX "StoreProduct_storeId_idx" ON "StoreProduct"("storeId");

-- CreateIndex
CREATE INDEX "StoreProduct_productId_idx" ON "StoreProduct"("productId");

-- CreateIndex
CREATE INDEX "StoreProduct_discountUntil_idx" ON "StoreProduct"("discountUntil");

-- CreateIndex
CREATE INDEX "StoreProduct_storeId_isActive_idx" ON "StoreProduct"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProduct_storeId_productId_key" ON "StoreProduct"("storeId", "productId");

-- CreateIndex
CREATE INDEX "DeliveryPartner_tenantId_idx" ON "DeliveryPartner"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryPartner_tenantId_isOnline_currentOrderId_idx" ON "DeliveryPartner"("tenantId", "isOnline", "currentOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOffer_orderId_status_idx" ON "DeliveryOffer"("orderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_partnerId_status_idx" ON "DeliveryOffer"("partnerId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOffer_status_expiresAt_idx" ON "DeliveryOffer"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "DeliveryOffer_tenantId_idx" ON "DeliveryOffer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAssignment_orderId_key" ON "DeliveryAssignment"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_orderId_idx" ON "DeliveryAssignment"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_partnerId_idx" ON "DeliveryAssignment"("partnerId");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_tenantId_idx" ON "DeliveryAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "DeliverySOSAlert_partnerId_idx" ON "DeliverySOSAlert"("partnerId");

-- CreateIndex
CREATE INDEX "DeliverySOSAlert_status_idx" ON "DeliverySOSAlert"("status");

-- CreateIndex
CREATE INDEX "DeliveryTracking_tenantId_idx" ON "DeliveryTracking"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryTracking_orderId_idx" ON "DeliveryTracking"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryTracking_orderId_createdAt_idx" ON "DeliveryTracking"("orderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryTracking_tenantId_status_idx" ON "DeliveryTracking"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryRoute_tenantId_idx" ON "DeliveryRoute"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryRoute_storeId_idx" ON "DeliveryRoute"("storeId");

-- CreateIndex
CREATE INDEX "DeliveryRoute_driverId_idx" ON "DeliveryRoute"("driverId");

-- CreateIndex
CREATE INDEX "DeliveryRoute_storeId_status_idx" ON "DeliveryRoute"("storeId", "status");

-- CreateIndex
CREATE INDEX "DeliveryRoute_tenantId_plannedStartAt_idx" ON "DeliveryRoute"("tenantId", "plannedStartAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryRouteStop_tenantId_idx" ON "DeliveryRouteStop"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryRouteStop_routeId_idx" ON "DeliveryRouteStop"("routeId");

-- CreateIndex
CREATE INDEX "DeliveryRouteStop_orderId_idx" ON "DeliveryRouteStop"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryRouteStop_routeId_status_idx" ON "DeliveryRouteStop"("routeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRouteStop_routeId_sequence_key" ON "DeliveryRouteStop"("routeId", "sequence");

-- CreateIndex
CREATE INDEX "ConversationThread_tenantId_idx" ON "ConversationThread"("tenantId");

-- CreateIndex
CREATE INDEX "ConversationThread_storeId_idx" ON "ConversationThread"("storeId");

-- CreateIndex
CREATE INDEX "ConversationThread_tenantId_status_idx" ON "ConversationThread"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ConversationThread_tenantId_lastMessageAt_idx" ON "ConversationThread"("tenantId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationThread_customerPhone_idx" ON "ConversationThread"("customerPhone");

-- CreateIndex
CREATE INDEX "ConversationThread_orderId_idx" ON "ConversationThread"("orderId");

-- CreateIndex
CREATE INDEX "ConversationMessage_tenantId_idx" ON "ConversationMessage"("tenantId");

-- CreateIndex
CREATE INDEX "ConversationMessage_threadId_idx" ON "ConversationMessage"("threadId");

-- CreateIndex
CREATE INDEX "ConversationMessage_threadId_createdAt_idx" ON "ConversationMessage"("threadId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationMessage_senderType_idx" ON "ConversationMessage"("senderType");

-- CreateIndex
CREATE INDEX "WholesaleOrder_buyerTenantId_idx" ON "WholesaleOrder"("buyerTenantId");

-- CreateIndex
CREATE INDEX "WholesaleOrder_sellerTenantId_idx" ON "WholesaleOrder"("sellerTenantId");

-- CreateIndex
CREATE INDEX "WholesaleOrder_tenantId_idx" ON "WholesaleOrder"("tenantId");

-- CreateIndex
CREATE INDEX "WholesaleOrderItem_wholesaleOrderId_idx" ON "WholesaleOrderItem"("wholesaleOrderId");

-- CreateIndex
CREATE INDEX "WholesaleOrderItem_productId_idx" ON "WholesaleOrderItem"("productId");

-- CreateIndex
CREATE INDEX "StorePermission_storeId_idx" ON "StorePermission"("storeId");

-- CreateIndex
CREATE INDEX "StorePermission_userId_idx" ON "StorePermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StorePermission_storeId_userId_userType_key" ON "StorePermission"("storeId", "userId", "userType");

-- CreateIndex
CREATE INDEX "CommissionLedger_orderId_idx" ON "CommissionLedger"("orderId");

-- CreateIndex
CREATE INDEX "CommissionLedger_storeId_idx" ON "CommissionLedger"("storeId");

-- CreateIndex
CREATE INDEX "CommissionLedger_status_idx" ON "CommissionLedger"("status");

-- CreateIndex
CREATE INDEX "CommissionLedger_tenantId_idx" ON "CommissionLedger"("tenantId");

-- CreateIndex
CREATE INDEX "CommissionLedger_tenantId_status_idx" ON "CommissionLedger"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPortal_supplierId_key" ON "SupplierPortal"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPortal_apiKey_key" ON "SupplierPortal"("apiKey");

-- CreateIndex
CREATE INDEX "SupplierPortal_apiKey_idx" ON "SupplierPortal"("apiKey");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_createdAt_idx" ON "SupportTicket"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSunatConfig_tenantId_key" ON "TenantSunatConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSunatConfig_tenantId_idx" ON "TenantSunatConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SunatInvoice_tenantId_idx" ON "SunatInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "SunatInvoice_tenantId_type_series_number_idx" ON "SunatInvoice"("tenantId", "type", "series", "number");

-- CreateIndex
CREATE INDEX "SunatInvoice_orderId_idx" ON "SunatInvoice"("orderId");

-- CreateIndex
CREATE INDEX "SunatInvoice_sunatStatus_idx" ON "SunatInvoice"("sunatStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SunatInvoice_tenantId_series_number_key" ON "SunatInvoice"("tenantId", "series", "number");

-- CreateIndex
CREATE INDEX "TenantHealthScore_tenantId_idx" ON "TenantHealthScore"("tenantId");

-- CreateIndex
CREATE INDEX "TenantHealthScore_riskLevel_idx" ON "TenantHealthScore"("riskLevel");

-- CreateIndex
CREATE INDEX "TenantHealthScore_calculatedAt_idx" ON "TenantHealthScore"("calculatedAt");

-- CreateIndex
CREATE INDEX "ChurnSignal_tenantId_idx" ON "ChurnSignal"("tenantId");

-- CreateIndex
CREATE INDEX "ChurnSignal_severity_resolved_idx" ON "ChurnSignal"("severity", "resolved");

-- CreateIndex
CREATE INDEX "ChurnSignal_createdAt_idx" ON "ChurnSignal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurnPlaybook_name_key" ON "ChurnPlaybook"("name");

-- CreateIndex
CREATE INDEX "CreditProfile_tenantId_idx" ON "CreditProfile"("tenantId");

-- CreateIndex
CREATE INDEX "CreditProfile_creditScore_idx" ON "CreditProfile"("creditScore");

-- CreateIndex
CREATE UNIQUE INDEX "CreditProfile_tenantId_customerId_key" ON "CreditProfile"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CreditInstallment_tenantId_idx" ON "CreditInstallment"("tenantId");

-- CreateIndex
CREATE INDEX "CreditInstallment_creditProfileId_idx" ON "CreditInstallment"("creditProfileId");

-- CreateIndex
CREATE INDEX "CreditInstallment_status_nextDueDate_idx" ON "CreditInstallment"("status", "nextDueDate");

-- CreateIndex
CREATE INDEX "CreditScoreHistory_tenantId_customerId_idx" ON "CreditScoreHistory"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CreditScoreHistory_creditProfileId_createdAt_idx" ON "CreditScoreHistory"("creditProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditScoreHistory_createdAt_idx" ON "CreditScoreHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReminder_idempotencyKey_key" ON "CreditReminder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditReminder_tenantId_idx" ON "CreditReminder"("tenantId");

-- CreateIndex
CREATE INDEX "CreditReminder_fiadoId_idx" ON "CreditReminder"("fiadoId");

-- CreateIndex
CREATE INDEX "CreditReminder_customerId_idx" ON "CreditReminder"("customerId");

-- CreateIndex
CREATE INDEX "CreditReminder_sentAt_idx" ON "CreditReminder"("sentAt");

-- CreateIndex
CREATE INDEX "ForecastLog_tenantId_productId_idx" ON "ForecastLog"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ForecastLog_forecastDate_idx" ON "ForecastLog"("forecastDate");

-- CreateIndex
CREATE INDEX "SupplierPriceVersion_supplierId_idx" ON "SupplierPriceVersion"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPriceVersion_effectiveDate_idx" ON "SupplierPriceVersion"("effectiveDate");

-- CreateIndex
CREATE INDEX "SupplierPriceVersion_tenantId_idx" ON "SupplierPriceVersion"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierRating_supplierId_idx" ON "SupplierRating"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRating_tenantId_supplierId_period_key" ON "SupplierRating"("tenantId", "supplierId", "period");

-- CreateIndex
CREATE INDEX "SupplierOffer_supplierId_idx" ON "SupplierOffer"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierOffer_validUntil_idx" ON "SupplierOffer"("validUntil");

-- CreateIndex
CREATE INDEX "SupplierOffer_tenantId_idx" ON "SupplierOffer"("tenantId");

-- CreateIndex
CREATE INDEX "AIConversation_tenantId_idx" ON "AIConversation"("tenantId");

-- CreateIndex
CREATE INDEX "AIConversation_user_idx" ON "AIConversation"("user");

-- CreateIndex
CREATE INDEX "AIConversation_channel_idx" ON "AIConversation"("channel");

-- CreateIndex
CREATE INDEX "AIConversation_updatedAt_idx" ON "AIConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AIMessage_role_idx" ON "AIMessage"("role");

-- CreateIndex
CREATE INDEX "AIMessage_createdAt_idx" ON "AIMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ProductAnalytics_tenantId_idx" ON "ProductAnalytics"("tenantId");

-- CreateIndex
CREATE INDEX "ProductAnalytics_productId_idx" ON "ProductAnalytics"("productId");

-- CreateIndex
CREATE INDEX "ProductAnalytics_tenantId_date_idx" ON "ProductAnalytics"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAnalytics_productId_date_tenantId_key" ON "ProductAnalytics"("productId", "date", "tenantId");

-- CreateIndex
CREATE INDEX "StockoutPrediction_tenantId_idx" ON "StockoutPrediction"("tenantId");

-- CreateIndex
CREATE INDEX "StockoutPrediction_storeId_idx" ON "StockoutPrediction"("storeId");

-- CreateIndex
CREATE INDEX "StockoutPrediction_storeId_severity_idx" ON "StockoutPrediction"("storeId", "severity");

-- CreateIndex
CREATE INDEX "StockoutPrediction_expiresAt_idx" ON "StockoutPrediction"("expiresAt");

-- CreateIndex
CREATE INDEX "SalesAnomaly_tenantId_idx" ON "SalesAnomaly"("tenantId");

-- CreateIndex
CREATE INDEX "SalesAnomaly_storeId_idx" ON "SalesAnomaly"("storeId");

-- CreateIndex
CREATE INDEX "SalesAnomaly_storeId_date_idx" ON "SalesAnomaly"("storeId", "date");

-- CreateIndex
CREATE INDEX "SalesAnomaly_severity_idx" ON "SalesAnomaly"("severity");

-- CreateIndex
CREATE INDEX "SponsoredBoost_tenantId_idx" ON "SponsoredBoost"("tenantId");

-- CreateIndex
CREATE INDEX "SponsoredBoost_storeId_idx" ON "SponsoredBoost"("storeId");

-- CreateIndex
CREATE INDEX "SponsoredBoost_productId_idx" ON "SponsoredBoost"("productId");

-- CreateIndex
CREATE INDEX "SponsoredBoost_status_idx" ON "SponsoredBoost"("status");

-- CreateIndex
CREATE INDEX "SponsoredBoost_status_endDate_idx" ON "SponsoredBoost"("status", "endDate");

-- CreateIndex
CREATE INDEX "SearchSuggestion_tenantId_idx" ON "SearchSuggestion"("tenantId");

-- CreateIndex
CREATE INDEX "SearchSuggestion_tenantId_normalizedQuery_idx" ON "SearchSuggestion"("tenantId", "normalizedQuery");

-- CreateIndex
CREATE INDEX "SearchSuggestion_lastSearchedAt_idx" ON "SearchSuggestion"("lastSearchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSuggestion_tenantId_normalizedQuery_key" ON "SearchSuggestion"("tenantId", "normalizedQuery");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItemStatus_itemId_key" ON "RoadmapItemStatus"("itemId");

-- CreateIndex
CREATE INDEX "RoadmapItemStatus_status_idx" ON "RoadmapItemStatus"("status");

-- CreateIndex
CREATE INDEX "RoadmapItemStatus_updatedAt_idx" ON "RoadmapItemStatus"("updatedAt");

-- CreateIndex
CREATE INDEX "TenantFeatureFlag_tenantId_idx" ON "TenantFeatureFlag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeatureFlag_tenantId_flagKey_key" ON "TenantFeatureFlag"("tenantId", "flagKey");

-- CreateIndex
CREATE INDEX "MarketplaceAbandonedCart_storeSlug_idx" ON "MarketplaceAbandonedCart"("storeSlug");

-- CreateIndex
CREATE INDEX "MarketplaceAbandonedCart_customerPhone_idx" ON "MarketplaceAbandonedCart"("customerPhone");

-- CreateIndex
CREATE INDEX "MarketplaceAbandonedCart_recovered_reminderSentAt_createdAt_idx" ON "MarketplaceAbandonedCart"("recovered", "reminderSentAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantStorePage_tenantId_key" ON "TenantStorePage"("tenantId");

-- CreateIndex
CREATE INDEX "TenantStorePage_tenantId_idx" ON "TenantStorePage"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPageProductOverride_tenantId_idx" ON "TenantPageProductOverride"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPageProductOverride_tenantId_visible_featured_idx" ON "TenantPageProductOverride"("tenantId", "visible", "featured");

-- CreateIndex
CREATE INDEX "TenantPageProductOverride_productId_idx" ON "TenantPageProductOverride"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPageProductOverride_tenantId_productId_key" ON "TenantPageProductOverride"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "TenantPagePromotion_tenantId_idx" ON "TenantPagePromotion"("tenantId");

-- CreateIndex
CREATE INDEX "TenantPagePromotion_tenantId_active_startAt_endAt_idx" ON "TenantPagePromotion"("tenantId", "active", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "TenantPageVisit_tenantId_visitedAt_idx" ON "TenantPageVisit"("tenantId", "visitedAt");

-- CreateIndex
CREATE INDEX "TenantPageVisit_tenantId_converted_idx" ON "TenantPageVisit"("tenantId", "converted");

-- CreateIndex
CREATE INDEX "TenantPageVisit_sessionId_idx" ON "TenantPageVisit"("sessionId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_userId_status_idx" ON "subscriptions"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_nextDeliveryAt_status_idx" ON "subscriptions"("tenantId", "nextDeliveryAt", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_status_idx" ON "subscriptions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "subscription_deliveries_tenantId_subscriptionId_idx" ON "subscription_deliveries"("tenantId", "subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_deliveries_tenantId_scheduledFor_idx" ON "subscription_deliveries"("tenantId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_codeHash_key" ON "gift_cards"("codeHash");

-- CreateIndex
CREATE INDEX "gift_cards_tenantId_recipientUserId_status_idx" ON "gift_cards"("tenantId", "recipientUserId", "status");

-- CreateIndex
CREATE INDEX "gift_cards_tenantId_senderUserId_idx" ON "gift_cards"("tenantId", "senderUserId");

-- CreateIndex
CREATE INDEX "gift_cards_tenantId_status_idx" ON "gift_cards"("tenantId", "status");

-- CreateIndex
CREATE INDEX "gift_cards_codeHash_idx" ON "gift_cards"("codeHash");

-- CreateIndex
CREATE INDEX "gift_card_redemptions_tenantId_giftCardId_idx" ON "gift_card_redemptions"("tenantId", "giftCardId");

-- CreateIndex
CREATE INDEX "gift_card_redemptions_tenantId_userId_idx" ON "gift_card_redemptions"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "gift_card_redemptions_tenantId_redeemedAt_idx" ON "gift_card_redemptions"("tenantId", "redeemedAt");

-- CreateIndex
CREATE INDEX "socio_memberships_tenantId_status_idx" ON "socio_memberships"("tenantId", "status");

-- CreateIndex
CREATE INDEX "socio_memberships_tenantId_currentPeriodEnd_status_idx" ON "socio_memberships"("tenantId", "currentPeriodEnd", "status");

-- CreateIndex
CREATE INDEX "socio_memberships_tenantId_cancelAtPeriodEnd_idx" ON "socio_memberships"("tenantId", "cancelAtPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "socio_memberships_tenantId_userId_key" ON "socio_memberships"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "socio_billing_cycles_tenantId_membershipId_idx" ON "socio_billing_cycles"("tenantId", "membershipId");

-- CreateIndex
CREATE INDEX "socio_billing_cycles_tenantId_periodEnd_status_idx" ON "socio_billing_cycles"("tenantId", "periodEnd", "status");

-- CreateIndex
CREATE INDEX "socio_cashback_entries_tenantId_userId_createdAt_idx" ON "socio_cashback_entries"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "socio_cashback_entries_tenantId_membershipId_type_idx" ON "socio_cashback_entries"("tenantId", "membershipId", "type");

-- CreateIndex
CREATE INDEX "socio_cashback_entries_tenantId_orderId_idx" ON "socio_cashback_entries"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_ruc_key" ON "vendor_applications"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_tenantId_key" ON "vendor_applications"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_tenantSlug_key" ON "vendor_applications"("tenantSlug");

-- CreateIndex
CREATE INDEX "vendor_applications_status_submittedAt_idx" ON "vendor_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "vendor_applications_district_status_idx" ON "vendor_applications"("district", "status");

-- CreateIndex
CREATE INDEX "vendor_applications_contactEmail_idx" ON "vendor_applications"("contactEmail");

-- CreateIndex
CREATE INDEX "vendor_application_reviews_applicationId_createdAt_idx" ON "vendor_application_reviews"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "vendor_application_reviews_reviewerUserId_idx" ON "vendor_application_reviews"("reviewerUserId");

-- CreateIndex
CREATE INDEX "live_sessions_tenantId_status_scheduledFor_idx" ON "live_sessions"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "live_sessions_status_scheduledFor_idx" ON "live_sessions"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "live_sessions_tenantId_endedAt_idx" ON "live_sessions"("tenantId", "endedAt");

-- CreateIndex
CREATE INDEX "live_products_tenantId_liveSessionId_featuredOrder_idx" ON "live_products"("tenantId", "liveSessionId", "featuredOrder");

-- CreateIndex
CREATE UNIQUE INDEX "live_products_liveSessionId_productId_key" ON "live_products"("liveSessionId", "productId");

-- CreateIndex
CREATE INDEX "live_chat_messages_liveSessionId_createdAt_idx" ON "live_chat_messages"("liveSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "live_chat_messages_tenantId_moderationState_idx" ON "live_chat_messages"("tenantId", "moderationState");

-- CreateIndex
CREATE INDEX "live_viewer_events_liveSessionId_eventType_createdAt_idx" ON "live_viewer_events"("liveSessionId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "live_viewer_events_tenantId_createdAt_idx" ON "live_viewer_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentApproval_status_idx" ON "PaymentApproval"("status");

-- CreateIndex
CREATE INDEX "PaymentApproval_conversationId_idx" ON "PaymentApproval"("conversationId");

-- CreateIndex
CREATE INDEX "PaymentApproval_tenantId_idx" ON "PaymentApproval"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentApproval_tenantId_status_idx" ON "PaymentApproval"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EventDeadLetter_tenantId_resolvedAt_idx" ON "EventDeadLetter"("tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "EventDeadLetter_eventType_resolvedAt_idx" ON "EventDeadLetter"("eventType", "resolvedAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_folderId_deletedAt_idx" ON "Document"("tenantId", "folderId", "deletedAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_category_idx" ON "Document"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Document_tenantId_favorite_idx" ON "Document"("tenantId", "favorite");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedAt_idx" ON "Document"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_expiresAt_idx" ON "Document"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "DocumentFolder_tenantId_parentId_idx" ON "DocumentFolder"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_token_key" ON "DocumentShare"("token");

-- CreateIndex
CREATE INDEX "DocumentShare_token_idx" ON "DocumentShare"("token");

-- CreateIndex
CREATE INDEX "DocumentShare_tenantId_createdAt_idx" ON "DocumentShare"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAuditLog_tenantId_createdAt_idx" ON "DocumentAuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAuditLog_documentId_createdAt_idx" ON "DocumentAuditLog"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentTemplate_tenantId_idx" ON "DocumentTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_tenantId_key_key" ON "DocumentTemplate"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AdelantoBeneficiario_tenantId_idx" ON "AdelantoBeneficiario"("tenantId");

-- CreateIndex
CREATE INDEX "AdelantoBeneficiario_tenantId_nombre_idx" ON "AdelantoBeneficiario"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "AdelantoRecurrente_tenantId_idx" ON "AdelantoRecurrente"("tenantId");

-- CreateIndex
CREATE INDEX "AdelantoRecurrente_activo_proximaEjecucion_idx" ON "AdelantoRecurrente"("activo", "proximaEjecucion");

-- CreateIndex
CREATE INDEX "Adelanto_tenantId_status_idx" ON "Adelanto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Adelanto_tenantId_fechaAdelanto_idx" ON "Adelanto"("tenantId", "fechaAdelanto");

-- CreateIndex
CREATE INDEX "Adelanto_beneficiarioId_idx" ON "Adelanto"("beneficiarioId");

-- CreateIndex
CREATE INDEX "AdelantoEntrega_adelantoId_idx" ON "AdelantoEntrega"("adelantoId");

-- CreateIndex
CREATE INDEX "AdelantoEntrega_adelantoId_fecha_idx" ON "AdelantoEntrega"("adelantoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AdelantoEntregaPactada_entregaId_key" ON "AdelantoEntregaPactada"("entregaId");

-- CreateIndex
CREATE INDEX "AdelantoEntregaPactada_adelantoId_idx" ON "AdelantoEntregaPactada"("adelantoId");

-- CreateIndex
CREATE INDEX "WoodEntry_tenantId_entryDate_idx" ON "WoodEntry"("tenantId", "entryDate" DESC);

-- CreateIndex
CREATE INDEX "WoodEntry_tenantId_status_idx" ON "WoodEntry"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WoodEntry_tenantId_gtfNumber_idx" ON "WoodEntry"("tenantId", "gtfNumber");

-- CreateIndex
CREATE INDEX "WoodEntry_tenantId_speciesCommonName_idx" ON "WoodEntry"("tenantId", "speciesCommonName");

-- CreateIndex
CREATE INDEX "WoodEntry_deletedAt_idx" ON "WoodEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestLothCaratula_tenantId_isActive_idx" ON "ForestLothCaratula"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ForestLothCaratula_deletedAt_idx" ON "ForestLothCaratula"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestLothEntry_tenantId_section_entryDate_idx" ON "ForestLothEntry"("tenantId", "section", "entryDate" DESC);

-- CreateIndex
CREATE INDEX "ForestLothEntry_tenantId_caratulaId_section_lineNo_idx" ON "ForestLothEntry"("tenantId", "caratulaId", "section", "lineNo");

-- CreateIndex
CREATE INDEX "ForestLothEntry_tenantId_planId_section_idx" ON "ForestLothEntry"("tenantId", "planId", "section");

-- CreateIndex
CREATE INDEX "ForestLothEntry_tenantId_treeCode_idx" ON "ForestLothEntry"("tenantId", "treeCode");

-- CreateIndex
CREATE INDEX "ForestLothEntry_tenantId_trozaCode_idx" ON "ForestLothEntry"("tenantId", "trozaCode");

-- CreateIndex
CREATE INDEX "ForestLothEntry_deletedAt_idx" ON "ForestLothEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestPlan_tenantId_isActive_idx" ON "ForestPlan"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ForestPlan_deletedAt_idx" ON "ForestPlan"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestPlanSpecies_tenantId_planId_idx" ON "ForestPlanSpecies"("tenantId", "planId");

-- CreateIndex
CREATE INDEX "ForestPlanSpecies_deletedAt_idx" ON "ForestPlanSpecies"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestCensusTree_tenantId_planId_idx" ON "ForestCensusTree"("tenantId", "planId");

-- CreateIndex
CREATE INDEX "ForestCensusTree_tenantId_treeCode_idx" ON "ForestCensusTree"("tenantId", "treeCode");

-- CreateIndex
CREATE INDEX "ForestCensusTree_tenantId_estado_idx" ON "ForestCensusTree"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "ForestCensusTree_deletedAt_idx" ON "ForestCensusTree"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestGtf_tenantId_status_idx" ON "ForestGtf"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ForestGtf_tenantId_gtfNumber_idx" ON "ForestGtf"("tenantId", "gtfNumber");

-- CreateIndex
CREATE INDEX "ForestGtf_deletedAt_idx" ON "ForestGtf"("deletedAt");

-- CreateIndex
CREATE INDEX "ForestCtpEntry_tenantId_section_entryDate_idx" ON "ForestCtpEntry"("tenantId", "section", "entryDate" DESC);

-- CreateIndex
CREATE INDEX "ForestCtpEntry_tenantId_gtfNumber_idx" ON "ForestCtpEntry"("tenantId", "gtfNumber");

-- CreateIndex
CREATE INDEX "ForestCtpEntry_deletedAt_idx" ON "ForestCtpEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "CacaoProducer_tenantId_status_idx" ON "CacaoProducer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CacaoProducer_tenantId_nombre_idx" ON "CacaoProducer"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "CacaoProducer_deletedAt_idx" ON "CacaoProducer"("deletedAt");

-- CreateIndex
CREATE INDEX "CacaoLote_tenantId_fecha_idx" ON "CacaoLote"("tenantId", "fecha" DESC);

-- CreateIndex
CREATE INDEX "CacaoLote_tenantId_productorId_idx" ON "CacaoLote"("tenantId", "productorId");

-- CreateIndex
CREATE INDEX "CacaoLote_tenantId_loteCode_idx" ON "CacaoLote"("tenantId", "loteCode");

-- CreateIndex
CREATE INDEX "CacaoLote_deletedAt_idx" ON "CacaoLote"("deletedAt");

-- CreateIndex
CREATE INDEX "CacaoBeneficio_tenantId_estado_idx" ON "CacaoBeneficio"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "CacaoBeneficio_tenantId_loteId_idx" ON "CacaoBeneficio"("tenantId", "loteId");

-- CreateIndex
CREATE INDEX "CacaoBeneficio_deletedAt_idx" ON "CacaoBeneficio"("deletedAt");

-- CreateIndex
CREATE INDEX "CacaoVenta_tenantId_fecha_idx" ON "CacaoVenta"("tenantId", "fecha" DESC);

-- CreateIndex
CREATE INDEX "CacaoVenta_tenantId_status_idx" ON "CacaoVenta"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CacaoVenta_deletedAt_idx" ON "CacaoVenta"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reclamo_numero_key" ON "Reclamo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Reclamo_codigo_key" ON "Reclamo"("codigo");

-- CreateIndex
CREATE INDEX "Reclamo_createdAt_idx" ON "Reclamo"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reclamo_estado_idx" ON "Reclamo"("estado");

-- CreateIndex
CREATE INDEX "Reclamo_email_idx" ON "Reclamo"("email");

-- CreateIndex
CREATE INDEX "Reclamo_tenantId_idx" ON "Reclamo"("tenantId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_active_idx" ON "Asset"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Asset_tenantId_status_idx" ON "Asset"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AssetIncome_tenantId_date_idx" ON "AssetIncome"("tenantId", "date");

-- CreateIndex
CREATE INDEX "AssetIncome_tenantId_paid_idx" ON "AssetIncome"("tenantId", "paid");

-- CreateIndex
CREATE INDEX "AssetIncome_assetId_idx" ON "AssetIncome"("assetId");

-- CreateIndex
CREATE INDEX "AssetExpense_tenantId_date_idx" ON "AssetExpense"("tenantId", "date");

-- CreateIndex
CREATE INDEX "AssetExpense_assetId_category_idx" ON "AssetExpense"("assetId", "category");

-- CreateIndex
CREATE INDEX "AssetMaintenance_tenantId_assetId_idx" ON "AssetMaintenance"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "AssetInspection_tenantId_assetId_idx" ON "AssetInspection"("tenantId", "assetId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierOption" ADD CONSTRAINT "ProductModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantCatalogOption" ADD CONSTRAINT "VariantCatalogOption_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VariantCatalogTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCart" ADD CONSTRAINT "SavedCart_customerPhone_fkey" FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_customerPhone_fkey" FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerPhone_fkey" FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerPhone_fkey" FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNotification" ADD CONSTRAINT "CustomerNotification_customerPhone_fkey" FOREIGN KEY ("customerPhone") REFERENCES "Customer"("phone") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageHero" ADD CONSTRAINT "PageHero_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageBlock" ADD CONSTRAINT "PageBlock_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiadoCuota" ADD CONSTRAINT "FiadoCuota_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "Fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaIngrediente" ADD CONSTRAINT "RecetaIngrediente_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaIngrediente" ADD CONSTRAINT "RecetaIngrediente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestamo" ADD CONSTRAINT "Prestamo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestamo" ADD CONSTRAINT "Prestamo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoCuota" ADD CONSTRAINT "PrestamoCuota_prestamoId_fkey" FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoDocumento" ADD CONSTRAINT "PrestamoDocumento_prestamoId_fkey" FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryCuenta" ADD CONSTRAINT "TreasuryCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryMovimiento" ADD CONSTRAINT "TreasuryMovimiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryMovimiento" ADD CONSTRAINT "TreasuryMovimiento_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "TreasuryCuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "TreasuryCuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "TreasuryCuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemision" ADD CONSTRAINT "GuiaRemision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemision" ADD CONSTRAINT "GuiaRemision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemisionItem" ADD CONSTRAINT "GuiaRemisionItem_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "GuiaRemision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoFisico" ADD CONSTRAINT "ConteoFisico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoFisicoItem" ADD CONSTRAINT "ConteoFisicoItem_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "ConteoFisico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreBanner" ADD CONSTRAINT "StoreBanner_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTracking" ADD CONSTRAINT "DeliveryTracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRouteStop" ADD CONSTRAINT "DeliveryRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRouteStop" ADD CONSTRAINT "DeliveryRouteStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleOrder" ADD CONSTRAINT "WholesaleOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleOrderItem" ADD CONSTRAINT "WholesaleOrderItem_wholesaleOrderId_fkey" FOREIGN KEY ("wholesaleOrderId") REFERENCES "WholesaleOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePermission" ADD CONSTRAINT "StorePermission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPortal" ADD CONSTRAINT "SupplierPortal_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SunatInvoice" ADD CONSTRAINT "SunatInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "TenantSunatConfig"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditInstallment" ADD CONSTRAINT "CreditInstallment_creditProfileId_fkey" FOREIGN KEY ("creditProfileId") REFERENCES "CreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditScoreHistory" ADD CONSTRAINT "CreditScoreHistory_creditProfileId_fkey" FOREIGN KEY ("creditProfileId") REFERENCES "CreditProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastLog" ADD CONSTRAINT "ForecastLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalytics" ADD CONSTRAINT "ProductAnalytics_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockoutPrediction" ADD CONSTRAINT "StockoutPrediction_storeProductId_fkey" FOREIGN KEY ("storeProductId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAnomaly" ADD CONSTRAINT "SalesAnomaly_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredBoost" ADD CONSTRAINT "SponsoredBoost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredBoost" ADD CONSTRAINT "SponsoredBoost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureFlag" ADD CONSTRAINT "TenantFeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantStorePage" ADD CONSTRAINT "TenantStorePage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPageProductOverride" ADD CONSTRAINT "TenantPageProductOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPageProductOverride" ADD CONSTRAINT "TenantPageProductOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPagePromotion" ADD CONSTRAINT "TenantPagePromotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPageVisit" ADD CONSTRAINT "TenantPageVisit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_deliveries" ADD CONSTRAINT "subscription_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socio_billing_cycles" ADD CONSTRAINT "socio_billing_cycles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "socio_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "socio_cashback_entries" ADD CONSTRAINT "socio_cashback_entries_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "socio_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_reviews" ADD CONSTRAINT "vendor_application_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_products" ADD CONSTRAINT "live_products_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_viewer_events" ADD CONSTRAINT "live_viewer_events_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditLog" ADD CONSTRAINT "DocumentAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoBeneficiario" ADD CONSTRAINT "AdelantoBeneficiario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoRecurrente" ADD CONSTRAINT "AdelantoRecurrente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoRecurrente" ADD CONSTRAINT "AdelantoRecurrente_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "AdelantoBeneficiario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adelanto" ADD CONSTRAINT "Adelanto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adelanto" ADD CONSTRAINT "Adelanto_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "AdelantoBeneficiario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoEntrega" ADD CONSTRAINT "AdelantoEntrega_adelantoId_fkey" FOREIGN KEY ("adelantoId") REFERENCES "Adelanto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoEntregaPactada" ADD CONSTRAINT "AdelantoEntregaPactada_adelantoId_fkey" FOREIGN KEY ("adelantoId") REFERENCES "Adelanto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdelantoEntregaPactada" ADD CONSTRAINT "AdelantoEntregaPactada_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "AdelantoEntrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIncome" ADD CONSTRAINT "AssetIncome_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetExpense" ADD CONSTRAINT "AssetExpense_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetInspection" ADD CONSTRAINT "AssetInspection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

