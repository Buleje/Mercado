/**
 * scripts/fix-mi-pollo-trial.ts
 *
 * Setea trialEndsAt a 30 días desde ahora para el tenant mi-pollo.
 * El seed original creó el tenant sin trial → ADR-084 oculta la tienda.
 *
 * Uso: npx tsx -r dotenv/config scripts/fix-mi-pollo-trial.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const SLUG = "mi-pollo";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.error(`Tenant ${SLUG} no existe`);
    return;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      trialEndsAt,
      active: true,
    },
  });

  console.log(`Tenant ${SLUG} actualizado:`);
  console.log(`  active:      true`);
  console.log(`  trialEndsAt: ${trialEndsAt.toISOString()}`);
  console.log("→ La tienda /marketplace/mi-pollo debería ser visible ahora.");
}

main().finally(() => prisma.$disconnect());
