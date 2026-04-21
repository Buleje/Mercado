#!/usr/bin/env tsx
/**
 * db-sanity — verifica que el schema Prisma matchea la DB viva.
 *
 * Detecta: migrations pendientes, columnas que existen en schema pero no en DB
 * (o viceversa), tablas con drift.
 *
 * Uso:
 *   npx tsx scripts/db-sanity.ts
 *
 * Exit 0 — schema y DB sincronizados.
 * Exit 1 — drift detectado. STDOUT enumera diferencias.
 *
 * Pensado para CI (bloquea deploy si hay drift) y para on-call post-incident.
 *
 * Requiere DIRECT_URL accesible (no usa pgBouncer).
 */

import { spawnSync } from "node:child_process";

const DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DIRECT_URL) {
  console.error("db-sanity: DIRECT_URL o DATABASE_URL requerido. Abort.");
  process.exit(1);
}

function run(cmd: string, args: string[]) {
  return spawnSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: DIRECT_URL },
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

console.log("db-sanity: verificando schema Prisma vs DB...\n");

// 1. Validate schema syntax.
const validate = run("npx", ["prisma", "validate"]);
if (validate.status !== 0) {
  console.error("✗ prisma validate falló:");
  console.error(validate.stderr);
  process.exit(1);
}
console.log("✓ Schema Prisma syntax OK");

// 2. Migration status — ¿hay migrations pendientes?
const status = run("npx", ["prisma", "migrate", "status"]);
const statusOut = (status.stdout || "") + (status.stderr || "");
if (statusOut.includes("pending") || statusOut.includes("applied to the database") === false) {
  if (statusOut.toLowerCase().includes("have not yet been applied")) {
    console.error("✗ Migraciones pendientes sin aplicar:");
    console.error(statusOut);
    process.exit(1);
  }
}
console.log("✓ Migraciones al día");

// 3. Schema drift: prisma db pull en archivo temporal y diff contra schema actual.
//    `prisma migrate diff` es más preciso y no requiere ficheros temporales.
const diff = run("npx", [
  "prisma",
  "migrate",
  "diff",
  "--from-schema-datamodel",
  "prisma/schema.prisma",
  "--to-schema-datasource",
  "prisma/schema.prisma",
  "--exit-code",
]);

const diffOut = (diff.stdout || "") + (diff.stderr || "");

if (diff.status === 2) {
  console.error("✗ Schema drift detectado entre schema.prisma y DB:");
  console.error(diffOut);
  process.exit(1);
}
if (diff.status !== 0) {
  console.error("✗ prisma migrate diff falló:");
  console.error(diffOut);
  process.exit(1);
}

console.log("✓ Schema y DB sincronizados — sin drift\n");
console.log("✅ db-sanity OK");
process.exit(0);
