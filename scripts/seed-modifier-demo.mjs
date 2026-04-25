/**
 * seed-modifier-demo.mjs
 *
 * Crea ejemplos universales de variaciones para que el dueño tenga
 * referencia visual al entrar a /admin/store-page → tab Variaciones.
 *
 * Casos demostrados:
 *   1. Polleria "1/4 de pollo a la brasa" — Presa + Cremas + Extras
 *   2. Ropa     "Camisa Oxford"          — Talla + Color
 *   3. Farmacia "Paracetamol"            — Presentacion
 *   4. Heladeria "Cono"                  — Sabor 1 + Sabor 2 (opcional)
 *
 * Idempotente: si los productos / grupos ya existen los reusa.
 *
 * Uso: node scripts/seed-modifier-demo.mjs
 */
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// ── Helpers ────────────────────────────────────────────────────────

const cuid = () => "c" + crypto.randomBytes(12).toString("hex");

async function findOrCreateProduct({
  tenantId,
  name,
  category,
  price,
  unit,
  description,
}) {
  const found = await client.query(
    `SELECT id FROM "Product" WHERE "tenantId" = $1 AND name = $2 AND "deletedAt" IS NULL LIMIT 1;`,
    [tenantId, name],
  );
  if (found.rows[0]) return found.rows[0].id;
  const ins = await client.query(
    `INSERT INTO "Product" ("tenantId", name, category, price, unit, description, image, active)
     VALUES ($1, $2, $3, $4, $5, $6, '', true)
     RETURNING id;`,
    [tenantId, name, category, price, unit, description ?? null],
  );
  console.log(`  + Producto creado: ${name} (id=${ins.rows[0].id})`);
  return ins.rows[0].id;
}

async function ensureGroupWithOptions(
  tenantId,
  productId,
  group,
  optionsList,
) {
  // 1. ¿ya existe un grupo con ese nombre para este producto?
  const existing = await client.query(
    `SELECT id FROM "ProductModifierGroup" WHERE "tenantId" = $1 AND "productId" = $2 AND name = $3 LIMIT 1;`,
    [tenantId, productId, group.name],
  );
  let groupId;
  if (existing.rows[0]) {
    groupId = existing.rows[0].id;
    console.log(`    · Grupo "${group.name}" ya existia (id=${groupId})`);
  } else {
    groupId = cuid();
    await client.query(
      `INSERT INTO "ProductModifierGroup"
         (id, "productId", name, description, required, "minSelect", "maxSelect", position, "isActive", "tenantId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW());`,
      [
        groupId,
        productId,
        group.name,
        group.description ?? null,
        group.required ?? false,
        group.minSelect ?? 0,
        group.maxSelect ?? 1,
        group.position ?? 0,
        tenantId,
      ],
    );
    console.log(`    + Grupo "${group.name}" creado (id=${groupId})`);
  }

  // 2. opciones — solo crear las que no existan por nombre dentro del grupo
  for (const [idx, opt] of optionsList.entries()) {
    const optExists = await client.query(
      `SELECT id FROM "ProductModifierOption" WHERE "groupId" = $1 AND name = $2 LIMIT 1;`,
      [groupId, opt.name],
    );
    if (optExists.rows[0]) continue;
    await client.query(
      `INSERT INTO "ProductModifierOption"
         (id, "groupId", name, "priceDelta", position, "isDefault", "isActive", "imageUrl", "tenantId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW());`,
      [
        cuid(),
        groupId,
        opt.name,
        opt.priceDelta ?? 0,
        idx,
        opt.isDefault ?? false,
        opt.imageUrl ?? null,
        tenantId,
      ],
    );
  }
  console.log(`      ${optionsList.length} opciones aseguradas`);
}

// ── Tenant lookup ──────────────────────────────────────────────────

const { rows: tenantRows } = await client.query(
  `SELECT id FROM "Tenant" WHERE slug = 'main' LIMIT 1;`,
);
if (!tenantRows[0]) {
  console.error("Tenant 'main' no encontrado — crear primero");
  process.exit(1);
}
const tenantId = tenantRows[0].id;
console.log(`Tenant 'main' id = ${tenantId}\n`);

// ── 1. Polleria ────────────────────────────────────────────────────

