import { PrismaClient } from "../node_modules/@prisma/client/index.js";
const prisma = new PrismaClient();
try {
  const tenants = await prisma.tenant.findMany({ select: { slug: true, id: true }, orderBy: { createdAt: "asc" }, take: 10 });
  console.log("=== TENANTS ===");
  console.table(tenants);
  const counts = await prisma.$queryRawUnsafe(`SELECT "tenantId", COUNT(*)::int AS n FROM "Product" GROUP BY "tenantId" ORDER BY n DESC LIMIT 10`);
  console.log("=== PRODUCT COUNTS BY tenantId ===");
  console.table(counts);
} catch(e) {
  console.error("ERR:", e.message);
}
await prisma.$disconnect();
