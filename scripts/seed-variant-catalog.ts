/**
 * scripts/seed-variant-catalog.ts
 *
 * Seed de plantillas iniciales del catálogo global de variaciones.
 * Crea ejemplos para Pollería, Pizzería y Heladería con sus opciones e
 * imágenes (placeholders para que el superadmin las reemplace después).
 *
 * Uso:
 *   npx tsx scripts/seed-variant-catalog.ts
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const resolvedUrl =
  !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;

const adapter = new PrismaPg({
  connectionString: resolvedUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

type Template = {
  category: string;
  name: string;
  description?: string;
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  options: { name: string; imageUrl?: string; priceDelta?: number; isDefault?: boolean }[];
};

const TEMPLATES: Template[] = [
  // ─── Pollería ──────────────────────────────────────────
  {
    category: "Pollería",
    name: "Presas",
    description: "Pieza del pollo que prefiere el cliente",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Pierna", isDefault: true },
      { name: "Pecho" },
      { name: "Encuentro" },
      { name: "Ala" },
      { name: "Cadera" },
    ],
  },
  {
    category: "Pollería",
    name: "Cremas",
    description: "Cremas de acompañamiento (puede elegir varias)",
    required: false,
    minSelect: 0,
    maxSelect: 4,
    options: [
      { name: "Crema huancaína" },
      { name: "Mayonesa" },
      { name: "Ají de la casa" },
      { name: "Crema de rocoto" },
      { name: "Mostaza" },
      { name: "Ketchup" },
    ],
  },
  {
    category: "Pollería",
    name: "Acompañamientos",
    description: "Guarnición que acompaña al pollo",
    required: true,
    minSelect: 1,
    maxSelect: 2,
    options: [
      { name: "Papas fritas", isDefault: true },
      { name: "Ensalada mixta" },
      { name: "Yuca frita", priceDelta: 2 },
      { name: "Camote frito", priceDelta: 2 },
      { name: "Arroz con choclo", priceDelta: 1 },
    ],
  },

  // ─── Pizzería ─────────────────────────────────────────
  {
    category: "Pizzería",
    name: "Tamaño",
    description: "Tamaño de la pizza",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Personal", isDefault: true },
      { name: "Mediana", priceDelta: 8 },
      { name: "Familiar", priceDelta: 15 },
      { name: "XL", priceDelta: 22 },
    ],
  },
  {
    category: "Pizzería",
    name: "Toppings extra",
    description: "Toppings adicionales con costo",
    required: false,
    minSelect: 0,
    maxSelect: 6,
    options: [
      { name: "Doble queso", priceDelta: 4 },
      { name: "Pepperoni", priceDelta: 4 },
      { name: "Jamón", priceDelta: 3 },
      { name: "Champiñones", priceDelta: 3 },
      { name: "Aceitunas", priceDelta: 2 },
      { name: "Pimiento", priceDelta: 2 },
      { name: "Cebolla", priceDelta: 1 },
      { name: "Anchoas", priceDelta: 5 },
    ],
  },
  {
    category: "Pizzería",
    name: "Borde",
    description: "Tipo de borde de la pizza",
    required: false,
    minSelect: 0,
    maxSelect: 1,
    options: [
      { name: "Tradicional", isDefault: true },
      { name: "Borde con queso", priceDelta: 5 },
      { name: "Crujiente", priceDelta: 0 },
    ],
  },

  // ─── Heladería ────────────────────────────────────────
  {
    category: "Heladería",
    name: "Sabores",
    description: "Sabores del helado (uno por bola)",
    required: true,
    minSelect: 1,
    maxSelect: 3,
    options: [
      { name: "Vainilla", isDefault: true },
      { name: "Chocolate" },
      { name: "Fresa" },
      { name: "Lúcuma" },
      { name: "Chocolate chips" },
      { name: "Mango" },
      { name: "Maracuyá" },
      { name: "Café" },
    ],
  },
  {
    category: "Heladería",
    name: "Toppings",
    description: "Toppings que se añaden al helado",
    required: false,
    minSelect: 0,
    maxSelect: 4,
    options: [
      { name: "Granola", priceDelta: 1.5 },
      { name: "Salsa de chocolate", priceDelta: 1 },
      { name: "Salsa de fresa", priceDelta: 1 },
      { name: "Frutos secos", priceDelta: 2 },
      { name: "Marshmallows", priceDelta: 1 },
      { name: "M&M's", priceDelta: 2 },
    ],
  },

  // ─── Restaurante general ──────────────────────────────
  {
    category: "Restaurante",
    name: "Punto de cocción",
    description: "Punto de cocción de la carne",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Jugoso" },
      { name: "Término medio", isDefault: true },
      { name: "Bien cocido" },
    ],
  },
  {
    category: "Restaurante",
    name: "Bebida",
    description: "Bebida incluida en el combo",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Inca Kola", isDefault: true },
      { name: "Coca-Cola" },
      { name: "Agua mineral" },
      { name: "Limonada", priceDelta: 1 },
      { name: "Chicha morada", priceDelta: 1 },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding variant catalog...\n");

  let createdTemplates = 0;
  let createdOptions = 0;

  for (const t of TEMPLATES) {
    // Skip si ya existe (idempotente)
    const existing = await prisma.variantCatalogTemplate.findFirst({
      where: { category: t.category, name: t.name },
    });
    if (existing) {
      console.log(`  ⏭  ${t.category} / ${t.name} (ya existe)`);
      continue;
    }

    const template = await prisma.variantCatalogTemplate.create({
      data: {
        category: t.category,
        name: t.name,
        description: t.description ?? null,
        required: t.required ?? false,
        minSelect: t.minSelect ?? 0,
        maxSelect: t.maxSelect ?? 1,
        isPublished: true,
        options: {
          create: t.options.map((o, idx) => ({
            name: o.name,
            imageUrl: o.imageUrl ?? null,
            priceDelta: o.priceDelta ?? 0,
            position: idx,
            isDefault: o.isDefault ?? false,
          })),
        },
      },
      include: { options: true },
    });

    createdTemplates++;
    createdOptions += template.options.length;
    console.log(`  ✓ ${t.category} / ${t.name} (${template.options.length} opciones)`);
  }

  console.log(`\n✅ Done: ${createdTemplates} plantillas, ${createdOptions} opciones`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
