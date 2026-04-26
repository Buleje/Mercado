import { prisma } from "../lib/prisma";

async function main() {
  const all = await prisma.coupon.findMany({ take: 3 });
  console.log("count:", all.length);
  for (const c of all) {
    console.log(JSON.stringify(c, null, 2));
  }
  const filtered = await prisma.coupon.findMany({
    where: { storeId: { not: null } },
    take: 3,
  });
  console.log("with storeId:", filtered.length);
}

main().finally(() => prisma.$disconnect());
