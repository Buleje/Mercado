Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pendiente', 'confirmado', 'en_camino', 'entregado', 'cancelado');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('pendiente', 'recibido', 'parcial', 'cancelado');

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

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customDomain" TEXT,
    "ownerEmail" TEXT,
    "ownerPhone" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeCurrentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION,
    "image" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "badge" TEXT,
    "barcode" TEXT,
    "stock" INTEGER,
    "stockMin" INTEGER,
    "stockMax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "deletedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "shelfLifeDays" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
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
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notifOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "notifPromotions" BOOLEAN NOT NULL DEFAULT true,
    "notifRestock" BOOLEAN NOT NULL DEFAULT false,
    "privateNotes" TEXT,
    "referralCode" TEXT,
    "referredBy" TEXT,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "SavedCart" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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

    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerLocation" TEXT NOT NULL DEFAULT '',
    "customerReference" TEXT NOT NULL DEFAULT '',
    "total" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "paymentMethod" TEXT,
    "yapeOperationNumber" TEXT,
    "deuda" BOOLEAN,
    "appliedCouponCode" TEXT,
    "couponDiscount" DOUBLE PRECISION,
    "appliedPromoId" TEXT,
    "discountAmount" DOUBLE PRECISION,
    "totalCogs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "deletedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "riderName" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',

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
    "status" TEXT NOT NULL DEFAULT 'approved',
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "adminReply" TEXT,
    "adminReplyDate" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "taxRate" DOUBLE PRECISION DEFAULT 18,
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
    "cashOpeningAmount" DOUBLE PRECISION DEFAULT 100,
    "cashAlertMax" DOUBLE PRECISION DEFAULT 500,
    "returnPolicyDays" INTEGER DEFAULT 7,
    "returnMaxNoAuth" DOUBLE PRECISION DEFAULT 50,
    "autoCloseTime" TEXT,
    "deliveryZonesJson" TEXT,
    "freeDeliveryMin" DOUBLE PRECISION DEFAULT 0,
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "unitCost" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "totalCogs" DOUBLE PRECISION,
    "payment" TEXT NOT NULL DEFAULT 'efectivo',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "change" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customerPhone" TEXT,
    "cashierId" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comprobanteTipo" TEXT DEFAULT 'ticket',
    "comprobanteRuc" TEXT,
    "comprobanteNumero" TEXT,
    "descuentoMonto" DECIMAL(10,2),
    "descuentoPorcentaje" DECIMAL(5,2),
    "paymentDetails" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minPurchase" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "message" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetPhones" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
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
    "openingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingAmount" DOUBLE PRECISION,
    "expectedAmount" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'abierta',
    "notes" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'main',

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "description" TEXT NOT NULL DEFAULT '',
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION,
    "minPurchase" DOUBLE PRECISION,
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
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "customerPhone" TEXT,
    "creditApplied" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "price" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "oldPrice" DOUBLE PRECISION NOT NULL,
    "newPrice" DOUBLE PRECISION NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMessage" (
    "id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "image" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "name" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
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
    "id" TEXT NOT NULL DEFAULT 'global',
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
    "id" TEXT NOT NULL DEFAULT 'main',
    "items" JSONB NOT NULL,
    "settings" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Navigation_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "lote" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL DEFAULT 'Otros',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL DEFAULT '',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "costUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "value" DOUBLE PRECISION,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'principal',
    "location" TEXT NOT NULL DEFAULT '',
    "manager" TEXT NOT NULL DEFAULT 'Administrador',
    "capacity" INTEGER NOT NULL DEFAULT 10000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
    "cashierId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "minSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxSales" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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
    "tenantId" TEXT NOT NULL DEFAULT 'main',
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

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeSubscriptionId_key" ON "Tenant"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_active_idx" ON "Tenant"("active");

-- CreateIndex
CREATE INDEX "Tenant_stripeCustomerId_idx" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_active_idx" ON "Product"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_createdAt_idx" ON "Customer"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCart_customerPhone_key" ON "SavedCart"("customerPhone");

-- CreateIndex
CREATE INDEX "SavedCart_tenantId_idx" ON "SavedCart"("tenantId");

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
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_tenantId_idx" ON "Review"("tenantId");

-- CreateIndex
CREATE INDEX "Review_productId_idx" ON "Review"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_tenantId_key" ON "Settings"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_idx" ON "PurchaseOrder"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseOrderId_idx" ON "PurchaseItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Sale_customerPhone_idx" ON "Sale"("customerPhone");

