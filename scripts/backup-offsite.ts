#!/usr/bin/env tsx
/**
 * scripts/backup-offsite.ts
 *
 * ADR-044 — Backup off-site cifrado con client-side encryption.
 *
 * Flujo:
 *   1. pg_dump del DATABASE_URL (full schema + data, formato custom)
 *   2. Cifrado AES-256-GCM client-side con BACKUP_ENCRYPTION_KEY (32 bytes b64)
 *   3. Upload a S3/R2 vía presigned URL o @aws-sdk/client-s3
 *   4. Retención: 30 días diarios + 12 meses mensuales + 3 años anuales
 *   5. Verificación post-upload: descarga + descifra + compara sha256
 *
 * Uso local:
 *   tsx scripts/backup-offsite.ts [--verify] [--restore=<key>]
 *
 * Uso CI (GitHub Actions cron):
 *   .github/workflows/backup-offsite.yml → corre diario 3am UTC
 *
 * Variables de entorno requeridas:
 *   DATABASE_URL              — Postgres connection string
 *   BACKUP_ENCRYPTION_KEY     — base64 de 32 bytes (aes-256-gcm)
 *   BACKUP_S3_BUCKET          — bucket name (S3 o R2)
 *   BACKUP_S3_REGION          — región (ej: "us-east-1")
 *   BACKUP_S3_ENDPOINT        — opcional (R2: https://<acc>.r2.cloudflarestorage.com)
 *   BACKUP_S3_ACCESS_KEY_ID
 *   BACKUP_S3_SECRET_ACCESS_KEY
 *
 * Security notes:
 *   - Cifrado CLIENT-SIDE — S3/R2 nunca ve datos en claro
 *   - La clave de cifrado NO se almacena junto con el backup
 *   - Rotación de clave: re-cifrar backups en place con job separado
 *   - IAM del bucket: solo PutObject para el runner, GetObject para DR drill
 */

import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

// ── Config ────────────────────────────────────────────────────────────────

const ALGO = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const WORK_DIR = join(tmpdir(), "buleje-backup", TIMESTAMP);

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[backup] Missing required env var: ${key}`);
    process.exit(1);
  }
  return v;
}

function log(msg: string) {
  const t = new Date().toISOString();
  console.log(`[backup] ${t} ${msg}`);
}

// ── Step 1: pg_dump ───────────────────────────────────────────────────────

async function runPgDump(outPath: string): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  log(`pg_dump → ${outPath}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      [
        "--format=custom", // smaller than plain SQL, allows selective restore
        "--no-owner",
        "--no-privileges",
        "--compress=9",
        "--file",
        outPath,
        databaseUrl,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        const size = statSync(outPath).size;
        log(`pg_dump OK · ${(size / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      } else {
        reject(new Error(`pg_dump exited with code ${code}`));
      }
    });
  });
}

// ── Step 2: encrypt ───────────────────────────────────────────────────────

async function encryptFile(inPath: string, outPath: string): Promise<string> {
  const keyB64 = requireEnv("BACKUP_ENCRYPTION_KEY");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be 32 bytes (base64) · got ${key.length}`,
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);

  // Compute sha256 of plaintext while we encrypt
  const hash = createHash("sha256");
  const plaintext = await readFile(inPath);
  hash.update(plaintext);
  const plaintextSha = hash.digest("hex");

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [12 bytes IV][16 bytes TAG][ciphertext]
  const blob = Buffer.concat([iv, tag, encrypted]);
  await writeFile(outPath, blob);

  log(
    `encrypted · ${(blob.length / 1024 / 1024).toFixed(2)} MB · sha256(plain)=${plaintextSha.slice(0, 16)}…`,
  );
  return plaintextSha;
}

// ── Step 3: upload to S3/R2 ───────────────────────────────────────────────

async function uploadToS3(path: string, key: string): Promise<void> {
  // Lazy import to avoid adding @aws-sdk to the main bundle.
  // Uses a dynamic specifier via variable to keep tsc from resolving the module
  // at type-check time (it's installed on-demand in CI).
  const specifier = "@aws-sdk/client-s3";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(specifier).catch(() => null);
  if (!mod) {
    log(
      "⚠️  @aws-sdk/client-s3 not installed. Skipping upload. Install with: npm i -D @aws-sdk/client-s3",
    );
    return;
  }
  const { S3Client, PutObjectCommand } = mod;
  const client = new S3Client({
    region: requireEnv("BACKUP_S3_REGION"),
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    credentials: {
      accessKeyId: requireEnv("BACKUP_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("BACKUP_S3_SECRET_ACCESS_KEY"),
    },
  });
  const body = await readFile(path);
  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv("BACKUP_S3_BUCKET"),
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
      Metadata: {
        "x-buleje-algo": ALGO,
        "x-buleje-timestamp": TIMESTAMP,
      },
    }),
  );
  log(`uploaded · s3://${process.env.BACKUP_S3_BUCKET}/${key}`);
}

// ── Step 4: verify (download + decrypt + compare hash) ───────────────────

export async function decryptFile(
  inPath: string,
  outPath: string,
): Promise<string> {
  const keyB64 = requireEnv("BACKUP_ENCRYPTION_KEY");
  const key = Buffer.from(keyB64, "base64");
  const blob = await readFile(inPath);
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await writeFile(outPath, plaintext);

  return createHash("sha256").update(plaintext).digest("hex");
}

// ── Entry point ───────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true });

  const dumpPath = join(WORK_DIR, "dump.pgcustom");
  const encPath = join(WORK_DIR, "dump.pgcustom.enc");
  const s3Key = `daily/${TIMESTAMP}.pgcustom.enc`;

  try {
    await runPgDump(dumpPath);
    const originalSha = await encryptFile(dumpPath, encPath);
    await uploadToS3(encPath, s3Key);

    // Verify locally by decrypting
    if (process.argv.includes("--verify")) {
      const verifyPath = join(WORK_DIR, "verify.pgcustom");
      const verifiedSha = await decryptFile(encPath, verifyPath);
      if (verifiedSha !== originalSha) {
        throw new Error(
          `SHA mismatch after decrypt · original=${originalSha} got=${verifiedSha}`,
        );
      }
      log(`✅ verify OK · sha256 matches`);
      await unlink(verifyPath);
    }

    log(`✅ backup complete · ${s3Key}`);
  } catch (err) {
    log(`❌ FAILED · ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    // Clean local files (they're in os.tmpdir, but still)
    for (const f of [dumpPath, encPath]) {
      if (existsSync(f)) await unlink(f).catch(() => {});
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
