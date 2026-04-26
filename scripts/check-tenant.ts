import { prisma } from "../lib/prisma";

async function main() {
  const mainT = await prisma.tenant.findUnique({ where: { slug: "main" }, select: { id: true, slug: true } });
  const miPollo = await prisma.tenant.findUnique({ where: { slug: "mi-pollo" }, select: { id: true, slug: true } });
  console.log("main:", mainT);
  console.log("mi-pollo:", miPollo);
  const prod = await prisma.product.findUnique({ where: { id: 1252475 }, select: { id: true, tenantId: true, name: true } });
  console.log("product 1252475:", prod);
}

main().finally(() => prisma.$disconnect());
