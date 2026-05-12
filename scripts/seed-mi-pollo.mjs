/**
 * scripts/seed-mi-pollo.mjs
 *
 * Crea un tenant nuevo "mi-pollo" con su menú completo: pollos a la brasa,
 * salchipapas, guarniciones, postres y bebidas.
 *
 * Uso:
 *   node -r dotenv/config scripts/seed-mi-pollo.mjs
 *
 * Idempotente: si el tenant ya existe lo reutiliza y deja los productos
 * sincronizados (upsert por nombre + categoría).
 */

import pkg from "../lib/generated/prisma/index.js";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

const TENANT_SLUG = "mi-pollo";
const TENANT_NAME = "Mi Pollo";

// ── Categorías custom para una pollería ──────────────────────────────────────
const CATEGORIES = [
  { id: "promociones", label: "Promociones", order: 0 },
  { id: "salchipapa", label: "Salchipapa", order: 1 },
  { id: "pollo-brasa", label: "Pollo a la Brasa", order: 2 },
  { id: "broaster", label: "Broaster", order: 3 },
  { id: "guarniciones", label: "Guarniciones", order: 4 },
  { id: "postres", label: "Postres", order: 5 },
  { id: "bebidas", label: "Bebidas", order: 6 },
];

// ── Catálogo del menú — sin imágenes (el dueño las sube después) ─────────────
const PRODUCTS = [
  // Promociones
  { name: "Promoción Alitas", category: "promociones", price: 22.00, unit: "combo",
    description: "6 unidades de alitas + papas fritas." },
  { name: "Menú Mostrito", category: "promociones", price: 12.00, unit: "combo",
    description: "1/8 de pollo + chaufa + papas fritas." },

  // Salchipapa
  { name: "Salchipapa Clásica", category: "salchipapa", price: 9.00, unit: "porción",
    description: "Papas fritas, salchicha y crema a elección." },
  { name: "Salchipapa Montada", category: "salchipapa", price: 12.00, unit: "porción",
    description: "Papas fritas, salchicha y huevo frito encima." },

  // Pollo a la Brasa
  { name: "1/8 Pollo a la Brasa", category: "pollo-brasa", price: 12.00, unit: "presa",
    description: "Incluye ensalada y cremas (mayonesa, ají de color)." },
  { name: "1/4 Pollo a la Brasa", category: "pollo-brasa", price: 20.00, unit: "presa",
    description: "Incluye cremas (mayonesa, ají de color)." },
  { name: "1/2 Pollo a la Brasa", category: "pollo-brasa", price: 40.00, unit: "presa",
    description: "Incluye papas, ensalada y cremas." },
  { name: "Pollo Entero a la Brasa", category: "pollo-brasa", price: 70.00, unit: "presa",
    description: "Incluye papas, ensalada y cremas." },

  // Broaster
  { name: "1/8 Pollo Broaster", category: "broaster", price: 10.00, unit: "presa",
    description: "Incluye ensalada." },
  { name: "1/4 Pollo Broaster", category: "broaster", price: 18.00, unit: "presa",
    description: "Pollo broaster crocante." },

  // Guarniciones
  { name: "Porción de Papas Fritas", category: "guarniciones", price: 10.00, unit: "porción", description: null },
  { name: "1/2 Porción de Papas Fritas", category: "guarniciones", price: 5.00, unit: "porción", description: null },
  { name: "Porción de Plátanos Fritos", category: "guarniciones", price: 10.00, unit: "porción", description: null },
  { name: "1/2 Porción de Plátanos Fritos", category: "guarniciones", price: 5.00, unit: "porción", description: null },
  { name: "Porción de Patacones", category: "guarniciones", price: 10.00, unit: "porción", description: null },
  { name: "1/2 Porción de Patacones", category: "guarniciones", price: 5.00, unit: "porción", description: null },
  { name: "Porción de Arroz Chaufa", category: "guarniciones", price: 12.00, unit: "porción", description: null },
  { name: "Porción de Arroz Blanco", category: "guarniciones", price: 12.00, unit: "porción", description: null },
  { name: "Porción de Ensalada", category: "guarniciones", price: 15.00, unit: "porción", description: null },
  { name: "1/2 Porción de Ensalada", category: "guarniciones", price: 7.00, unit: "porción", description: null },

  // Postres
  { name: "Yamboly 1/2 Lt", category: "postres", price: 6.00, unit: "unidad", description: null },
  { name: "Yamboly 1 Lt", category: "postres", price: 10.00, unit: "unidad", description: null },
  { name: "Choco Maní", category: "postres", price: 2.00, unit: "unidad", description: null },
  { name: "Bakanazo", category: "postres", price: 4.50, unit: "unidad", description: null },
  { name: "Cono Bola", category: "postres", price: 2.50, unit: "unidad", description: null },
  { name: "Praia", category: "postres", price: 1.50, unit: "unidad", description: null },
  { name: "Yambito", category: "postres", price: 2.00, unit: "unidad", description: null },

  // Bebidas
  { name: "Chicha Morada 1 Lt", category: "bebidas", price: 12.00, unit: "botella", description: null },
  { name: "Chicha Morada 1/2 Lt", category: "bebidas", price: 6.00, unit: "botella", description: null },
  { name: "Vaso de Cocona", category: "bebidas", price: 3.00, unit: "vaso", description: null },
  { name: "Vaso de Chicha Morada", category: "bebidas", price: 3.00, unit: "vaso", description: null },
  { name: "Cerveza San Juan 620ml", category: "bebidas", price: 7.00, unit: "botella", description: null },
  { name: "Cerveza Heineken 630ml", category: "bebidas", price: 7.00, unit: "botella", description: null },
  { name: "Cerveza Lata San Juan", category: "bebidas", price: 6.00, unit: "lata", description: null },
  { name: "Coca Cola 1 Lt", category: "bebidas", price: 10.00, unit: "botella", description: null },
  { name: "Inca Kola 600ml", category: "bebidas", price: 5.00, unit: "botella", description: null },
  { name: "Coca Cola 600ml", category: "bebidas", price: 5.00, unit: "botella", description: null },
  { name: "Inca Kola 1.5 Lt", category: "bebidas", price: 12.00, unit: "botella", description: null },
  { name: "Coca Cola 1.5 Lt", category: "bebidas", price: 12.00, unit: "botella", description: null },
  { name: "Inca Kola 3 Lt", category: "bebidas", price: 15.00, unit: "botella", description: null },
  { name: "Coca Cola 3 Lt", category: "bebidas", price: 15.00, unit: "botella", description: null },
  { name: "Agua San Luis", category: "bebidas", price: 3.00, unit: "botella", description: null },
  { name: "Pepsi Lt", category: "bebidas", price: 5.00, unit: "botella", description: null },
  { name: "Pepsi Black", category: "bebidas", price: 2.50, unit: "botella", description: null },
];

