/**
 * scripts/seed-mi-pollo-modifiers.ts
 *
 * Crea modifier groups + options de ejemplo para productos de Mi Pollo:
 *   - "1/8 Pollo a la Brasa": Crema adicional (opcional, 1 max), Adicional (opcional, 3 max)
 *   - "Pollo Entero a la Brasa": misma config, deltas más altos
 *
 * Uso: npx tsx -r dotenv/config scripts/seed-mi-pollo-modifiers.ts
 */

import { prisma } from "../lib/prisma";

const TENANT_SLUG = "mi-pollo";

type GroupSeed = {
  name: string;
  description?: string;
  required?: boolean;
  minSelect?: number;
  maxSelect: number;
  options: { name: string; priceDelta?: number; isDefault?: boolean }[];
};

const POLLO_MODIFIERS: GroupSeed[] = [
  {
    name: "Crema adicional",
    description: "Elige una crema extra para acompañar",
    required: false,
    minSelect: 0,
    maxSelect: 1,
    options: [
      { name: "Crema de aceituna" },
      { name: "Chimichurri" },
    ],
  },
  {
    name: "Adicional",
    description: "Acompañamiento extra",
    required: false,
    minSelect: 0,
    maxSelect: 3,
    options: [
      { name: "Papas Fritas" },
      { name: "Patacones", priceDelta: 2.0 },
      { name: "Tacacho", priceDelta: 2.0 },
      { name: "Chaufa", priceDelta: 2.0 },
    ],
  },
];

async function applyToProduct(tenantId: string, productName: string, groups: GroupSeed[]) {
  const product = await prisma.product.findFirst({
    where: { tenantId, name: productName, deletedAt: null },
    select: { id: true },
  });
  if (!product) {
    console.log(`  [skip] product not found: ${productName}`);
    return;
  }
  await prisma.productModifierGroup.deleteMany({
    where: { productId: product.id, tenantId },
  });
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    await prisma.productModifierGroup.create({
      data: {
        productId: product.id,
        tenantId,
        name: g.name,
        description: g.description ?? null,
        required: g.required ?? false,
        minSelect: g.minSelect ?? 0,
        maxSelect: g.maxSelect,
        position: i,
        isActive: true,
        options: {
          create: g.options.map((o, j) => ({
            name: o.name,
            priceDelta: o.priceDelta ?? 0,
            isDefault: o.isDefault ?? false,
            position: j,
            isActive: true,
            tenantId,
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${productName} → ${groups.length} groups, ${groups.reduce((s, g) => s + g.options.length, 0)} options`);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
  if (!tenant) {
    console.error(`Tenant ${TENANT_SLUG} no existe`);
    process.exit(1);
  }
  console.log(`Sembrando modifiers para tenant=${tenant.id}…`);
  await applyToProduct(tenant.id, "1/8 Pollo a la Brasa", POLLO_MODIFIERS);
  await applyToProduct(tenant.id, "1/4 Pollo a la Brasa", POLLO_MODIFIERS);
  await applyToProduct(tenant.id, "1/2 Pollo a la Brasa", POLLO_MODIFIERS);
  await applyToProduct(tenant.id, "Pollo Entero a la Brasa", POLLO_MODIFIERS);
  await applyToProduct(tenant.id, "1/8 Pollo Broaster", POLLO_MODIFIERS);
  await applyToProduct(tenant.id, "1/4 Pollo Broaster", POLLO_MODIFIERS);
  console.log("\n🎉 Listo. Reabrí /t/mi-pollo/tienda y agrega un pollo al carrito.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
