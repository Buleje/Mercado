// Crea un admin QA temporal en el primer tenant disponible.
// Uso: npx tsx scripts/create-qa-admin.ts
import { prisma } from "../lib/prisma";
import { hash } from "bcryptjs";

const USER = "qa-admin";
const PASS = "qa-admin-1234";

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  console.log("TENANTS:");
  console.table(tenants);

  if (tenants.length === 0) {
    console.error("No tenants. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const target = tenants[0];
  console.log(`Target tenant: ${target.slug} (${target.id})`);

  const passwordHash = await hash(PASS, 10);

  const existing = await prisma.adminUser.findFirst({
    where: { tenantId: target.id, username: USER },
  });

  if (existing) {
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash, active: true, role: "admin" },
    });
    console.log(`Updated existing admin user ${USER} in tenant ${target.slug}`);
  } else {
    await prisma.adminUser.create({
      data: {
        tenantId: target.id,
        username: USER,
        passwordHash,
        role: "admin",
        name: "QA Admin",
        active: true,
      },
    });
    console.log(`Created admin user ${USER} in tenant ${target.slug}`);
  }

  console.log(`
Login credentials:
  username: ${USER}
  password: ${PASS}
  tenant slug: ${target.slug}
  login URL: http://localhost:3000/t/${target.slug}/admin
  or default: http://localhost:3000/admin (if tenant resolves to this one)
`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
