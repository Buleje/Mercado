#!/usr/bin/env tsx
/**
 * embed-products.ts — Backfill de embeddings para Hybrid Recommender v2 (ADR-042).
 *
 * Genera embeddings OpenAI text-embedding-3-small (1536 dims) para los
 * productos activos de un tenant y los escribe en la columna `embedding`
 * (tipo pgvector). Idempotente: salta productos con embedding ya presente
 * salvo que se pase `--force`.
 *
 * Uso:
 *
 *   npx tsx scripts/embed-products.ts --tenant main
 *   npx tsx scripts/embed-products.ts --tenant main --force
 *   npx tsx scripts/embed-products.ts --tenant main --limit 50 --dry-run
 *
 * Pre-requisitos (ejecutar UNA vez en Supabase, manualmente):
 *   psql "$DIRECT_URL" -f prisma/migrations/proposed-pgvector.sql
 *
 * El script usa `DIRECT_URL` (session mode, puerto 5432) porque el pooler
 * transaccional no soporta prepared statements con el tipo vector.
 *
 * Fail-safe:
 *   - Si OPENAI_API_KEY no está configurada → exit 1 antes de tocar la DB
 *   - Si pgvector no está instalado → detecta y aborta con mensaje claro
 *   - Throttling: 20 embeddings/segundo (OpenAI rate limit free tier)
 *   - Resumable: usa `--after-id` si se cortó a mitad
 */

/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  generateEmbedding,
  toPgVectorLiteral,
  EMBEDDING_DIM,
} from "@/lib/recommender/embeddings";

// ── CLI args ─────────────────────────────────────────────────────────────────

type Args = {
  tenantId: string;
  force: boolean;
  dryRun: boolean;
  limit: number | null;
  afterId: number | null;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    tenantId: "",
    force: false,
    dryRun: false,
    limit: null,
    afterId: null,
    batchSize: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--tenant":
        out.tenantId = argv[++i] ?? "";
        break;
      case "--force":
        out.force = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--limit":
        out.limit = Number.parseInt(argv[++i] ?? "0", 10) || null;
        break;
      case "--after-id":
        out.afterId = Number.parseInt(argv[++i] ?? "0", 10) || null;
        break;
      case "--batch":
        out.batchSize = Math.max(1, Number.parseInt(argv[++i] ?? "20", 10));
        break;
      default:
        break;
    }
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ProductRow = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  hasEmbedding: boolean;
};

async function fetchProducts(
  tenantId: string,
  force: boolean,
  afterId: number | null,
  limit: number | null,
): Promise<ProductRow[]> {
  // Raw SQL for two reasons:
  //   1. Check presence of the "embedding" column without failing generation
  //   2. Return `hasEmbedding` boolean without shipping the 1536-dim payload
  const rows = await prisma.$queryRawUnsafe<ProductRow[]>(
    `
    SELECT
      id,
      name,
      category,
      description,
      (embedding IS NOT NULL) AS "hasEmbedding"
    FROM "Product"
    WHERE "tenantId" = $1
      AND active = true
      AND "deletedAt" IS NULL
      ${afterId ? "AND id > $2" : ""}
    ORDER BY id ASC
    ${limit ? (afterId ? "LIMIT $3" : "LIMIT $2") : ""}
    `,
    tenantId,
    ...(afterId ? [afterId] : []),
    ...(limit ? [limit] : []),
  );
  if (force) return rows;
  return rows.filter((r) => !r.hasEmbedding);
}

async function writeEmbedding(
  id: number,
  tenantId: string,
  vector: number[],
): Promise<void> {
  const literal = toPgVectorLiteral(vector);
  // $1::vector cast applies the pgvector conversion; $2 protects tenantId.
  await prisma.$executeRawUnsafe(
    `
    UPDATE "Product"
    SET embedding = $1::vector
    WHERE id = $3
      AND "tenantId" = $2
    `,
    literal,
    tenantId,
    id,
  );
}

async function detectVectorExtension(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS exists
    `);
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.tenantId) {
    console.error("ERROR: falta --tenant <tenantId>");
    console.error("Ejemplo: npx tsx scripts/embed-products.ts --tenant main");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY no está configurada en .env");
    process.exit(1);
  }

  console.log(`[embed-products] tenant=${args.tenantId} force=${args.force} dryRun=${args.dryRun}`);

  const hasVector = await detectVectorExtension();
  if (!hasVector) {
    console.error("ERROR: pgvector no está instalado en la DB.");
    console.error("Corré primero: psql \"$DIRECT_URL\" -f prisma/migrations/proposed-pgvector.sql");
    process.exit(2);
  }

  const products = await fetchProducts(
    args.tenantId,
    args.force,
    args.afterId,
    args.limit,
  );

  if (products.length === 0) {
    console.log("[embed-products] nada que hacer — todos los productos ya tienen embedding");
    return;
  }

  console.log(`[embed-products] ${products.length} productos a procesar`);

  let processed = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < products.length; i += args.batchSize) {
    const batch = products.slice(i, i + args.batchSize);

    const results = await Promise.all(
      batch.map(async (p) => {
        const text = [p.name, p.category ?? "", p.description ?? ""]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (text.length === 0) return { id: p.id, ok: false, reason: "empty-text" };

        const vec = await generateEmbedding(text);
        if (!vec || vec.length !== EMBEDDING_DIM) {
          return { id: p.id, ok: false, reason: "embed-failed" };
        }

        if (args.dryRun) return { id: p.id, ok: true, reason: "dry-run" };

        try {
          await writeEmbedding(p.id, args.tenantId, vec);
          return { id: p.id, ok: true, reason: "written" };
        } catch (err) {
          return {
            id: p.id,
            ok: false,
            reason: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    for (const r of results) {
      if (r.ok) processed++;
      else failed++;
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[embed-products] batch ${i / args.batchSize + 1}: +${results.filter((r) => r.ok).length} OK / ${results.filter((r) => !r.ok).length} fail (total ${processed}/${products.length} en ${elapsedSec}s)`,
    );

    // Rate-limit OpenAI free tier: ~20 req/s
    if (i + args.batchSize < products.length) await sleep(1100);
  }

  console.log(`\n[embed-products] done: ${processed} OK, ${failed} fail`);
  if (failed > 0) process.exit(3);
}

main()
  .catch((err) => {
    console.error("[embed-products] fatal error:", err);
    process.exit(99);
  })
  .finally(() => prisma.$disconnect());
