// Resetea el passwordHash del Test Repartidor a su número de teléfono.
// Uso: node -r dotenv/config scripts/reset-test-partner-pwd.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const PHONE = "999333222";
const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) throw new Error("No DATABASE_URL");

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const hash = await bcrypt.hash(PHONE, 10);
const r = await c.query(
  `UPDATE "DeliveryPartner" SET "passwordHash" = $1, "isActive" = true WHERE phone = $2 RETURNING id, name, phone, "tenantId", "isActive"`,
  [hash, PHONE]
);
if (r.rows.length === 0) console.log("✗ partner no encontrado");
else console.log("✓ password reset:", r.rows[0]);
console.log(`📌 Credenciales: phone=${PHONE} / password=${PHONE}`);
await c.end();
