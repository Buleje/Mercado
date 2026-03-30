import { PrismaClient } from "../lib/generated/prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const h = await hash("test1234", 10);

  // Tienda 1
  const t1 = await prisma.tenant.upsert({
    where: { slug: "bodega-maria" },
    update: {},
    create: { slug: "bodega-maria", name: "Bodega Doña María", plan: "pro", type: "store", active: true, ownerEmail: "maria@test.com", ownerPhone: "951111111" },
  });
  await prisma.adminUser.upsert({
    where: { tenantId_username: { tenantId: t1.id, username: "maria" } },
    update: {},
    create: { tenantId: t1.id, username: "maria", passwordHash: h, role: "admin", name: "María López" },
  });
  await prisma.store.upsert({
    where: { slug: "bodega-maria" },
    update: {},
    create: { tenantId: t1.id, slug: "bodega-maria", name: "Bodega Doña María", category: "bodega", zone: "pucallpa-centro", isPublished: true, commission: 5.0 },
  });
  console.log("✅ Tienda 1: Bodega Doña María (usuario: maria / pass: test1234)");

  // Tienda 2
  const t2 = await prisma.tenant.upsert({
    where: { slug: "minimarket-carlos" },
    update: {},
    create: { slug: "minimarket-carlos", name: "Minimarket Don Carlos", plan: "business", type: "store", active: true, ownerEmail: "carlos@test.com", ownerPhone: "952222222" },
  });
  await prisma.adminUser.upsert({
    where: { tenantId_username: { tenantId: t2.id, username: "carlos" } },
    update: {},
    create: { tenantId: t2.id, username: "carlos", passwordHash: h, role: "admin", name: "Carlos Ríos" },
  });
  await prisma.store.upsert({
    where: { slug: "minimarket-carlos" },
    update: {},
    create: { tenantId: t2.id, slug: "minimarket-carlos", name: "Minimarket Don Carlos", category: "minimarket", zone: "yarinacocha", isPublished: true, commission: 5.0 },
  });
  console.log("✅ Tienda 2: Minimarket Don Carlos (usuario: carlos / pass: test1234)");

  // Proveedor 1
  const t3 = await prisma.tenant.upsert({
    where: { slug: "distribuidora-sol" },
    update: {},
    create: { slug: "distribuidora-sol", name: "Distribuidora El Sol", plan: "pro", type: "supplier", active: true, ownerEmail: "sol@test.com", ownerPhone: "953333333" },
  });
  const s3 = await prisma.supplier.upsert({
    where: { id: "distribuidora-sol" },
    update: {},
    create: { id: "distribuidora-sol", name: "Distribuidora El Sol", phone: "953333333", email: "sol@test.com", tenantId: t3.id, categoria: "distribuidor" },
  });
  await prisma.supplierPortal.upsert({
    where: { supplierId: s3.id },
    update: {},
    create: { supplierId: s3.id, apiKey: "APIKEY-SOL-2026", isActive: true, autoPublish: true },
  });
  console.log("✅ Proveedor 1: Distribuidora El Sol (API Key: APIKEY-SOL-2026)");

  // Proveedor 2
  const t4 = await prisma.tenant.upsert({
    where: { slug: "mayorista-selva" },
    update: {},
    create: { slug: "mayorista-selva", name: "Mayorista Selva Verde", plan: "pro", type: "supplier", active: true, ownerEmail: "selva@test.com", ownerPhone: "954444444" },
  });
  const s4 = await prisma.supplier.upsert({
    where: { id: "mayorista-selva" },
    update: {},
    create: { id: "mayorista-selva", name: "Mayorista Selva Verde", phone: "954444444", email: "selva@test.com", tenantId: t4.id, categoria: "mayorista" },
  });
  await prisma.supplierPortal.upsert({
    where: { supplierId: s4.id },
    update: {},
    create: { supplierId: s4.id, apiKey: "APIKEY-SELVA-2026", isActive: true, autoPublish: true },
  });
  console.log("✅ Proveedor 2: Mayorista Selva Verde (API Key: APIKEY-SELVA-2026)");

  await prisma.$disconnect();
  console.log("\n🎉 Todo creado. Reinicia el servidor para ver los cambios.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
