/**
 * Borra el tenant de test creado durante validación de /marketplace/registrar.
 * Uso: SLUG=test-form-store npx tsx -r dotenv/config scripts/cleanup-test-tenant.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const SLUG = process.env.SLUG || "test-form-store";

async function main() {
  const store = await prisma.store.findUnique({
    where: { slug: SLUG },
    select: { id: true, tenantId: true, name: true },
  });
  if (!store) {
    console.log(`Store ${SLUG} no existe, nada que borrar`);
    return;
  }
  await prisma.store.delete({ where: { id: store.id } });
  await prisma.tenant.delete({ where: { id: store.tenantId } });
  console.log(`Borrado: ${store.name} (${SLUG}) y su tenant`);
}

main().finally(() => prisma.$disconnect());
