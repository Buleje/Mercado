/**
 * scripts/diagnose-mi-pollo.ts
 * Read-only: imprime por qué MarketplaceStoresDB.getBySlug("mi-pollo") retorna null.
 * Uso: npx tsx -r dotenv/config scripts/diagnose-mi-pollo.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";
const SLUG = process.env.SLUG || "mi-pollo";

async function main() {
  const store = await prisma.store.findUnique({
    where: { slug: SLUG },
    include: {
      tenant: {
        select: {
          active: true, plan: true, trialEndsAt: true,
          stripeSubscriptionId: true, mpSubscriptionId: true, name: true, slug: true,
        },
      },
    },
  });

  if (!store) {
    console.log(`NO EXISTE Store con slug=${SLUG}`);
    return;
  }

  const t = store.tenant;
  const hasPaidSub = !!(t.stripeSubscriptionId || t.mpSubscriptionId);
  const trialActive = t.trialEndsAt ? t.trialEndsAt.getTime() > Date.now() : false;
  const visible = store.isPublished && t.active && (hasPaidSub || trialActive);

  console.log("Store mi-pollo:");
  console.log("  id:           ", store.id);
  console.log("  isPublished:  ", store.isPublished, store.isPublished ? "OK" : "FAIL");
  console.log("Tenant:");
  console.log("  slug:         ", t.slug);
  console.log("  active:       ", t.active, t.active ? "OK" : "FAIL");
  console.log("  plan:         ", t.plan);
  console.log("  trialEndsAt:  ", t.trialEndsAt);
  console.log("  trialActive:  ", trialActive, trialActive ? "OK" : "FAIL");
  console.log("  stripeSub:    ", !!t.stripeSubscriptionId);
  console.log("  mpSub:        ", !!t.mpSubscriptionId);
  console.log("  hasPaidSub:   ", hasPaidSub, hasPaidSub ? "OK" : "FAIL");
  console.log();
  console.log("getBySlug retorna:", visible ? "Store" : "null");
  if (!visible) {
    const reasons = [];
    if (!store.isPublished) reasons.push("isPublished=false");
    if (!t.active) reasons.push("tenant.active=false");
    if (!hasPaidSub && !trialActive) reasons.push("trial expirado sin plan pagado");
    console.log("Razones:", reasons.join(", "));
  }

  const productCount = await prisma.storeProduct.count({ where: { storeId: store.id } });
  const activeCount = await prisma.storeProduct.count({ where: { storeId: store.id, isActive: true } });
  console.log();
  console.log("StoreProducts:");
  console.log("  total:        ", productCount);
  console.log("  isActive=true:", activeCount);
}

main().finally(() => prisma.$disconnect());
