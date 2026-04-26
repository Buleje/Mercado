import { prisma } from "../lib/prisma";
async function main() {
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Coupon'
    ORDER BY ordinal_position
  `);
  console.log("Coupon columns in DB:", cols);
}
main().finally(() => prisma.$disconnect());
