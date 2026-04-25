#!/usr/bin/env node
/**
 * Seed demo images for top products without image.
 *
 * Uso:
 *   node scripts/seed-product-images-demo.mjs                   # tenant "main", dry-run
 *   node scripts/seed-product-images-demo.mjs --apply           # aplica realmente
 *   node scripts/seed-product-images-demo.mjs --tenant=otro     # otro tenant
 *
 * Mapea por keyword del nombre del producto a una URL de Unsplash con
 * query coherente. Solo toca productos con image vacío para no pisar
 * fotos reales que el dueño ya subió.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const tenantArg = args.find((a) => a.startsWith("--tenant="));
const TENANT = tenantArg ? tenantArg.split("=")[1] : "main";

// Keywords (substring case-insensitive del nombre) → query Unsplash
const KEYWORDS = [
  { match: ["inca kola", "incakola"],  query: "inca-kola,soda,bottle" },
  { match: ["coca cola", "cocacola"],  query: "coca-cola,bottle" },
  { match: ["pepsi"],                   query: "pepsi,bottle" },
  { match: ["gaseosa"],                query: "soda,bottle" },
  { match: ["arroz"],                  query: "rice,bag" },
  { match: ["aceite"],                 query: "oil,bottle,kitchen" },
  { match: ["azucar", "azúcar"],       query: "sugar,bag" },
  { match: ["sal"],                    query: "salt" },
  { match: ["fideos", "spaghetti"],    query: "pasta,spaghetti" },
  { match: ["leche"],                  query: "milk,carton" },
  { match: ["queso"],                  query: "cheese" },
  { match: ["mantequilla"],            query: "butter" },
  { match: ["pan"],                    query: "bread" },
  { match: ["huevos", "huevo"],        query: "eggs,carton" },
  { match: ["atun", "atún"],           query: "tuna,can" },
  { match: ["cerveza", "pilsen", "cusqueña"], query: "beer,bottle" },
  { match: ["agua mineral", "agua "],  query: "water,bottle" },
  { match: ["chocolate", "sublime"],   query: "chocolate,bar" },
  { match: ["galleta"],                query: "cookies,biscuit" },
  { match: ["panetón", "paneton"],     query: "panettone,bread" },
  { match: ["detergente"],             query: "detergent,laundry" },
  { match: ["jabón", "jabon"],         query: "soap,bar" },
  { match: ["papel higiénico", "papel higienico"], query: "toilet-paper" },
  { match: ["yogurt", "yogur"],        query: "yogurt" },
  { match: ["mayonesa"],               query: "mayonnaise,jar" },
  { match: ["ketchup", "salsa tomate"],query: "ketchup,bottle" },
  { match: ["café", "cafe "],          query: "coffee,bag" },
  { match: ["té ", "te "],             query: "tea,bag" },
  { match: ["mantequilla"],            query: "butter,block" },
];

function pickQuery(name) {
  const lower = name.toLowerCase();
  for (const k of KEYWORDS) {
    if (k.match.some((m) => lower.includes(m))) return k.query;
  }
  return null;
}

function buildUrl(query, name) {
  const sig = encodeURIComponent(name).slice(0, 32);
  return `https://source.unsplash.com/400x400/?${encodeURIComponent(query)}&sig=${sig}`;
}

async function main() {
  console.log(`\n🌱 Seed demo images — tenant=${TENANT} apply=${APPLY}\n`);

  const products = await prisma.product.findMany({
    where: {
      tenantId: TENANT,
      OR: [{ image: "" }, { image: null }],
      active: true,
    },
    select: { id: true, name: true, category: true, image: true },
    orderBy: { id: "asc" },
  });

  if (products.length === 0) {
    console.log("No hay productos sin imagen. Salgo.");
    return;
  }

  console.log(`Encontrados ${products.length} productos sin imagen.\n`);

  const planned = [];
  const skipped = [];
  for (const p of products) {
    const query = pickQuery(p.name);
    if (!query) {
      skipped.push(p);
      continue;
    }
    planned.push({ id: p.id, name: p.name, url: buildUrl(query, p.name) });
  }

  console.log(`Plan: ${planned.length} productos a actualizar, ${skipped.length} sin keyword match.\n`);
  for (const p of planned.slice(0, 20)) {
    console.log(`  · #${p.id} ${p.name.slice(0, 40).padEnd(40)} → ${p.url.slice(0, 60)}…`);
  }
  if (planned.length > 20) console.log(`  … y ${planned.length - 20} más`);

  if (!APPLY) {
    console.log("\n⚠️  Dry-run. Pasa --apply para escribir en BD.\n");
    return;
  }

  let updated = 0;
  for (const p of planned) {
    try {
      await prisma.product.update({ where: { id: p.id }, data: { image: p.url } });
      updated++;
    } catch (err) {
      console.error(`  ✗ #${p.id} ${p.name}: ${err.message}`);
    }
  }
  console.log(`\n✓ Actualizados ${updated}/${planned.length}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
