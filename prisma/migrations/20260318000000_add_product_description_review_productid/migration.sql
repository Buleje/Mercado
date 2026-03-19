-- AddColumn: Product.description
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- AddColumn: Review.productId
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "productId" INTEGER;

-- AddForeignKey for Review.productId → Product.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Review_productId_fkey'
    AND table_name = 'Review'
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- CreateIndex for Review.productId
CREATE INDEX IF NOT EXISTS "Review_productId_idx" ON "Review"("productId");
