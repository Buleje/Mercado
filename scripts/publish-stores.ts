import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

const adapter = new PrismaPg({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Check tenants first
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true, active: true },
  });
  console.log(`\nTenants encontrados: ${tenants.length}`);
  tenants.forEach((t) =>
    console.log(`  - ${t.name} (${t.slug}) — activo: ${t.active}`)
  );

  const stores = await prisma.store.findMany({
    select: { id: true, slug: true, name: true, isPublished: true, tenantId: true },
  });

  console.log(`\nTiendas encontradas: ${stores.length}`);
  stores.forEach((s) =>
    console.log(`  - ${s.name} (${s.slug}) — publicada: ${s.isPublished}`)
  );

  // Create stores for tenants that don't have one yet
  const tenantsWithoutStore = tenants.filter(
    (t) => !stores.some((s) => s.tenantId === t.id)
  );

  if (tenantsWithoutStore.length > 0) {
    console.log(`\nCreando tiendas para ${tenantsWithoutStore.length} tenants sin tienda...`);
    for (const t of tenantsWithoutStore) {
      const store = await prisma.store.create({
        data: {
          tenantId: t.id,
          slug: t.slug,
          name: t.name,
          category: "bodega",
          isPublished: true,
        },
      });
      console.log(`  ✅ Creada: ${store.name} (${store.slug})`);
    }
  }

  // Publish any unpublished stores
  const unpublished = stores.filter((s) => !s.isPublished);
  if (unpublished.length > 0) {
    const result = await prisma.store.updateMany({
      where: { isPublished: false },
      data: { isPublished: true },
    });
    console.log(`\n✅ Tiendas publicadas: ${result.count}`);
  } else if (tenantsWithoutStore.length === 0) {
    console.log("\n✅ Todas las tiendas ya están publicadas.");
  }
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