-- CreateIndex
CREATE INDEX "Sale_cashierId_idx" ON "Sale"("cashierId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_idx" ON "Sale"("tenantId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_createdAt_idx" ON "Sale"("tenantId", "createdAt");

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
CREATE INDEX "Payment_payableId_idx" ON "Payment"("payableId");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");

-- CreateIndex
CREATE INDEX "CashMovement_cashRegisterId_idx" ON "CashMovement"("cashRegisterId");

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
CREATE UNIQUE INDEX "Coupon_tenantId_code_key" ON "Coupon"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Return_tenantId_idx" ON "Return"("tenantId");

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
CREATE UNIQUE INDEX "DeliverySlot_orderId_key" ON "DeliverySlot"("orderId");

-- CreateIndex
CREATE INDEX "SupplierEvaluation_supplierId_idx" ON "SupplierEvaluation"("supplierId");

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
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_phone_idx" ON "PushSubscription"("phone");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_idx" ON "PushSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "AdminUser_tenantId_idx" ON "AdminUser"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_tenantId_username_key" ON "AdminUser"("tenantId", "username");

-- CreateIndex
CREATE INDEX "NotificationLog_type_idx" ON "NotificationLog"("type");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerNotification_customerPhone_idx" ON "CustomerNotification"("customerPhone");

-- CreateIndex
CREATE INDEX "CustomerNotification_createdAt_idx" ON "CustomerNotification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_slug_idx" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_status_idx" ON "Page"("status");

-- CreateIndex
CREATE INDEX "Page_publishedAt_idx" ON "Page"("publishedAt");

-- CreateIndex
CREATE INDEX "PageBlock_pageId_order_idx" ON "PageBlock"("pageId", "order");

-- CreateIndex
CREATE INDEX "PageBlock_type_idx" ON "PageBlock"("type");

-- CreateIndex
CREATE INDEX "BlockTemplate_type_idx" ON "BlockTemplate"("type");

-- CreateIndex
CREATE INDEX "BlockTemplate_category_idx" ON "BlockTemplate"("category");

-- CreateIndex
CREATE INDEX "Media_folder_idx" ON "Media"("folder");

-- CreateIndex
CREATE INDEX "Media_mimeType_idx" ON "Media"("mimeType");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_createdAt_idx" ON "PageVersion"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookQueue_stripeId_key" ON "StripeWebhookQueue"("stripeId");

-- CreateIndex
CREATE INDEX "StripeWebhookQueue_processedAt_idx" ON "StripeWebhookQueue"("processedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookQueue_nextRetryAt_idx" ON "StripeWebhookQueue"("nextRetryAt");

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
CREATE INDEX "SavedFilter_tenantId_idx" ON "SavedFilter"("tenantId");

-- CreateIndex
CREATE INDEX "ChatMessage_customerPhone_idx" ON "ChatMessage"("customerPhone");

-- CreateIndex
CREATE INDEX "ChatMessage_read_idx" ON "ChatMessage"("read");

-- CreateIndex
CREATE INDEX "ABTest_active_idx" ON "ABTest"("active");

-- CreateIndex
CREATE INDEX "ABTestEvent_testId_variantId_idx" ON "ABTestEvent"("testId", "variantId");

-- CreateIndex
CREATE INDEX "ABTestEvent_visitorId_idx" ON "ABTestEvent"("visitorId");

-- CreateIndex
CREATE INDEX "SurveyResponse_customerPhone_idx" ON "SurveyResponse"("customerPhone");

-- CreateIndex
CREATE INDEX "SurveyResponse_type_idx" ON "SurveyResponse"("type");

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
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_tenantId_idx" ON "NewsletterSubscriber"("tenantId");

-- CreateIndex
CREATE INDEX "CronDeadLetter_jobName_createdAt_idx" ON "CronDeadLetter"("jobName", "createdAt");

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
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiadoCuota" ADD CONSTRAINT "FiadoCuota_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "Fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaIngrediente" ADD CONSTRAINT "RecetaIngrediente_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaIngrediente" ADD CONSTRAINT "RecetaIngrediente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduccionLote" ADD CONSTRAINT "ProduccionLote_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestamo" ADD CONSTRAINT "Prestamo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestamo" ADD CONSTRAINT "Prestamo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoCuota" ADD CONSTRAINT "PrestamoCuota_prestamoId_fkey" FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoDocumento" ADD CONSTRAINT "PrestamoDocumento_prestamoId_fkey" FOREIGN KEY ("prestamoId") REFERENCES "Prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryCuenta" ADD CONSTRAINT "TreasuryCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryMovimiento" ADD CONSTRAINT "TreasuryMovimiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryMovimiento" ADD CONSTRAINT "TreasuryMovimiento_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "TreasuryCuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "TreasuryCuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransferencia" ADD CONSTRAINT "TreasuryTransferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "TreasuryCuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("phone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemision" ADD CONSTRAINT "GuiaRemision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemision" ADD CONSTRAINT "GuiaRemision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaRemisionItem" ADD CONSTRAINT "GuiaRemisionItem_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "GuiaRemision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoFisico" ADD CONSTRAINT "ConteoFisico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoFisicoItem" ADD CONSTRAINT "ConteoFisicoItem_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "ConteoFisico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

