import { prisma } from "../lib/prisma";
async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "mi-pollo" }, select: { id: true } });
  if (!tenant) return;
  const prod = await prisma.product.findFirst({
    where: { tenantId: tenant.id, name: { contains: "1/8 Pollo a la Brasa" }, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log("Product:", prod);
  if (!prod) return;
  const groups = await prisma.productModifierGroup.findMany({
    where: { productId: prod.id, tenantId: tenant.id },
    include: { options: true },
  });
  console.log("Groups:", groups.length);
  for (const g of groups) {
    console.log(" ", g.name, g.options.map((o) => o.name + (o.priceDelta?.toString() === "0" ? "" : ` +${o.priceDelta}`)).join(" | "));
  }
}
main().finally(() => prisma.$disconnect());
