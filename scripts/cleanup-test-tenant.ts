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
  // ADR-491: el registro de firmas de adelantos es solo de agregar; el cascade
  // del tenant lo borra sólo con este permiso LOCAL a la transacción (nunca un
  // SET de sesión: el pooler lo pega a conexiones ajenas). Inline y no
  // `permitirBorrarFirmas()` porque la DB class importa `server-only`.
  await prisma.$transaction([
    prisma.$queryRaw`SELECT set_config('app.permitir_borrar_firmas', 'on', true)`,
    prisma.tenant.delete({ where: { id: store.tenantId } }),
  ]);
  console.log(`Borrado: ${store.name} (${SLUG}) y su tenant`);
}

main().finally(() => prisma.$disconnect());
