import dotenv from "dotenv"; import pg from "pg";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const mode = process.argv[2];
if (mode === "on") {
  await c.query(`INSERT INTO "TenantFeatureFlag"("id","tenantId","flagKey","enabled") VALUES(gen_random_uuid(),'main','spec:agricola:cacao-acopio',true) ON CONFLICT ("tenantId","flagKey") DO UPDATE SET enabled=true`);
  console.log("spec cacao ENABLED for main");
} else {
  await c.query(`DELETE FROM "TenantFeatureFlag" WHERE "tenantId"='main' AND "flagKey"='spec:agricola:cacao-acopio'`);
  console.log("spec cacao removed for main");
}
await c.end();
