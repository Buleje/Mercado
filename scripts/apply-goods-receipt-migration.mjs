// Aplica scripts/goods-receipt-migration.sql. Intenta DIRECT_URL (mejor para DDL)
// y cae a DATABASE_URL (pooler) si el directo no resuelve.
// Uso: node --env-file=.env.local scripts/apply-goods-receipt-migration.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';
const { Client } = pg;

const sql = readFileSync(new URL('./goods-receipt-migration.sql', import.meta.url), 'utf8');

async function run(url, label) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(sql);
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='GoodsReceipt' ORDER BY ordinal_position`);
    console.log('[' + label + '] OK — GoodsReceipt columnas: ' + rows.map(r => r.column_name).join(', '));
  } finally { await c.end(); }
}

const direct = process.env.DIRECT_URL;
const pooler = process.env.DATABASE_URL;
try {
  if (direct) { await run(direct, 'DIRECT_URL'); }
  else { await run(pooler, 'DATABASE_URL(pooler)'); }
} catch (e) {
  console.warn('DIRECT_URL falló (' + (e.message || e) + '); reintentando con pooler...');
  await run(pooler, 'DATABASE_URL(pooler)');
}
