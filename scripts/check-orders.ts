import { prisma } from "../lib/prisma";

async function main() {
  const miPollo = await prisma.tenant.findUnique({ where: { slug: "mi-pollo" }, select: { id: true } });
  const orders = await prisma.order.findMany({
    where: { tenantId: miPollo?.id ?? "" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, customerName: true, total: true, status: true, paymentMethod: true, createdAt: true, items: { select: { name: true, quantity: true, price: true } } }
  });
  console.log("Recent Mi Pollo orders:", JSON.stringify(orders, null, 2));
}

main().finally(() => prisma.$disconnect());
