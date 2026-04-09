/**
 * scripts/verify-pg-indexes-ola1.ts
 *
 * PASO 0 del plan de migración de índices Ola 1 (TD-019/020/021).
 *
 * Lee DIRECT_URL de .env.local, conecta DIRECTO al Postgres de Supabase
 * (puerto 5432, sin pgBouncer) y consulta pg_indexes para reportar:
 *
 *   1. Cuáles de los 4 índices de TD-019/021 ya existen en producción
 *      (deberían existir según el schema, pero puede haber drift)
 *   2. Cuáles de los 4 compound indexes nuevos de TD-020 ya existen
 *      (deberían ser 0 — son nuevos)
 *   3. Si hay algún índice con prefijo `idx_%` en estado INVALID
 *      (restos de intentos previos fallidos con CONCURRENTLY)
 *
 * Es READ-ONLY: solo ejecuta SELECT, no crea ni borra nada.
 *
 * Run: npx tsx scripts/verify-pg-indexes-ola1.ts
 *
 * Prerrequisitos:
 *   - DIRECT_URL en .env.local (puerto 5432, no 6543)
 *   - `npm install pg` si aún no está (debería estar vía Prisma)
 *
 * Referencias:
 *   - docs/migration-plan-indices-ola1-2026-04-09.md
 *   - docs/adr/017-ola1-migrations-indices-strategy.md
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

// Cargar .env.local explícitamente (no asume cwd)
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const EXPECTED_INDEXES = {
  "TD-019 / TD-021 (deberían existir)": [
    { table: "WholesaleOrderItem", column: "productId" },
    { table: "WholesaleOrderItem", column: "wholesaleOrderId" },
    { table: "StoreProduct", column: "productId" },
    { table: "StorePermission", column: "userId" },
  ],
  "TD-020 (nuevos — no deberían existir)": [
    { table: "PurchaseOrder", columns: ["tenantId", "status"] },
    { table: "Payable", columns: ["tenantId", "status"] },
    { table: "NotificationLog", columns: ["tenantId", "createdAt"] },
    { table: "SupportTicket", columns: ["tenantId", "status"] },
  ],
};

const TARGET_TABLES = [
  "WholesaleOrderItem",
  "StoreProduct",
  "StorePermission",
  "PurchaseOrder",
  "Payable",
  "NotificationLog",
  "SupportTicket",
];

async function main() {
  console.log("🔍 PASO 0 — Verificación de índices Ola 1 contra producción\n");
  console.log("   Plan: docs/migration-plan-indices-ola1-2026-04-09.md");
  console.log("   ADR:  docs/adr/017-ola1-migrations-indices-strategy.md\n");

  // Preferencia: DIRECT_URL (puerto 5432) para consistencia con el plan de DDL.
  // Fallback: DATABASE_URL (pooler 6543) si el DNS del dispositivo no resuelve
  //          el subdominio directo `db.<project>.supabase.co` (común en Windows).
  // IMPORTANTE: este fallback SOLO es válido para el PASO 0 (SELECT read-only).
  //             Para los CREATE INDEX CONCURRENTLY reales hay que usar DIRECT_URL
  //             sí o sí (pgbouncer transaction mode NO soporta CONCURRENTLY).
  const directUrl = process.env.DIRECT_URL;
  const poolerUrl = process.env.DATABASE_URL;

  if (!directUrl && !poolerUrl) {
    console.log("❌ Ni DIRECT_URL ni DATABASE_URL están configuradas en .env.local");
    process.exit(1);
  }

  // Importar pg dinámico
  let Client;
  try {
    Client = (await import("pg")).Client;
  } catch {
    console.log("❌ El paquete 'pg' no está instalado.");
    console.log("   Ejecutar: npm install pg @types/pg --save-dev");
    process.exit(1);
  }

  const candidates: Array<{ label: string; url: string }> = [];
  if (directUrl) candidates.push({ label: "DIRECT_URL (puerto 5432)", url: directUrl });
  if (poolerUrl) candidates.push({ label: "DATABASE_URL (pooler 6543)", url: poolerUrl });

  let client: InstanceType<typeof Client> | null = null;
  let lastError: string = "";
  for (const candidate of candidates) {
    const masked = candidate.url.replace(/:[^@]+@/, ":***@");
    console.log(`🔌 Intentando conectar via ${candidate.label} → ${masked}`);
    // Supabase usa certificado de AWS RDS que pg no valida por default.
    // rejectUnauthorized: false NO desactiva SSL — la conexión sigue encriptada,
    // solo relaja la validación de la cadena de certificados. Patrón estándar
    // Supabase + node-postgres documentado.
    const attempt = new Client({
      connectionString: candidate.url,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await attempt.connect();
      client = attempt;
      console.log(`✅ Conexión establecida via ${candidate.label}\n`);
      break;
    } catch (err) {
      lastError = (err as Error).message;
      console.log(`   ⚠️  Falló: ${lastError}`);
      try {
        await attempt.end();
      } catch {
        // ignore
      }
    }
  }

  if (!client) {
    console.log("\n❌ No se pudo conectar a Postgres con ninguna de las URLs.");
    console.log(`   Último error: ${lastError}`);
    console.log("   Posibles causas:");
    console.log("   - Password de Supabase rotada (verificar .env.local)");
    console.log("   - IP del dispositivo bloqueada en Supabase (IP allowlist)");
    console.log("   - DNS del dispositivo no resuelve el subdominio directo");
    console.log("     (usar resolver custom 1.1.1.1 o correr el script en CI)");
    process.exit(1);
  }

  // 1. Listar TODOS los índices de las tablas target
  const tablesList = TARGET_TABLES.map((t) => `'${t}'`).join(", ");
  const indexesRes = await client.query(
    `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE tablename IN (${tablesList})
       AND schemaname = 'public'
     ORDER BY tablename, indexname;`
  );

  console.log(`📊 Índices existentes en las 7 tablas target (${indexesRes.rows.length} encontrados):\n`);
  let currentTable = "";
  for (const row of indexesRes.rows) {
    if (row.tablename !== currentTable) {
      currentTable = row.tablename;
      console.log(`  ── ${currentTable} ──`);
    }
    console.log(`    · ${row.indexname}`);
    console.log(`      ${row.indexdef}`);
  }
  console.log("");

  // 2. Detectar índices INVALID con prefijo idx_
  const invalidRes = await client.query(
    `SELECT c.relname AS indexname, t.relname AS tablename
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_class t ON t.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE i.indisvalid = false
       AND n.nspname = 'public'
       AND c.relname LIKE 'idx_%';`
  );

  if (invalidRes.rows.length > 0) {
    console.log(`🚨 ALERTA: ${invalidRes.rows.length} índice(s) en estado INVALID detectados:`);
    for (const row of invalidRes.rows) {
      console.log(`   · ${row.tablename}.${row.indexname}`);
      console.log(`     Limpiar con: DROP INDEX CONCURRENTLY "${row.indexname}";`);
    }
    console.log("");
  } else {
    console.log("✅ Ningún índice INVALID con prefijo idx_ (limpio)\n");
  }

  // 3. Reporte del diff schema vs prod
  console.log("📋 Diff contra el plan de migración:\n");

  const indexesByTable = new Map<string, Array<{ name: string; def: string }>>();
  for (const row of indexesRes.rows) {
    const arr = indexesByTable.get(row.tablename) || [];
    arr.push({ name: row.indexname, def: row.indexdef });
    indexesByTable.set(row.tablename, arr);
  }

  let needsCreate: string[] = [];
  let alreadyExists: string[] = [];

  // TD-019 / TD-021 (deberían existir en el schema)
  for (const entry of EXPECTED_INDEXES["TD-019 / TD-021 (deberían existir)"]) {
    const idxs = indexesByTable.get(entry.table) || [];
    const found = idxs.find((i) =>
      i.def.toLowerCase().includes(`(${'"'}${entry.column.toLowerCase()}${'"'})`)
      || i.def.toLowerCase().includes(`(${entry.column.toLowerCase()})`)
    );
    const label = `${entry.table}.${entry.column}`;
    if (found) {
      alreadyExists.push(`${label} → ${found.name}`);
    } else {
      needsCreate.push(`${label}  ⚠️  FALTA (está en schema.prisma pero no en prod → schema drift)`);
    }
  }

  // TD-020 (nuevos — no deberían existir)
  for (const entry of EXPECTED_INDEXES["TD-020 (nuevos — no deberían existir)"]) {
    const idxs = indexesByTable.get(entry.table) || [];
    const signature = entry.columns.map((c) => c.toLowerCase()).join(", ");
    const found = idxs.find((i) => {
      const defLower = i.def.toLowerCase();
      return entry.columns.every((col) => defLower.includes(col.toLowerCase()));
    });
    const label = `${entry.table}(${entry.columns.join(", ")})`;
    if (found) {
      alreadyExists.push(`${label} → ${found.name} (ya existe — saltar en SQL)`);
    } else {
      needsCreate.push(`${label}  ✨ Crear nuevo`);
    }
  }

  console.log("  Índices que YA EXISTEN:");
  if (alreadyExists.length === 0) {
    console.log("    (ninguno)");
  } else {
    for (const line of alreadyExists) console.log(`    ✅ ${line}`);
  }

  console.log("\n  Índices que FALTAN en producción:");
  if (needsCreate.length === 0) {
    console.log("    (ninguno — todo al día)");
  } else {
    for (const line of needsCreate) console.log(`    ${line}`);
  }

  console.log("\n📌 Próximo paso:");
  if (needsCreate.length === 0) {
    console.log("   Nada que hacer. Las 7 tablas target ya tienen todos los índices.");
    console.log("   TD-019, TD-020, TD-021 pueden cerrarse sin SQL adicional.");
  } else {
    console.log("   1. Revisar la lista de 'FALTA' arriba");
    console.log("   2. Editar scripts/ola1-indices.sql comentando los índices que YA existen");
    console.log("   3. Ejecutar el SQL vía Supabase Dashboard SQL Editor o psql \"$DIRECT_URL\" -f scripts/ola1-indices.sql");
    console.log("   4. Re-ejecutar este verify para confirmar que todo quedó creado");
  }

  await client.end();
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
