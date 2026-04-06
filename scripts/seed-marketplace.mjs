import 'dotenv/config';

// Prisma 7 generates TS — use direct pg to seed
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const STORES = [
  {
    slug: "bodega-juanita",
    name: "Bodega Juanita",
    description: "La bodega de toda la vida en el corazón de Pucallpa. Abarrotes, bebidas y productos frescos para toda la familia.",
    category: "bodega",
    zone: "centro",
    rating: 4.7,
    reviewCount: 48,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "minimarket-los-angeles",
    name: "Minimarket Los Ángeles",
    description: "Todo lo que necesitas en un solo lugar. Abarrotes, licores, productos de limpieza y mucho más.",
    category: "minimarket",
    zone: "yarinacocha",
    rating: 4.3,
    reviewCount: 32,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "fruteria-tropical",
    name: "Frutería Tropical",
    description: "Las mejores frutas frescas de la selva peruana. Aguaje, camu camu, cocona y más frutas exóticas.",
    category: "fruteria",
    zone: "calleria",
    rating: 4.9,
    reviewCount: 67,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "carniceria-el-paisa",
    name: "Carnicería El Paisa",
    description: "Carnes frescas de primera calidad. Res, pollo, cerdo y embutidos. Cortes especiales a pedido.",
    category: "carniceria",
    zone: "manantay",
    rating: 4.5,
    reviewCount: 23,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "panaderia-san-martin",
    name: "Panadería San Martín",
    description: "Pan artesanal todos los días. Panes, tortas, empanadas y pasteles hechos con amor.",
    category: "panaderia",
    zone: "centro",
    rating: 4.8,
    reviewCount: 89,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "licoreria-party",
    name: "Licorería Party House",
    description: "La mejor selección de licores nacionales e importados. Cervezas artesanales, vinos y más.",
    category: "licoreria",
    zone: "yarinacocha",
    rating: 4.1,
    reviewCount: 15,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "farmacia-salud-plus",
    name: "Farmacia Salud Plus",
    description: "Medicamentos genéricos y de marca. Productos de cuidado personal y bienestar.",
    category: "farmacia",
    zone: "centro",
    rating: 4.6,
    reviewCount: 41,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "bodega-don-pepe",
    name: "Bodega Don Pepe",
    description: "Precios bajos todos los días. Abarrotes al por mayor y menor para tu hogar.",
    category: "bodega",
    zone: "campo_verde",
    rating: 4.2,
    reviewCount: 19,
    isPublished: true,
    commission: 5.0,
  },
  {
    slug: "restaurante-la-choza",
    name: "Restaurante La Choza",
    description: "Comida amazónica auténtica. Juanes, tacacho, cecina y los mejores platos de nuestra selva.",
    category: "restaurante",
    zone: "calleria",
    rating: 4.8,
    reviewCount: 112,
    isPublished: true,
    commission: 5.0,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    // Get existing tenant
    const { rows: tenants } = await client.query(
      `SELECT id, slug FROM "Tenant" WHERE active = true LIMIT 1`
    );
    if (tenants.length === 0) {
      console.log("No active tenants found.");
      return;
    }
    const tenantId = tenants[0].id;
    console.log(`Using tenant: ${tenants[0].slug} (${tenantId})`);

    let created = 0;
    let skipped = 0;

    for (const store of STORES) {
      const { rows: existing } = await client.query(
        `SELECT id FROM "Store" WHERE slug = $1`,
        [store.slug]
      );
      if (existing.length > 0) {
        console.log(`  ⏭ ${store.slug} already exists`);
        skipped++;
        continue;
      }

      const id = `seed_${store.slug.replace(/-/g, '_')}_${Date.now()}`;
      await client.query(
        `INSERT INTO "Store" (id, "tenantId", slug, name, description, category, zone, rating, "reviewCount", "isPublished", commission, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [id, tenantId, store.slug, store.name, store.description, store.category, store.zone, store.rating, store.reviewCount, store.isPublished, store.commission]
      );
      console.log(`  ✅ Created: ${store.name} (${store.category}, ${store.zone})`);
      created++;
    }

    // Update existing 'demo' store to be published
    await client.query(
      `UPDATE "Store" SET "isPublished" = true, description = 'La tienda demo del sistema marketplace.', zone = 'centro', rating = 4.0, "reviewCount" = 5, "updatedAt" = NOW() WHERE slug = 'demo' AND "isPublished" = false`
    );

    console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) as total FROM "Store" WHERE "isPublished" = true`
    );
    console.log(`Total published stores: ${countRows[0].total}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
