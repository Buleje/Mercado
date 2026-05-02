-- Migration: add_payment_approval_link
--
-- Adds Order.paymentApprovalId so that each order created during a
-- multi-vendor WhatsApp checkout can be linked to its PaymentApproval.
-- Also adds a missing index on PaymentApproval.conversationId to make
-- the idempotency lookup (findPendingApproval) efficient.
--
-- Safe to run multiple times — uses IF NOT EXISTS / DO NOTHING guards.

-- AlterTable: add nullable foreign-key column on Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentApprovalId" TEXT;

-- CreateIndex: fast lookup by approval
CREATE INDEX IF NOT EXISTS "Order_paymentApprovalId_idx"
  ON "Order"("paymentApprovalId");

-- CreateIndex: idempotency guard in multi-vendor-checkout.ts
-- (findPendingApproval filters on conversationId + status)
CREATE INDEX IF NOT EXISTS "PaymentApproval_conversationId_idx"
  ON "PaymentApproval"("conversationId");
