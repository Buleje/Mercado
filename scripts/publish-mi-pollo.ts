/**
 * scripts/publish-mi-pollo.ts
 *
 * Publica el tenant "mi-pollo" en el marketplace creando su Store record
 * con isPublished=true.
 *
 * Uso:
 *   npx tsx -r dotenv/config scripts/publish-mi-pollo.ts
 */

import { prisma } from "../lib/prisma";

const TENANT_SLUG = "mi-pollo";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error(`❌ Tenant "${TENANT_SLUG}" no existe. Corré seed-mi-pollo.ts primero.`);
    process.exit(1);
  }

  const store = await prisma.store.upsert({
    where: { slug: TENANT_SLUG },
    update: {
      name: tenant.name,
      isPublished: true,
      vacationMode: false,
      category: "polleria",
      zone: "Centro",
      description: "Pollería en Pucallpa — pollo a la brasa, broaster, salchipapas y bebidas heladas. Delivery rápido.",
      rating: 4.8,
      reviewCount: 24,
      lat: -8.379,
      lng: -74.553,
    },
    create: {
      tenantId: tenant.id,
      slug: TENANT_SLUG,
      name: tenant.name,
      description: "Pollería en Pucallpa — pollo a la brasa, broaster, salchipapas y bebidas heladas. Delivery rápido.",
      category: "polleria",
      zone: "Centro",
      isPublished: true,
      rating: 4.8,
      reviewCount: 24,
      lat: -8.379,
      lng: -74.553,
    },
  });
  console.log(`✓ Store publicada: ${store.id} (${store.slug}) → isPublished=${store.isPublished}`);

  // Asociar productos del tenant a la store
  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, deletedAt: null, active: true },
    select: { id: true, name: true, price: true, image: true, unit: true, stock: true },
  });

  let linked = 0;
  let updated = 0;
  for (const p of products) {
    const existing = await prisma.storeProduct.findFirst({
      where: { storeId: store.id, productId: p.id },
    });
    if (existing) {
      await prisma.storeProduct.update({
        where: { id: existing.id },
        data: { retailPrice: p.price, isActive: true },
      });
      updated++;
    } else {
      await prisma.storeProduct.create({
        data: {
          storeId: store.id,
          productId: p.id,
          retailPrice: p.price,
          isActive: true,
        },
      });
      linked++;
    }
  }
  console.log(`✓ Productos: ${linked} linkeados, ${updated} actualizados (total ${products.length})`);

  console.log(`\n🎉 Listo. Mi Pollo aparece en:`);
  console.log(`   http://localhost:3000/marketplace`);
  console.log(`   http://localhost:3000/marketplace/${TENANT_SLUG}`);
}

main()
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
