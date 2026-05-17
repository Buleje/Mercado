import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prismaForTenant } from "../lib/tenant";
import { prisma } from "../lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "mi-pollo" } });
  if (!tenant) {
    console.log("Tenant mi-pollo no encontrado");
    return;
  }
  console.log("Tenant mi-pollo:", tenant.id);

  console.log("\n→ prisma.adminUser.findMany() (sin extension, esperado 10):");
  const raw = await prisma.adminUser.findMany({
    select: { id: true, username: true, name: true, tenantId: true },
  });
  console.log(`  total: ${raw.length}`);

  console.log(
    "\n→ prismaForTenant(tenant.id).adminUser.findMany() (con extension, esperado 1):",
  );
  const db = prismaForTenant(tenant.id);
  const scoped = await db.adminUser.findMany({
    select: { id: true, username: true, name: true, role: true },
  });
  console.log(`  filtered: ${scoped.length}`);
  console.table(scoped);

  if (scoped.length === raw.length) {
    console.log(
      "\n❌ LEAK: la extension NO filtró. Model name '$allModels' probablemente recibe 'AdminUser' (PascalCase) en Prisma 7, pero TENANT_MODELS contiene 'adminUser' (camelCase).",
    );
  } else if (scoped.length === 1) {
    console.log("\n✅ Extension funciona — el leak debe estar en otra parte.");
  }
}

main().finally(() => prisma.$disconnect());
