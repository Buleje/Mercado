// Prende/apaga `spec:forestal:tramites` para el tenant main (ADR-308).
// Mismo patrón que toggle-spec-lotes.mjs: TenantFeatureFlag, sin migración.
import dotenv from "dotenv"; import pg from "pg";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
const mode = process.argv[2] ?? "on";
if (mode === "on") {
  await c.query(`INSERT INTO "TenantFeatureFlag"("id","tenantId","flagKey","enabled") VALUES(gen_random_uuid(),'main','spec:forestal:tramites',true) ON CONFLICT ("tenantId","flagKey") DO UPDATE SET enabled=true`);
  console.log("spec forestal:tramites ENABLED for main");
} else {
  await c.query(`DELETE FROM "TenantFeatureFlag" WHERE "tenantId"='main' AND "flagKey"='spec:forestal:tramites'`);
  console.log("spec forestal:tramites removed for main");
}
const r = await c.query(`SELECT "flagKey","enabled" FROM "TenantFeatureFlag" WHERE "tenantId"='main' AND "flagKey" LIKE 'spec:forestal:%'`);
console.log("forestal specs en main:", r.rows.map(x=>`${x.flagKey}=${x.enabled}`).join(", "));
await c.end();
