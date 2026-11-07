/**
 * ADR-299 fase 2 — Backfill one-time.
 *
 * Copia los campos COMPARTIDOS que hoy viven solo en TenantStorePage →
 * settings.storeThemeJson (la fuente de verdad del storefront), SOLO donde
 * storeTheme está vacío (NUNCA pisa). Idempotente.
 *
 * Por qué: hasta ahora se podía editar Hero/Colores/Contacto en "Mi tienda
 * pública" (TenantStorePage); con los write-throughs los cambios NUEVOS ya
 * convergen a storeTheme, pero los valores VIEJOS quedaron solo en
 * TenantStorePage. Este backfill los sube a storeTheme para poder, en fase 4,
 * eliminar la cadena de fallback del storefront.
 *
 * Uso:
 *   node scripts/backfill-storetheme-from-storepage.cjs           (DRY-RUN, read-only)
 *   node scripts/backfill-storetheme-from-storepage.cjs --apply   (escribe)
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
// [columna TenantStorePage, clave storeTheme]
const MAP = [
  ["heroTitle", "heroTitle"],
  ["heroSubtitle", "heroSubtitle"],
  ["heroImageUrl", "heroImage"],
  ["heroCtaLabel", "heroCTA"],
  ["primaryColor", "primaryColor"],
  ["accentColor", "accentColor"],
  ["whatsappPhone", "whatsapp"],
  ["contactEmail", "email"],
  ["address", "address"],
];
const isEmpty = (v) =>
  v == null ||
  (typeof v === "string" && (v.trim() === "" || v.trim().startsWith("var(")));

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
  await c.connect();
  const rows = (
    await c.query(`
      SELECT sp."tenantId", t.slug,
             sp."heroTitle", sp."heroSubtitle", sp."heroImageUrl", sp."heroCtaLabel",
             sp."primaryColor", sp."accentColor", sp."whatsappPhone", sp."contactEmail", sp."address",
             s."storeThemeJson"
      FROM "TenantStorePage" sp
      JOIN "Tenant" t ON t.id = sp."tenantId"
      LEFT JOIN "Settings" s ON s."tenantId" = sp."tenantId"
    `)
  ).rows;

  let changed = 0;
  let noSettings = 0;
  for (const r of rows) {
    let theme = {};
    try {
      theme = r.storeThemeJson ? JSON.parse(r.storeThemeJson) : {};
    } catch {
      theme = {};
    }
    const patch = {};
    for (const [col, key] of MAP) {
      if (!isEmpty(r[col]) && isEmpty(theme[key])) patch[key] = r[col];
    }
    if (Object.keys(patch).length === 0) continue;
    changed++;
    console.log(`[${r.slug}] ${APPLY ? "APPLY" : "DRY"}: ${JSON.stringify(patch)}`);
    if (APPLY) {
      const merged = { ...theme, ...patch };
      const res = await c.query(
        `UPDATE "Settings" SET "storeThemeJson"=$2, "updatedAt"=now() WHERE "tenantId"=$1`,
        [r.tenantId, JSON.stringify(merged)],
      );
      if (res.rowCount === 0) {
        noSettings++;
        console.log(`  ⚠️  [${r.slug}] sin fila Settings → no actualizado (el storefront ya cae al fallback de TenantStorePage)`);
      }
    }
  }
  console.log(
    `\n${changed}/${rows.length} tenant(s) con store-page ${APPLY ? "actualizados" : "a actualizar"}.` +
      (noSettings ? ` (${noSettings} sin fila Settings)` : ""),
  );
  if (!APPLY && changed > 0) console.log("→ Corré con --apply para escribir.");
  await c.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
