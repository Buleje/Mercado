-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "appliedCouponCode" TEXT,
ADD COLUMN     "appliedPromoId" TEXT,
ADD COLUMN     "couponDiscount" DOUBLE PRECISION,
ADD COLUMN     "deuda" BOOLEAN,
ADD COLUMN     "discountAmount" DOUBLE PRECISION;
