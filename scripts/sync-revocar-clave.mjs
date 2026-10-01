// Revoca (desactiva) una API key del agente de sincronización por su prefijo.
// Uso: node -r dotenv/config scripts/sync-revocar-clave.mjs sk_xxxxxxx
import pg from "pg";

const { Client } = pg;
const prefijo = process.argv[2];

if (!prefijo) {
  console.error("Uso: node -r dotenv/config scripts/sync-revocar-clave.mjs <prefijo sk_…>");
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const client = new Client({ connectionString: url });
  await client.connect();

  const res = await client.query(
    `UPDATE "ApiKey" SET active = false WHERE "keyPrefix" = $1 AND active = true`,
    [prefijo]
  );

  await client.end();
  console.log(`Claves revocadas: ${res.rowCount}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
