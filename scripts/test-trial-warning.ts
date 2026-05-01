/**
 * Setea pizza-pucallpa con trial a +3d para probar el cron trial-warning.
 * Uso: npx tsx -r dotenv/config scripts/test-trial-warning.ts dotenv_config_path=.env.local
 *
 * Después correr el cron y restaurar:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/trial-warning
 *   SLUG=pizza-pucallpa MODE=restore npx tsx -r dotenv/config scripts/toggle-trial-state.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const SLUG = process.env.SLUG || "pizza-pucallpa";
const DAYS = Number(process.env.DAYS) || 3;

async function main() {
  const t = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!t) {
    console.error(`Tenant ${SLUG} no existe`);
    return;
  }
  const future = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);
  await prisma.tenant.update({
    where: { id: t.id },
    data: {
      plan: "free",
      trialEndsAt: future,
      stripeSubscriptionId: null,
      mpSubscriptionId: null,
    },
  });
  console.log(`Tenant ${SLUG}: plan=free, trialEndsAt=${future.toISOString()} (+${DAYS}d)`);
}

main().finally(() => prisma.$disconnect());
