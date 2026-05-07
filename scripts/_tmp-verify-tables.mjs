import pg from "pg";
const { Client } = pg;
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const tables = [
  "Subscription", "subscriptions",
  "GiftCard", "gift_cards",
  "VendorApplication", "vendor_applications",
  "SocioMembership", "socio_memberships",
  "LiveSession", "live_sessions",
  "SocioBillingCycle", "socio_billing_cycles",
  "PageHero", "page_heroes",
];
for (const t of tables) {
  const { rows } = await c.query(`SELECT to_regclass($1) as exists`, [`public."${t}"`]);
  console.log(`${t}: ${rows[0].exists ? "✓ existe" : "✗ no existe"}`);
}
await c.end();
