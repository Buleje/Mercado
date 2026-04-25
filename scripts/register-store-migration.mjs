import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import fs from "node:fs";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const name = "20260425000000_store_lat_lng_columns";
const sql = fs.readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const checksum = crypto.createHash("sha256").update(sql).digest("hex");
const id = crypto.randomUUID();
const now = new Date();

await c.query(
  `INSERT INTO "_prisma_migrations"
   (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
   VALUES ($1, $2, $3, $4, NULL, NULL, $3, 1)
   ON CONFLICT (id) DO NOTHING;`,
  [id, checksum, now, name],
);

const { rows } = await c.query(
  `SELECT migration_name, finished_at, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = $1;`,
  [name],
);
console.log("Registered:", rows);
await c.end();
