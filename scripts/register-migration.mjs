import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const content = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = content.match(/^DATABASE_URL=(.+)$/m)[1].replace(/^["']|["']$/g, '').trim();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `SELECT id FROM _prisma_migrations WHERE migration_name = '20260328000000_add_prestamos_guia_new_fields'`
);

if (rows.length > 0) {
  console.log('✅ Ya registrada en historial de Prisma');
} else {
  await client.query(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (gen_random_uuid()::text, 'manual-applied', NOW(), '20260328000000_add_prestamos_guia_new_fields', NULL, NULL, NOW(), 1)
  `);
  console.log('✅ Migración registrada en historial de Prisma');
}

await client.end();
