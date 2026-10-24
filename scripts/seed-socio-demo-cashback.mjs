/**
 * seed-socio-demo-cashback.mjs — Siembra cashback REAL (ledger) para el socio
 * demo `user_demo_01` (tenant main), 6 meses, para previsualizar el panel con
 * datos reales. Reseed limpio: borra las entradas del demo y crea un ledger
 * cronológico coherente (balanceAfter acumulado).
 *
 * Uso: node -r dotenv/config scripts/seed-socio-demo-cashback.mjs dotenv_config_path=.env.local
 */
import pg from "pg";

const TENANT = "main";
const USER = "user_demo_01";

// Cashback mensual realista (~5% de S/360–820 de compra/mes).
const MONTHLY = [18.4, 31.9, 24.5, 41.2, 27.8, 12.6]; // más viejo → mes actual

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
const ssl = url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: url, ssl });

function monthStart(offsetMonthsAgo) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonthsAgo, 5, 12, 0, 0));
}

async function main() {
  await client.connect();

  const m = await client.query(
    `SELECT id FROM socio_memberships WHERE "tenantId"=$1 AND "userId"=$2 LIMIT 1`,
    [TENANT, USER],
  );
  if (m.rows.length === 0) {
    console.error(`No hay membership para ${USER} en ${TENANT}. Suscribí al demo primero.`);
    process.exit(1);
  }
  const membershipId = m.rows[0].id;

  // Reseed limpio.
  await client.query(
    `DELETE FROM socio_cashback_entries WHERE "tenantId"=$1 AND "userId"=$2`,
    [TENANT, USER],
  );

  let balance = 0;
  const n = MONTHLY.length;
  for (let i = 0; i < n; i++) {
    const amount = MONTHLY[i];
    balance = Math.round((balance + amount) * 100) / 100;
    const createdAt = monthStart(n - 1 - i); // más viejo primero
    await client.query(
      `INSERT INTO socio_cashback_entries
        (id, "membershipId", "tenantId", "userId", "orderId", "type", "amountSoles", "description", "balanceAfter", "createdAt")
       VALUES ('seed_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), $1, $2, $3, $4, 'earned', $5, $6, $7, $8)`,
      [
        membershipId,
        TENANT,
        USER,
        `ord-seed-${i}`,
        amount,
        `Cashback 5% · pedido del mes`,
        balance,
        createdAt.toISOString(),
      ],
    );
  }

  console.log(`OK: sembradas ${n} entradas reales de cashback. Balance final: S/ ${balance.toFixed(2)}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
