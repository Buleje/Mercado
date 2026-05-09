/**
 * scripts/backup-fetch.ts
 *
 * Round 15 (2026-05-09) — desbloquea DR drill local.
 *
 * Inverso de scripts/backup-offsite.ts:
 *   1. Lista objects en BACKUP_S3_BUCKET (más recientes primero)
 *   2. Descarga el último (o uno específico via --key=)
 *   3. Descifra AES-256-GCM con BACKUP_ENCRYPTION_KEY
 *   4. Guarda en backups/db/{TIMESTAMP}.dump
 *
 * El skill /dr-drill puede consumir este path directamente.
 *
 * Uso:
 *   tsx scripts/backup-fetch.ts                  → descarga el más reciente
 *   tsx scripts/backup-fetch.ts --key=YYYY-MM-DD → descarga uno específico
 *   tsx scripts/backup-fetch.ts --list           → solo lista, no descarga
 *
 * ENV requeridas:
 *   BACKUP_ENCRYPTION_KEY (base64 AES-256)
 *   BACKUP_S3_BUCKET, BACKUP_S3_REGION
 *   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
 *   BACKUP_S3_ENDPOINT (opcional, R2)
 *
 * Cron sugerido (lunes 5am UTC, antes del DR drill semanal):
 *   0 5 * * 1 cd /var/buleje && tsx scripts/backup-fetch.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createDecipheriv } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGO = "aes-256-gcm";
const LOCAL_DIR = "backups/db";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[backup-fetch] Missing env var: ${key}`);
    process.exit(1);
  }
  return v;
}

function log(msg: string): void {
  console.log(`[backup-fetch] ${new Date().toISOString()} ${msg}`);
}

async function getS3Client() {
  const specifier = "@aws-sdk/client-s3";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(specifier).catch(() => null);
  if (!mod) {
    console.error("[backup-fetch] @aws-sdk/client-s3 no instalado. Run: npm i -D @aws-sdk/client-s3");
    process.exit(1);
  }
  const client = new mod.S3Client({
    region: requireEnv("BACKUP_S3_REGION"),
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    credentials: {
      accessKeyId: requireEnv("BACKUP_S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("BACKUP_S3_SECRET_ACCESS_KEY"),
    },
  });
  return { client, ListObjectsV2Command: mod.ListObjectsV2Command, GetObjectCommand: mod.GetObjectCommand };
}

interface BackupObject {
  key: string;
  lastModified: Date;
  size: number;
}

async function listBackups(): Promise<BackupObject[]> {
  const { client, ListObjectsV2Command } = await getS3Client();
  const out = await client.send(
    new ListObjectsV2Command({
      Bucket: requireEnv("BACKUP_S3_BUCKET"),
      Prefix: "buleje-backup-",
      MaxKeys: 50,
    }),
  );
  const items: BackupObject[] = (out.Contents ?? []).map((obj: { Key?: string; LastModified?: Date; Size?: number }) => ({
    key: obj.Key ?? "",
    lastModified: obj.LastModified ?? new Date(0),
    size: obj.Size ?? 0,
  }));
  // Más reciente primero
  items.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return items;
}

async function downloadAndDecrypt(key: string): Promise<string> {
  const { client, GetObjectCommand } = await getS3Client();
  log(`fetching s3://${process.env.BACKUP_S3_BUCKET}/${key}`);
  const out = await client.send(
    new GetObjectCommand({
      Bucket: requireEnv("BACKUP_S3_BUCKET"),
      Key: key,
    }),
  );
  // Body es Readable stream — convertir a Buffer
  const chunks: Buffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = out.Body as any;
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const blob = Buffer.concat(chunks);
  log(`downloaded ${blob.length} bytes`);

  // Decrypt
  const keyB64 = requireEnv("BACKUP_ENCRYPTION_KEY");
  const aesKey = Buffer.from(keyB64, "base64");
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, aesKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  log(`decrypted ${plaintext.length} bytes`);

  // Save local
  const filename = key.replace(/^.*\//, "").replace(/\.enc$/, "") + ".dump";
  const dest = join(LOCAL_DIR, filename);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, plaintext);
  log(`saved → ${dest}`);
  return dest;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const keyArg = args.find((a) => a.startsWith("--key="))?.slice(6);

  const items = await listBackups();
  if (items.length === 0) {
    log("⚠️  No backups encontrados en S3/R2. Verifica BACKUP_S3_BUCKET.");
    process.exit(1);
  }

  if (listOnly) {
    console.log(`\n=== ${items.length} backups disponibles ===`);
    for (const item of items.slice(0, 20)) {
      const ageDays = Math.floor((Date.now() - item.lastModified.getTime()) / 86400000);
      const sizeMB = (item.size / 1024 / 1024).toFixed(2);
      console.log(`  ${item.lastModified.toISOString()} (${ageDays}d ago) — ${sizeMB} MB — ${item.key}`);
    }
    return;
  }

  const target = keyArg ? items.find((i) => i.key.includes(keyArg)) : items[0];
  if (!target) {
    log(`⚠️  No se encontró backup con key=${keyArg}`);
    process.exit(1);
  }

  await downloadAndDecrypt(target.key);
  log(`✅ Backup local listo. Correr: /dr-drill latest`);
}

main().catch((err) => {
  log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
