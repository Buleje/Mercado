/**
 * scripts/audit-marketplace-visibility.ts
 *
 * Audita TODOS los Store del marketplace y reporta cuáles están ocultos
 * por ADR-084 (trial expirado / sin subscription / tenant inactivo).
 * Con --fix arregla automáticamente los que tienen plan pero sin trialEndsAt.
 *
 * Uso:
 *   npx tsx -r dotenv/config scripts/audit-marketplace-visibility.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/audit-marketplace-visibility.ts dotenv_config_path=.env.local --fix
 */
import { prisma } from "../lib/prisma";

const FIX = process.argv.includes("--fix");
const TRIAL_DAYS = 30;

async function main() {
  const stores = await prisma.store.findMany({
    where: { isPublished: true },
    include: {
      tenant: {
        select: {
          id: true, slug: true, name: true, active: true, plan: true,
          trialEndsAt: true, stripeSubscriptionId: true, mpSubscriptionId: true,
        },
      },
    },
  });

  const visible: string[] = [];
  const hidden: { slug: string; reason: string; tenantId: string; canFix: boolean }[] = [];

  for (const s of stores) {
    const t = s.tenant;
    const hasPaidSub = !!(t.stripeSubscriptionId || t.mpSubscriptionId);
    const trialActive = t.trialEndsAt ? t.trialEndsAt.getTime() > Date.now() : false;
    const isVisible = s.isPublished && t.active && (hasPaidSub || trialActive);

    if (isVisible) {
      visible.push(s.slug);
    } else {
      const reasons = [];
      if (!t.active) reasons.push("tenant.active=false");
      if (!hasPaidSub && !trialActive) reasons.push("trial expirado/null + sin sub");
      const canFix = t.active && !hasPaidSub && !trialActive;
      hidden.push({ slug: s.slug, reason: reasons.join(", "), tenantId: t.id, canFix });
    }
  }

  console.log(`Total Store con isPublished=true: ${stores.length}`);
  console.log(`Visibles: ${visible.length}`);
  console.log(`Ocultas:  ${hidden.length}`);

  if (hidden.length > 0) {
    console.log("\nOcultas:");
    for (const h of hidden) {
      console.log(`  /marketplace/${h.slug} → ${h.reason}${h.canFix ? " [FIXABLE]" : ""}`);
    }
  }

  if (FIX && hidden.length > 0) {
    const fixable = hidden.filter((h) => h.canFix);
    if (fixable.length === 0) {
      console.log("\nNo hay tiendas auto-fixables (las ocultas tienen tenant.active=false).");
      return;
    }
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const ids = fixable.map((h) => h.tenantId);
    const result = await prisma.tenant.updateMany({
      where: { id: { in: ids } },
      data: { trialEndsAt },
    });
    console.log(`\nFIXED: ${result.count} tenants → trialEndsAt = ${trialEndsAt.toISOString()}`);
    console.log("Slugs:", fixable.map((h) => h.slug).join(", "));
  } else if (hidden.length > 0) {
    console.log("\nDry run. Pasa --fix para arreglar (setea trialEndsAt = now+30d).");
  }
}

main().finally(() => prisma.$disconnect());
