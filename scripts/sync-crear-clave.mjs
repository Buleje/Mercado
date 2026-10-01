// Crea la API key que usa el agente de sincronización de escritorio (ADR-307).
// Vía SQL raw, igual que create-qa-admin-raw.mjs, para esquivar el drift de Prisma.
//
// Uso: node -r dotenv/config scripts/sync-crear-clave.mjs [tenantSlug] [nombre]
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;

const tenantId = process.argv[2] ?? "main";
const nombre = process.argv[3] ?? "Sync de escritorio";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const client = new Client({ connectionString: url });
  await client.connect();

  const rawKey = "sk_" + crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 10);
  const id = crypto.randomUUID();

  await client.query(
    `INSERT INTO "ApiKey" (id, "tenantId", name, "keyPrefix", "keyHash", active, "createdAt")
     VALUES ($1, $2, $3, $4, $5, true, NOW())`,
    [id, tenantId, nombre, keyPrefix, keyHash]
  );

  await client.end();

  console.log("Clave creada para el tenant:", tenantId);
  console.log("  id     :", id);
  console.log("  prefijo:", keyPrefix);
  console.log("\nGuardala ahora, no se vuelve a mostrar:\n");
  console.log(rawKey);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
