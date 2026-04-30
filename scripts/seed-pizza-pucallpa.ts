/**
 * Seedea productos de Pizza Pucallpa.
 * Uso: npx tsx -r dotenv/config scripts/seed-pizza-pucallpa.ts dotenv_config_path=.env.local
 */
import { prisma } from "../lib/prisma";

const SLUG = "pizza-pucallpa";

const PRODUCTS = [
  // Pizzas
  { name: "Pizza Margarita", category: "pizzas", price: 28, unit: "unidad", description: "Mozzarella, tomate y albahaca fresca." },
  { name: "Pizza Pepperoni", category: "pizzas", price: 32, unit: "unidad", description: "Pepperoni y queso mozzarella." },
  { name: "Pizza Hawaiana", category: "pizzas", price: 32, unit: "unidad", description: "Jamón, piña y mozzarella." },
  { name: "Pizza Cuatro Quesos", category: "pizzas", price: 35, unit: "unidad", description: "Mozzarella, parmesano, gorgonzola, fontina." },
  { name: "Pizza Vegetariana", category: "pizzas", price: 30, unit: "unidad", description: "Pimiento, cebolla, champiñones, aceitunas." },
  { name: "Pizza Buleje Especial", category: "pizzas", price: 38, unit: "unidad", description: "Doble mozzarella, jamón, pepperoni y aceitunas." },
  // Calzones
  { name: "Calzone Clásico", category: "calzones", price: 24, unit: "unidad", description: "Jamón, mozzarella y salsa de tomate." },
  { name: "Calzone Vegetariano", category: "calzones", price: 22, unit: "unidad", description: "Espinaca, ricotta y mozzarella." },
  // Acompañamientos
  { name: "Pan de Ajo", category: "acompañamientos", price: 8, unit: "porción", description: "Pan tostado con mantequilla de ajo y perejil." },
  { name: "Alitas BBQ", category: "acompañamientos", price: 18, unit: "porción", description: "8 alitas con salsa BBQ y dip de queso azul." },
  // Bebidas
  { name: "Coca Cola 1.5L", category: "bebidas", price: 8, unit: "botella", description: null },
  { name: "Inca Kola 1.5L", category: "bebidas", price: 8, unit: "botella", description: null },
  { name: "Agua sin gas 625ml", category: "bebidas", price: 3, unit: "botella", description: null },
  // Postres
  { name: "Brownie con Helado", category: "postres", price: 12, unit: "porción", description: "Brownie tibio con helado de vainilla." },
  { name: "Tiramisu", category: "postres", price: 14, unit: "porción", description: "Receta tradicional italiana." },
];

async function main() {
  const store = await prisma.store.findUnique({
    where: { slug: SLUG },
    select: { id: true, tenantId: true, name: true },
  });
  if (!store) {
    console.error(`Store ${SLUG} no existe — corré apply primero`);
    return;
  }

  let created = 0;
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        tenantId: store.tenantId,
        name: p.name,
        category: p.category,
        price: p.price,
        unit: p.unit,
        description: p.description,
        image: "",
        active: true,
      },
    });
    await prisma.storeProduct.create({
      data: {
        storeId: store.id,
        productId: product.id,
        retailPrice: p.price,
        isActive: true,
      },
    });
    created++;
  }

  console.log(`Creados ${created} productos en ${store.name}.`);
  console.log(`URL: http://localhost:3000/marketplace/${SLUG}`);
}

main().finally(() => prisma.$disconnect());
