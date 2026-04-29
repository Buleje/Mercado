/**
 * Fix branding "Bodega San Martin" → "Buleje" en tenant `main`.
 *
 * Origen del bug: Settings.storeThemeJson.storeName == "Bodega San Martin"
 * (legacy del seed inicial). Settings.businessName está vacío. Esto hace que
 * el helper resolveStoreContext() devuelva "Bodega San Martin" en /buscar,
 * /tienda y los modals "Bienvenido a {storeName}".
 *
 * Tocamos SOLO el tenant `main`. Otros tenants (luis, tienda-3, mi-pollo)
 * son cuentas separadas y mantienen su nombre real.
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TENANT_ID = "main";
const NEW_NAME = "Buleje";
const NEW_SLOGAN = "Tu bodega del barrio en tu bolsillo";
const NEW_RAZON_SOCIAL = "Buleje";

try {
  // 1) Leer estado actual
  const before = await pool.query(
    `SELECT "businessName", "razonSocial", "storeThemeJson" FROM "Settings" WHERE "tenantId" = $1`,
    [TENANT_ID],
  );
  if (before.rowCount === 0) {
    console.error(`[ERROR] No Settings row for tenantId=${TENANT_ID}`);
    process.exit(1);
  }
  const row = before.rows[0];
  const themeBefore = JSON.parse(row.storeThemeJson || "{}");
  console.log("=== ANTES ===");
  console.log({ businessName: row.businessName, razonSocial: row.razonSocial, storeName: themeBefore.storeName, slogan: themeBefore.slogan });

  // 2) Mutar el theme JSON
  const themeAfter = {
    ...themeBefore,
    storeName: NEW_NAME,
    slogan: NEW_SLOGAN,
    welcomePopupTitle: `Bienvenido a ${NEW_NAME}!`,
  };

  // 3) UPDATE atómico
  await pool.query(
    `UPDATE "Settings"
       SET "businessName" = $1,
           "razonSocial" = $2,
           "storeThemeJson" = $3
     WHERE "tenantId" = $4`,
    [NEW_NAME, NEW_RAZON_SOCIAL, JSON.stringify(themeAfter), TENANT_ID],
  );

  // 4) Verificar
  const after = await pool.query(
    `SELECT "businessName", "razonSocial", "storeThemeJson"::jsonb->>'storeName' as theme_name, "storeThemeJson"::jsonb->>'slogan' as theme_slogan FROM "Settings" WHERE "tenantId" = $1`,
    [TENANT_ID],
  );
  console.log("\n=== DESPUES ===");
  console.log(after.rows[0]);

  // 5) Invalidar caché del helper (queda el comentario para Brandon — el cache es per-request, expira solo)
  console.log("\n[OK] Settings actualizado. La caché de SettingsDB es per-request, así que el siguiente reload del front lo refleja.");
} catch (err) {
  console.error("[ERROR]", err);
  process.exit(1);
} finally {
  await pool.end();
}
