#!/usr/bin/env node
/**
 * scripts/check-marketplace-prisma-direct.mjs
 *
 * GUARD CI — bloquea NUEVOS endpoints en `app/api/marketplace/**` que
 * usen `prisma.<modelo>.<query>` directo sin documentar.
 *
 * Razón: regla #1 CLAUDE.md "Nunca prisma.* directo — usar lib/db/*.db.ts".
 * Cada query directa bypasea cache + audit + posible cross-tenant.
 *
 * Excepciones permitidas: el archivo debe contener un comentario
 * `@prisma-direct` o `@cross-tenant` que documente la razón. Migrar
 * a `lib/db/*` es la dirección preferida.
 *
 * Uso:
 *   node scripts/check-marketplace-prisma-direct.mjs       # falla si hay regresiones
 *   node scripts/check-marketplace-prisma-direct.mjs --json  # output JSON
 *
 * Integración pre-commit / CI: agregar a `.husky/pre-commit` o GitHub Actions.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_DIR = path.join(ROOT, "app", "api", "marketplace");

const PRISMA_DIRECT_REGEX =
  /\bprisma\.(order|orderItem|product|store|customer|coupon|review|notification|cart|tenant|productImage|productVariant|payment|delivery|chat|message|adminUser|live|liveSession|cashierOrder|deliveryAddress|driverApplication|conversation)\.(findMany|findFirst|findUnique|create|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\b/g;

const ANNOTATION_REGEX = /@(prisma-direct|cross-tenant)\b/;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const violations = [];
const annotated = [];

for (const file of walk(TARGET_DIR)) {
  const content = fs.readFileSync(file, "utf8");
  const hits = [...content.matchAll(PRISMA_DIRECT_REGEX)];
  if (hits.length === 0) continue;
  const isAnnotated = ANNOTATION_REGEX.test(content);
  const rel = path.relative(ROOT, file);
  if (isAnnotated) {
    annotated.push({ file: rel, count: hits.length });
  } else {
    violations.push({
      file: rel,
      count: hits.length,
      samples: hits.slice(0, 3).map((m) => m[0]),
    });
  }
}

const json = process.argv.includes("--json");

if (json) {
  console.log(JSON.stringify({ violations, annotated }, null, 2));
} else {
  console.log("=== marketplace/ prisma directo guard ===\n");
  if (annotated.length > 0) {
    console.log(`✓ ${annotated.length} archivos con prisma directo DOCUMENTADO (@cross-tenant / @prisma-direct):`);
    for (const a of annotated) console.log(`   ${a.count}x  ${a.file}`);
    console.log("");
  }
  if (violations.length === 0) {
    console.log("✅ Todos los endpoints marketplace cumplen la regla.");
    process.exit(0);
  }
  console.error(`❌ ${violations.length} archivo(s) con prisma directo SIN documentar:\n`);
  for (const v of violations) {
    console.error(`   ${v.count}x  ${v.file}`);
    for (const s of v.samples) console.error(`        └─ ${s}`);
  }
  console.error(
    "\n📋 Acción: migrá a lib/db/*.db.ts, o si la operación es legítima " +
    "(read público cross-tenant, write admin con tenantId scope explícito), " +
    "agregá un comentario `@cross-tenant intentional: <razón>` o " +
    "`@prisma-direct ok: <razón>` en el archivo.\n",
  );
  process.exit(1);
}
