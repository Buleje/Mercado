import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(`SELECT migration_name, finished_at, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = $1;`, ["20260425000000_store_lat_lng_columns"]);
console.log("Migration status:", rows.length === 0 ? "NOT REGISTERED" : rows);
await c.end();
