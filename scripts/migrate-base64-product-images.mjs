/**
 * Migración puntual: convierte imágenes base64 inline de Product.image a URLs
 * de Supabase Storage (bucket "media"). 3 productos pesan 574KB que viajan
 * inline en CADA respuesta del catálogo (/api/marketplace/catalog) → infla el
 * payload de inicio/marketplace ~63%. Mismo pipeline que app/api/upload/route.ts
 * (sharp → webp q82, max 1200px). Idempotente: salta lo que ya es URL.
 *
 * Backup del base64 original a scripts/.backup-base64-images.json (reversible).
 * Uso: node -r dotenv/config scripts/migrate-base64-product-images.mjs
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { writeFileSync } from "fs";

const DB_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DB_URL) throw new Error("DATABASE_URL no configurado");
if (!SUPA_URL || !SUPA_KEY) throw new Error("Supabase admin env vars faltan");

const BUCKET = "media";
const supabase = createClient(SUPA_URL, SUPA_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT id, "tenantId", name, image FROM "Product" WHERE image LIKE 'data:%' ORDER BY id`,
);
console.log(`Encontrados ${rows.length} productos con imagen base64.\n`);

// Backup reversible del estado original.
writeFileSync(
  "scripts/.backup-base64-images.json",
  JSON.stringify(rows.map((r) => ({ id: r.id, tenantId: r.tenantId, name: r.name, image: r.image })), null, 2),
);
console.log("Backup → scripts/.backup-base64-images.json\n");

let migrated = 0;
for (const r of rows) {
  const comma = r.image.indexOf(",");
  if (comma < 0) {
    console.log(`  ⊘ ${r.id} ${r.name}: data-URI mal formado, salto`);
    continue;
  }
  const raw = Buffer.from(r.image.slice(comma + 1), "base64");
  const optimized = await sharp(raw)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  // Path determinista por producto (sin Date.now() — reproducible y idempotente
  // con upsert:true para no acumular basura si se re-corre).
  const path = `${r.tenantId}/products/migrated-${r.id}.webp`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: true,
    });
  if (upErr) {
    console.log(`  ✗ ${r.id} ${r.name}: upload falló — ${upErr.message}`);
    continue;
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;

  await client.query(`UPDATE "Product" SET image = $1 WHERE id = $2`, [url, r.id]);
  migrated++;
  const before = (r.image.length / 1024).toFixed(0);
  const after = (optimized.length / 1024).toFixed(0);
  console.log(`  ✓ ${r.id} ${r.name}: base64 ${before}KB → webp ${after}KB`);
  console.log(`      ${url}`);
}

await client.end();
console.log(`\nListo: ${migrated}/${rows.length} migrados.`);
