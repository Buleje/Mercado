// Crea superadmin QA vía SQL raw.
// Uso: node -r dotenv/config scripts/create-superadmin-qa.mjs dotenv_config_path=.env.local
import pg from "pg";
import bcrypt from "bcryptjs";

const USER = "superadmin";
const PASS = "Super2026!";

const { Client } = pg;

const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) throw new Error("No DATABASE_URL");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// Crear tabla si no existe (schema drift recovery)
await client.query(`
  CREATE TABLE IF NOT EXISTS "SuperadminUser" (
    id              TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    "passwordHash"  TEXT NOT NULL,
    "totpSecret"    TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastLoginAt"   TIMESTAMP(3),
    active          BOOLEAN NOT NULL DEFAULT true,
    name            TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "SuperadminUser_username_idx" ON "SuperadminUser"(username);
`);
console.log("✅ Tabla SuperadminUser asegurada");

const hash = await bcrypt.hash(PASS, 10);

// Check si existe
const { rows } = await client.query(
  `SELECT id, username FROM "SuperadminUser" WHERE username = $1`,
  [USER],
);

if (rows.length > 0) {
  await client.query(
    `UPDATE "SuperadminUser" SET "passwordHash" = $1, active = true WHERE username = $2`,
    [hash, USER],
  );
  console.log(`✅ Updated existing: ${USER}`);
} else {
  const id = `cuid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await client.query(
    `INSERT INTO "SuperadminUser" (id, username, "passwordHash", active, name, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
    [id, USER, hash, "QA Super Admin"],
  );
  console.log(`✅ Created: ${USER}`);
}

console.log(`📌 Credentials: ${USER} / ${PASS}`);
await client.end();
