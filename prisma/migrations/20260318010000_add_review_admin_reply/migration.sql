-- AddColumn: Review.adminReply
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "adminReply" TEXT;

-- AddColumn: Review.adminReplyDate
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "adminReplyDate" TIMESTAMP(3);
