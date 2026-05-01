/**
 * Seed: pone al "Test Repartidor" online con coordenadas en Pucallpa para que
 * pueda recibir offers del nuevo trigger DeliveryOffer.
 *
 * Uso: node -r dotenv/config scripts/seed-partner-online.mjs dotenv_config_path=.env.local
 */
import pg from "pg";

const PUCALLPA_CENTER = { lat: -8.3791, lng: -74.5539 };

const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) throw new Error("No DATABASE_URL");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const r = await client.query(
  `UPDATE "DeliveryPartner"
     SET "isOnline" = true,
         "isActive" = true,
         lat = $1,
         lng = $2,
         "lastPingAt" = NOW(),
         "currentOrderId" = NULL
   WHERE phone = '999333222'
   RETURNING id, name, phone, "tenantId", "isOnline", "isActive", lat, lng;`,
  [PUCALLPA_CENTER.lat, PUCALLPA_CENTER.lng],
);

if (r.rows.length === 0) {
  console.log("✗ partner 999333222 no encontrado");
  await client.end();
  process.exit(1);
}

console.log("✓ partner online + en Pucallpa:");
console.log(JSON.stringify(r.rows[0], null, 2));

await client.end();