async function main() {
  console.log(`\n🐔 Creando tienda "${TENANT_NAME}" (${TENANT_SLUG})…\n`);

  // 1. Tenant — upsert por slug
  // ADR-084: trialEndsAt requerido para que el Store sea visible en marketplace
  // (sin paid sub Y sin trial vigente, getBySlug retorna null).
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: TENANT_NAME, active: true, trialEndsAt },
    create: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      plan: "pro",
      type: "store",
      active: true,
      trialEndsAt,
      primaryColor: "#D62828", // rojo pollería
      secondaryColor: "#F4A261",
    },
  });
  console.log(`✓ Tenant: ${tenant.id} (${tenant.slug})`);

  // 2. Settings + storeTheme — upsert por tenantId
  const storeTheme = {
    storeName: TENANT_NAME,
    description: "Pollería en Pucallpa — pollo a la brasa, broaster, salchipapas y bebidas heladas. Delivery rápido.",
    slogan: "Pollo a la brasa de verdad",
    primaryColor: "#D62828",
    secondaryColor: "#F4A261",
    accentColor: "#FFB703",
    storeName_categoryOrder: CATEGORIES,
    phone: "+51 929 340 532",
    whatsapp: "https://wa.me/51929340532",
    address: "Pucallpa, Ucayali",
    socialLinks: {},
  };

  const existing = await prisma.settings.findUnique({ where: { tenantId: tenant.id } });
  if (existing) {
    await prisma.settings.update({
      where: { tenantId: tenant.id },
      data: {
        businessName: TENANT_NAME,
        description: storeTheme.description,
        slogan: storeTheme.slogan,
        storeTheme,
        categoryOrder: CATEGORIES,
      },
    });
  } else {
    await prisma.settings.create({
      data: {
        tenantId: tenant.id,
        mode: "checkout",
        businessName: TENANT_NAME,
        description: storeTheme.description,
        slogan: storeTheme.slogan,
        storeTheme,
        categoryOrder: CATEGORIES,
        cashEnabled: true,
        yapeEnabled: true,
      },
    });
  }
  console.log(`✓ Settings + storeTheme actualizados (storeName="${TENANT_NAME}")`);

  // 3. Products — upsert por (tenantId + name + category)
  let created = 0;
  let updated = 0;
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: tenant.id, name: p.name, category: p.category, deletedAt: null },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          price: p.price,
          unit: p.unit,
          description: p.description,
          active: true,
        },
      });
      updated++;
    } else {
      await prisma.product.create({
        data: {
          tenantId: tenant.id,
          name: p.name,
          category: p.category,
          price: p.price,
          unit: p.unit,
          description: p.description,
          image: "",
          active: true,
          stock: 999,
          stockMin: 0,
        },
      });
      created++;
    }
  }
  console.log(`✓ Productos: ${created} creados, ${updated} actualizados (total ${PRODUCTS.length})`);

  // 4. Resumen
  const total = await prisma.product.count({ where: { tenantId: tenant.id, deletedAt: null } });
  console.log(`\n🎉 Tienda lista. Total productos en DB: ${total}`);
  console.log(`\n   URL pública:   http://localhost:3000/t/${TENANT_SLUG}`);
  console.log(`   URL catálogo:  http://localhost:3000/t/${TENANT_SLUG}/tienda`);
  console.log(`   URL admin:     http://localhost:3000/t/${TENANT_SLUG}/admin\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
