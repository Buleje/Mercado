#!/usr/bin/env node
/**
 * pre-deploy-db-snapshot.mjs — PreToolUse hook para Skill(deploy) y Bash(prisma migrate).
 *
 * Crea un backup completo de la DB via pg_dump ANTES de cada deploy
 * o migración. Guarda en backups/db/ con timestamp + hash del schema.
 *
 * Requisitos:
 *  - DIRECT_URL en .env (no pooler — pg_dump no funciona con pooler)
 *  - pg_dump disponible en PATH
 *
 * Si DIRECT_URL no está disponible o pg_dump falla, AVISA pero no bloquea
 * (para no romper el flujo en desarrollo sin DB).
 *
 * Exit 0 = allow (con o sin backup)
 *
 * Referencia: ADR-026 Phase 3, Bloque 0.4
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

// ── Config ────────────────────────────────────────────────────────────────
const PROJECT_DIR = resolve(
  process.env.BSM_PROJECT_ROOT ||
  process.env.CLAUDE_PROJECT_DIR ||
  "."
);
const BACKUP_DIR = join(PROJECT_DIR, "backups", "db");
const MAX_BACKUPS = 30;

/**
 * Lee el input stdin del hook.
 */
function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Verifica si el hook debe activarse.
 */
function shouldActivate(input) {
  if (!input) return false;

  const toolName = input.tool_name || "";
  const skillName = (input.tool_input?.skill || "").toLowerCase();
  const command = (input.tool_input?.command || "").toLowerCase();

  // Activar para deploy
  if (toolName === "Skill" && ["deploy", "vercel-plugin:deploy"].includes(skillName)) {
    return true;
  }

  // Activar para prisma migrate
  if (toolName === "Bash" && command.includes("prisma migrate")) {
    return true;
  }

  return false;
}

/**
 * Limpia backups viejos (mantiene los últimos MAX_BACKUPS).
 */
function pruneOldBackups() {
  try {
    if (!existsSync(BACKUP_DIR)) return;
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".sql.gz") || f.endsWith(".sql"))
      .sort()
      .reverse();

    if (files.length <= MAX_BACKUPS) return;

    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      try {
        unlinkSync(join(BACKUP_DIR, f));
        process.stderr.write(`  🗑️ Backup viejo eliminado: ${f}\n`);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Genera hash corto del schema actual.
 */
function schemaHash() {
  try {
    const schema = readFileSync(join(PROJECT_DIR, "prisma", "schema.prisma"), "utf8");
    return createHash("sha256").update(schema).digest("hex").substring(0, 8);
  } catch {
    return "unknown";
  }
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();

if (!shouldActivate(input)) {
  process.exit(0);
}

process.stderr.write("\n📸 DB Snapshot — creando backup pre-deploy...\n");

// Verificar DIRECT_URL
const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  process.stderr.write("  ⚠️ DIRECT_URL no disponible — skip backup (dev mode?)\n");
  process.stderr.write("  💡 Para activar backups, configurar DIRECT_URL en .env\n\n");
  process.exit(0);
}

// Verificar pg_dump
try {
  execSync("which pg_dump 2>/dev/null || where pg_dump 2>nul", { stdio: "pipe" });
} catch {
  process.stderr.write("  ⚠️ pg_dump no encontrado en PATH — skip backup\n");
  process.stderr.write("  💡 Instalar PostgreSQL client tools para activar backups\n\n");
  process.exit(0);
}

// Crear directorio de backups
mkdirSync(BACKUP_DIR, { recursive: true });

// Generar nombre del backup
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const hash = schemaHash();
const backupFile = join(BACKUP_DIR, `${timestamp}_schema-${hash}.sql`);

// Ejecutar pg_dump
try {
  execSync(
    `pg_dump "${directUrl}" --format=plain --no-owner --no-acl > "${backupFile}"`,
    { timeout: 120000, stdio: ["pipe", "pipe", "pipe"] }
  );
  process.stderr.write(`  ✅ Backup creado: ${backupFile}\n`);

  // Comprimir si gzip disponible
  try {
    execSync(`gzip "${backupFile}"`, { timeout: 30000, stdio: "pipe" });
    process.stderr.write(`  ✅ Comprimido: ${backupFile}.gz\n`);
  } catch {
    process.stderr.write(`  ℹ️ gzip no disponible, backup sin comprimir\n`);
  }

  // Limpiar backups viejos
  pruneOldBackups();

  process.stderr.write(`  📊 Schema hash: ${hash}\n\n`);
} catch (e) {
  process.stderr.write(`  ❌ pg_dump falló: ${e.message?.substring(0, 200)}\n`);
  process.stderr.write(`  ⚠️ Continuando SIN backup — ten cuidado\n\n`);
}

process.exit(0);
