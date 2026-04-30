/**
 * Aprueba la tienda pizza-pucallpa: setea isPublished=true, tenant.active=true,
 * trialEndsAt=+30d. Equivalente al flujo de aprobación del superadmin.
 *
 * Uso: npx tsx -r dotenv/config scripts/approve-pizza-pucallpa.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const SLUG = "pizza-pucallpa";

async function main() {
  const store = await prisma.store.findUnique({
    where: { slug: SLUG },
    select: { id: true, tenantId: true, name: true },
  });
  if (!store) {
    console.error(`Store ${SLUG} no existe`);
    return;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  await prisma.tenant.update({
    where: { id: store.tenantId },
    data: { active: true, trialEndsAt, plan: "pro" },
  });
  await prisma.store.update({
    where: { id: store.id },
    data: { isPublished: true, category: "restaurante", zone: "Calleria" },
  });

  console.log(`Aprobada: ${store.name} (${SLUG})`);
  console.log(`  tenant.active=true, trialEndsAt=${trialEndsAt.toISOString()}, plan=pro`);
  console.log(`  store.isPublished=true`);
  console.log(`  URL: http://localhost:3000/marketplace/${SLUG}`);
}

main().finally(() => prisma.$disconnect());
