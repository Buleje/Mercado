#!/usr/bin/env node
/**
 * check-schema-drift.mjs
 *
 * Compara prisma/schema.prisma vs columnas reales en la DB Supabase.
 * Reporta:
 *   - Columnas declaradas en schema.prisma pero faltantes en DB (causa 503 silencioso)
 *   - Columnas en DB pero no en schema.prisma (orphan / lectura segura)
 *   - Enums declarados en schema.prisma con valores faltantes en DB
 *
 * Uso:
 *   node -r dotenv/config scripts/check-schema-drift.mjs dotenv_config_path=.env.local
 *
 * Exit codes:
 *   0 → sin drift
 *   1 → drift detectado en columnas faltantes (bloqueante en CI)
 *   2 → solo orphans / warnings (no bloqueante)
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

// Tipos primitivos de Prisma. Cualquier otro tipo → relación → skip.
const PRIMITIVE_TYPES = new Set([
  "String", "Int", "BigInt", "Float", "Decimal", "Boolean",
  "DateTime", "Json", "Bytes",
]);

const COLOR = {
  reset: "\x1b[0m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};
const c = (color, s) => `${COLOR[color]}${s}${COLOR.reset}`;

function parseSchema(schemaPath) {
  const text = fs.readFileSync(schemaPath, "utf8");
  const lines = text.split("\n");

  const models = new Map(); // name -> Set<columnName>
  const enums = new Map();  // name -> Set<value>

  let mode = null;          // 'model' | 'enum' | null
  let currentName = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;

    if (mode === null) {
      const m = line.match(/^model\s+(\w+)\s*\{/);
      if (m) { mode = "model"; currentName = m[1]; models.set(currentName, new Set()); continue; }
      const e = line.match(/^enum\s+(\w+)\s*\{/);
      if (e) { mode = "enum"; currentName = e[1]; enums.set(currentName, new Set()); continue; }
      continue;
    }

    if (line === "}") { mode = null; currentName = null; continue; }

    if (mode === "enum") {
      // Línea típica: `pendiente` o `pendiente // comentario`
      const ev = line.split(/\s|\/\//)[0].trim();
      if (ev) enums.get(currentName).add(ev);
      continue;
    }

    // mode === "model"
    if (line.startsWith("@@")) continue;        // index/unique/map → no es columna

    // Patrón: <name> <Type>[?][[]] [...]
    // Ej: "id String @id @default(cuid())"
    //     "primaryColor String @default(\"#00B4A6\")"
    //     "stores Store[]"   ← relación array, skip
    //     "tenant Tenant @relation(...)" ← relación obj, skip
    const fm = line.match(/^(\w+)\s+([A-Za-z_]\w*)(\?|\[\])?\s*(.*)$/);
    if (!fm) continue;
    const [, name, type, modifier, rest] = fm;

    // Skip arrays (siempre relaciones inversas en Prisma — nunca son columnas)
    if (modifier === "[]") continue;

    // Si el tipo no es primitivo Y no tiene @relation explícito => puede ser
    // un escalar enum (ej. status OrderStatus). Esos SÍ son columnas. Pero
    // si tiene @relation o el tipo es PascalCase de un modelo → relación.
    if (!PRIMITIVE_TYPES.has(type)) {
      // Si rest contiene @relation, es relación obj → skip
      if (/@relation\b/.test(rest)) continue;
      // Si el tipo coincide con un modelo ya parseado, es relación → skip.
      // Pero si es enum (parseado como enum más adelante), SÍ es columna.
      // No sabemos aún si es enum vs model. Lo agregamos como "posible columna"
      // y luego en el segundo pase filtramos.
      // Para evitar falsos positivos, tratamos ambos casos al final.
    }

    models.get(currentName).add(name);
  }

  // Segundo pase: filtrar de cada model los nombres que en realidad son
  // relaciones (porque su tipo es un model). Reabrimos para hacerlo limpio.
  // Estrategia: re-parsear y descartar si el tipo aparece en `models` (post-loop).
  // Tambien capturar @@map("table_name") y @map("column_name") para
  // resolver el nombre real en DB (Prisma soporta snake_case via map).
  const finalModels = new Map();          // dbTableName -> Set<dbColName>
  const modelToTable = new Map();         // PrismaModelName -> dbTableName
  let mode2 = null;
  let cur2 = null;
  let curDbTable = null;
  let curCols = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    if (mode2 === null) {
      const m = line.match(/^model\s+(\w+)\s*\{/);
      if (m) {
        mode2 = "model"; cur2 = m[1];
        curDbTable = m[1];                // default = model name
        curCols = new Set();
        continue;
      }
      continue;
    }
    if (mode2 === "model") {
      if (line === "}") {
        finalModels.set(curDbTable, curCols);
        modelToTable.set(cur2, curDbTable);
        mode2 = null; cur2 = null; curDbTable = null; curCols = null;
        continue;
      }
      // Capturar @@map("nombre_real")
      const mapMatch = line.match(/^@@map\s*\(\s*"([^"]+)"\s*\)/);
      if (mapMatch) { curDbTable = mapMatch[1]; continue; }
      if (line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+([A-Za-z_]\w*)(\?|\[\])?\s*(.*)$/);
      if (!fm) continue;
      const [, name, type, modifier, rest] = fm;
      if (modifier === "[]") continue;
      if (/@relation\b/.test(rest)) continue;
      // Si type es modelo conocido → relación obj → skip
      if (models.has(type)) continue;
      // Si tiene @map("col_real"), usar ese nombre en lugar del Prisma
      const colMap = rest.match(/@map\s*\(\s*"([^"]+)"\s*\)/);
      curCols.add(colMap ? colMap[1] : name);
    }
  }

  return { models: finalModels, enums, modelToTable };
}

async function fetchDbColumns(client) {
  const { rows } = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.table_name)) map.set(r.table_name, new Set());
    map.get(r.table_name).add(r.column_name);
  }
  return map;
}

async function fetchDbEnums(client) {
  const { rows } = await client.query(`
    SELECT t.typname AS enum_name, e.enumlabel AS value
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.enum_name)) map.set(r.enum_name, new Set());
    map.get(r.enum_name).add(r.value);
  }
  return map;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(c("red", "❌ DATABASE_URL no configurada en .env.local"));
    process.exit(1);
  }

  console.log(c("cyan", c("bold", "🔎 Schema drift check")));
  console.log(c("dim", `   schema: prisma/schema.prisma`));
  console.log(c("dim", `   db:     Supabase pgBouncer`));
  console.log("");

  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
  const { models: schemaModels, enums: schemaEnums } = parseSchema(schemaPath);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const dbColumns = await fetchDbColumns(client);
  const dbEnums   = await fetchDbEnums(client);
  await client.end();

  let missingColumns = 0;
  let orphanColumns  = 0;
  let missingEnumVals = 0;
  let modelsWithoutTable = 0;

  for (const [model, cols] of schemaModels) {
    const dbCols = dbColumns.get(model);
    if (!dbCols) {
      console.log(c("red", `❌ Tabla "${model}" declarada en schema pero NO existe en DB`));
      modelsWithoutTable++;
      continue;
    }
    const missing = [...cols].filter((c) => !dbCols.has(c));
    const orphan  = [...dbCols].filter((c) => !cols.has(c));

    if (missing.length > 0) {
      missingColumns += missing.length;
      console.log(c("red", `❌ ${model}: faltan en DB → ${missing.join(", ")}`));
    }
    if (orphan.length > 0) {
      orphanColumns += orphan.length;
      console.log(c("yellow", `⚠  ${model}: en DB pero NO en schema → ${orphan.join(", ")}`));
    }
  }

  for (const [enumName, vals] of schemaEnums) {
    const dbVals = dbEnums.get(enumName);
    if (!dbVals) {
      console.log(c("red", `❌ Enum "${enumName}" declarado en schema pero NO existe en DB`));
      missingEnumVals++;
      continue;
    }
    const missing = [...vals].filter((v) => !dbVals.has(v));
    if (missing.length > 0) {
      missingEnumVals += missing.length;
      console.log(c("red", `❌ Enum ${enumName}: faltan valores → ${missing.join(", ")}`));
    }
  }

  console.log("");
  const totalIssues = missingColumns + missingEnumVals + modelsWithoutTable;

  if (totalIssues === 0 && orphanColumns === 0) {
    console.log(c("green", "✅ Sin drift — schema.prisma y DB sincronizados"));
    process.exit(0);
  }

  console.log(c("bold", "Resumen:"));
  console.log(`  ${c("red", `❌ ${missingColumns}`)} columnas faltantes en DB`);
  console.log(`  ${c("red", `❌ ${missingEnumVals}`)} valores de enum faltantes en DB`);
  console.log(`  ${c("red", `❌ ${modelsWithoutTable}`)} tablas faltantes en DB`);
  console.log(`  ${c("yellow", `⚠  ${orphanColumns}`)} columnas huerfanas en DB (no rompen pero deberian limpiarse)`);

  if (totalIssues > 0) {
    console.log("");
    console.log(c("yellow", "💡 Para arreglar: prisma migrate deploy con DIRECT_URL accesible,"));
    console.log(c("yellow", "   o aplicar manualmente las migrations sobrantes (ver scripts/apply-*.mjs)"));
    process.exit(1);
  } else {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(c("red", `FATAL: ${e.message}`));
  process.exit(1);
});
