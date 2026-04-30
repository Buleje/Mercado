/**
 * Script de testing — fuerza un tenant a estado "trial expirado" o lo restaura.
 *
 * Uso:
 *   SLUG=main MODE=expire  npx tsx -r dotenv/config scripts/toggle-trial-state.ts dotenv_config_path=.env.local
 *   SLUG=main MODE=restore npx tsx -r dotenv/config scripts/toggle-trial-state.ts dotenv_config_path=.env.local
 *
 * MODE=expire:  plan=free, trialEndsAt=ayer, sin sub → guard se activa.
 * MODE=restore: plan=enterprise (o el que tenga snapshot), trialEndsAt=+30d.
 */
import { prisma } from "../lib/prisma";

const SLUG = process.env.SLUG || "main";
const MODE = process.env.MODE === "restore" ? "restore" : "expire";

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG },
    select: { id: true, plan: true, trialEndsAt: true },
  });
  if (!tenant) {
    console.error(`Tenant ${SLUG} no existe`);
    return;
  }

  if (MODE === "expire") {
    const yesterday = new Date(Date.now() - 86_400_000);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: "free",
        trialEndsAt: yesterday,
        stripeSubscriptionId: null,
        mpSubscriptionId: null,
      },
    });
    console.log(`✅ Tenant ${SLUG} EXPIRADO. Plan=free, trialEndsAt=${yesterday.toISOString()}`);
  } else {
    const future = new Date(Date.now() + 30 * 86_400_000);
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: "enterprise",
        trialEndsAt: future,
      },
    });
    console.log(`✅ Tenant ${SLUG} RESTAURADO. Plan=enterprise, trialEndsAt=${future.toISOString()}`);
  }

  // Invalidar cache cuando hay cambios — el guard hace fetch a /api/plan
  // que tiene su propia cache de Next 16. El proxy single-flight ya creado
  // se encargara, pero por las dudas notificar al dev server.
  console.log("(Recordá hacer hard reload del navegador: Ctrl+Shift+R)");
}

main().finally(() => prisma.$disconnect());