console.log("📦 1/4 de pollo a la brasa");
const polloId = await findOrCreateProduct({
  tenantId,
  name: "1/4 de pollo a la brasa",
  category: "Restaurante",
  price: 18,
  unit: "porcion",
  description: "Pollo a la brasa con cremas y opcion de presa.",
});
await ensureGroupWithOptions(
  tenantId,
  polloId,
  { name: "Presa", required: true, minSelect: 1, maxSelect: 1, position: 0 },
  [
    { name: "Pierna" },
    { name: "Pecho" },
    { name: "Ala" },
  ],
);
await ensureGroupWithOptions(
  tenantId,
  polloId,
  { name: "Cremas", required: false, minSelect: 0, maxSelect: 3, position: 1 },
  [
    { name: "Mayonesa" },
    { name: "Ketchup" },
    { name: "Mostaza" },
    { name: "Aji" },
    { name: "Huancaina" },
  ],
);
await ensureGroupWithOptions(
  tenantId,
  polloId,
  { name: "Extras", required: false, minSelect: 0, maxSelect: 5, position: 2 },
  [
    { name: "Papas extra", priceDelta: 3 },
    { name: "Ensalada", priceDelta: 4 },
    { name: "Inca Kola 500ml", priceDelta: 5 },
  ],
);

// ── 2. Ropa ────────────────────────────────────────────────────────

console.log("\n👕 Camisa Oxford");
const camisaId = await findOrCreateProduct({
  tenantId,
  name: "Camisa Oxford",
  category: "Ropa",
  price: 49,
  unit: "unidad",
  description: "Camisa de algodon premium, corte regular.",
});
await ensureGroupWithOptions(
  tenantId,
  camisaId,
  { name: "Talla", required: true, minSelect: 1, maxSelect: 1, position: 0 },
  [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }],
);
await ensureGroupWithOptions(
  tenantId,
  camisaId,
  { name: "Color", required: true, minSelect: 1, maxSelect: 1, position: 1 },
  [{ name: "Azul" }, { name: "Blanco" }, { name: "Negro" }],
);

// ── 3. Farmacia ────────────────────────────────────────────────────

console.log("\n💊 Paracetamol");
const paraId = await findOrCreateProduct({
  tenantId,
  name: "Paracetamol",
  category: "Farmacia",
  price: 8,
  unit: "caja",
  description: "Analgesico y antipiretico.",
});
await ensureGroupWithOptions(
  tenantId,
  paraId,
  { name: "Presentacion", required: true, minSelect: 1, maxSelect: 1, position: 0 },
  [
    { name: "500mg" },
    { name: "1g", priceDelta: 4 },
  ],
);

// ── 4. Heladeria ───────────────────────────────────────────────────

console.log("\n🍦 Cono helado");
const conoId = await findOrCreateProduct({
  tenantId,
  name: "Cono helado",
  category: "Heladeria",
  price: 6,
  unit: "cono",
  description: "Cono crocante con 1 o 2 sabores a eleccion.",
});
await ensureGroupWithOptions(
  tenantId,
  conoId,
  { name: "Sabor 1", required: true, minSelect: 1, maxSelect: 1, position: 0 },
  [
    { name: "Chocolate" },
    { name: "Vainilla" },
    { name: "Fresa" },
    { name: "Lucuma" },
  ],
);
await ensureGroupWithOptions(
  tenantId,
  conoId,
  { name: "Sabor 2 (opcional)", required: false, minSelect: 0, maxSelect: 1, position: 1 },
  [
    { name: "Chocolate", priceDelta: 2 },
    { name: "Vainilla", priceDelta: 2 },
    { name: "Fresa", priceDelta: 2 },
    { name: "Lucuma", priceDelta: 2 },
  ],
);
await ensureGroupWithOptions(
  tenantId,
  conoId,
  { name: "Toppings", required: false, minSelect: 0, maxSelect: 3, position: 2 },
  [
    { name: "Chispas de chocolate", priceDelta: 1 },
    { name: "Galleta Oreo", priceDelta: 2 },
    { name: "Crema chantilly", priceDelta: 1 },
  ],
);

// ── Asegurar que cada producto este en el StoreProduct de la tienda 'main' ──

console.log("\n🛒 Sincronizando StoreProducts (tienda main)…");
const { rows: storeRows } = await client.query(
  `SELECT id FROM "Store" WHERE "tenantId" = $1 LIMIT 1;`,
  [tenantId],
);
if (storeRows[0]) {
  const storeId = storeRows[0].id;
  for (const productId of [polloId, camisaId, paraId, conoId]) {
    const existsSP = await client.query(
      `SELECT id FROM "StoreProduct" WHERE "storeId" = $1 AND "productId" = $2 LIMIT 1;`,
      [storeId, productId],
    );
    if (!existsSP.rows[0]) {
      const { rows: prod } = await client.query(
        `SELECT price FROM "Product" WHERE id = $1;`,
        [productId],
      );
      await client.query(
        `INSERT INTO "StoreProduct"
           (id, "storeId", "productId", "retailPrice", "minOrderQty", "isActive")
         VALUES ($1, $2, $3, $4, 1, true);`,
        [cuid(), storeId, productId, prod[0].price],
      );
      console.log(`  + StoreProduct creado para productId=${productId}`);
    }
  }
}

console.log("\n✓ Demo de variaciones lista");
console.log("  → /admin/store-page → tab Variaciones");
console.log("  → /marketplace/main para ver el modal");

await client.end();
