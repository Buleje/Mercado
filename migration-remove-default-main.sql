-- Migration: Remove @default("main") from tenantId across all models
-- PURPOSE: Force all code to explicitly pass tenantId, preventing silent data leaks
-- SAFETY: Run this ONLY after verifying all create operations pass tenantId
-- ROLLBACK: Re-add DEFAULT 'main' to each column
--
-- To run: npx prisma migrate dev --name remove-default-main
-- Requires: DIRECT_URL in .env

-- NOTE: This migration only removes the DEFAULT constraint.
-- Existing data is NOT changed. No rows are affected.
-- The only effect is: INSERT without tenantId will now FAIL instead of silently using "main".

-- Product
ALTER TABLE "Product" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Order
ALTER TABLE "Order" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Sale  
ALTER TABLE "Sale" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Customer
ALTER TABLE "Customer" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Supplier
ALTER TABLE "Supplier" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Batch
ALTER TABLE "Batch" ALTER COLUMN "tenantId" DROP DEFAULT;

-- InventoryMovement
ALTER TABLE "InventoryMovement" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Warehouse
ALTER TABLE "Warehouse" ALTER COLUMN "tenantId" DROP DEFAULT;

-- CashRegister
ALTER TABLE "CashRegister" ALTER COLUMN "tenantId" DROP DEFAULT;

-- PurchaseOrder
ALTER TABLE "PurchaseOrder" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Coupon
ALTER TABLE "Coupon" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Promotion
ALTER TABLE "Promotion" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Expense
ALTER TABLE "Expense" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Payable
ALTER TABLE "Payable" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Return
ALTER TABLE "Return" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Review
ALTER TABLE "Review" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Note
ALTER TABLE "Note" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Notification
ALTER TABLE "Notification" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Reminder
ALTER TABLE "Reminder" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Transfer
ALTER TABLE "Transfer" ALTER COLUMN "tenantId" DROP DEFAULT;

-- DailySummary
ALTER TABLE "DailySummary" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Settings (special: @unique)
ALTER TABLE "Settings" ALTER COLUMN "tenantId" DROP DEFAULT;

-- AdminUser
ALTER TABLE "AdminUser" ALTER COLUMN "tenantId" DROP DEFAULT;

-- ActivityLog
ALTER TABLE "ActivityLog" ALTER COLUMN "tenantId" DROP DEFAULT;

-- AIConversation
ALTER TABLE "AIConversation" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Bundle
ALTER TABLE "Bundle" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Campaign
ALTER TABLE "Campaign" ALTER COLUMN "tenantId" DROP DEFAULT;

-- CommissionRule
ALTER TABLE "CommissionRule" ALTER COLUMN "tenantId" DROP DEFAULT;

-- ComplianceItem
ALTER TABLE "ComplianceItem" ALTER COLUMN "tenantId" DROP DEFAULT;

-- ConteoFisico
ALTER TABLE "ConteoFisico" ALTER COLUMN "tenantId" DROP DEFAULT;

-- CustomKpi
ALTER TABLE "CustomKpi" ALTER COLUMN "tenantId" DROP DEFAULT;

-- DiscountRule
ALTER TABLE "DiscountRule" ALTER COLUMN "tenantId" DROP DEFAULT;

-- Location
ALTER TABLE "Location" ALTER COLUMN "tenantId" DROP DEFAULT;

-- LoyaltyTransaction
ALTER TABLE "LoyaltyTransaction" ALTER COLUMN "tenantId" DROP DEFAULT;

-- MessageTemplate
ALTER TABLE "MessageTemplate" ALTER COLUMN "tenantId" DROP DEFAULT;

-- NewsletterSubscriber
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "tenantId" DROP DEFAULT;

-- PushSubscription
ALTER TABLE "PushSubscription" ALTER COLUMN "tenantId" DROP DEFAULT;

-- SavedCart
ALTER TABLE "SavedCart" ALTER COLUMN "tenantId" DROP DEFAULT;

-- SavedFilter
ALTER TABLE "SavedFilter" ALTER COLUMN "tenantId" DROP DEFAULT;

-- ShoppingList
ALTER TABLE "ShoppingList" ALTER COLUMN "tenantId" DROP DEFAULT;

-- SupplierReturn
ALTER TABLE "SupplierReturn" ALTER COLUMN "tenantId" DROP DEFAULT;

-- SupportTicket
ALTER TABLE "SupportTicket" ALTER COLUMN "tenantId" DROP DEFAULT;

-- VisitorWelcome
ALTER TABLE "VisitorWelcome" ALTER COLUMN "tenantId" DROP DEFAULT;

-- DO NOT touch Navigation.id — that's a PK with @default("main"), not tenantId
