/**
 * Prisma Query Extension for Ley 29733 (Peru Data Protection) Compliance
 *
 * Intercepts ALL queries on tables containing personal data and creates
 * an immutable audit log entry with SHA-256 hash chain.
 *
 * Tables considered sensitive (contain PII per Ley 29733):
 *   Customer, Order, Sale, Fiado, FiadoCuota, Payment, SunatInvoice,
 *   SavedLocation, CustomerNotification, NotificationLog, Prestamo
 *
 * Usage:
 *   import { withComplianceAudit } from "@/lib/audit/prisma-middleware";
 *   const auditedPrisma = prisma.$extends(withComplianceAudit());
 *
 * The middleware is fire-and-forget (.catch(() => {})) to never block
 * the original query (CLAUDE.md rule #7).
 */

import { Prisma } from "@/lib/generated/prisma/client";
import { calculateHash, buildHashData } from "./hash-chain";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { getAuditContext } from "./audit-context";

/**
 * Tables that contain personal data subject to Ley 29733.
 * Any CRUD on these tables is logged to the audit chain.
 */
const SENSITIVE_MODELS = new Set([
  "Customer",
  "Order",
  "Sale",
  "Fiado",
  "FiadoCuota",
  "Payment",
  "SunatInvoice",
  "SavedLocation",
  "CustomerNotification",
  "NotificationLog",
  "Prestamo",
  "Cotizacion",
]);

/**
 * Ley 29733 art. 23-25: la norma exige registrar MODIFICACIONES sobre datos
 * personales (creación, actualización, eliminación), NO lecturas.
 * Auditar reads en storefront de alto tráfico saturaría ActivityLog con
 * entradas sin valor legal y degradaría performance.
 *
 * executeRaw/executeRawUnsafe se tratan como write porque pueden contener
 * UPDATE/DELETE/INSERT. queryRaw/queryRawUnsafe se tratan como read (pass-through).
 */
const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "executeRaw",
  "executeRawUnsafe",
]);

/** Map Prisma write operation to a human-readable action */
function resolveAction(
  operation: string,
): "CREATE" | "UPDATE" | "DELETE" | "RAW_WRITE" | null {
  if (
    operation === "create" ||
    operation === "createMany" ||
    operation === "createManyAndReturn"
  )
    return "CREATE";
  if (
    operation === "update" ||
    operation === "updateMany" ||
    operation === "upsert"
  )
    return "UPDATE";
  if (operation === "delete" || operation === "deleteMany") return "DELETE";
  if (operation === "executeRaw" || operation === "executeRawUnsafe")
    return "RAW_WRITE";
  return null;
}

/**
 * Extract tenantId from query args (where clause) if available.
 */
function extractTenantId(args: Record<string, unknown>): string | null {
  const where = args?.where as Record<string, unknown> | undefined;
  if (where?.tenantId && typeof where.tenantId === "string") {
    return where.tenantId;
  }
  const data = args?.data as Record<string, unknown> | undefined;
  if (data?.tenantId && typeof data.tenantId === "string") {
    return data.tenantId;
  }
  return null;
}

/**
 * Extract entity ID from query args.
 */
function extractEntityId(args: Record<string, unknown>): string | null {
  const where = args?.where as Record<string, unknown> | undefined;
  if (where?.id && typeof where.id === "string") return where.id;
  if (where?.phone && typeof where.phone === "string") return where.phone;
  return null;
}

/**
 * Fire-and-forget audit log writer.
 * Uses raw SQL to avoid triggering the middleware recursively.
 *
 * @param prismaClient - The raw Prisma client (not extended)
 * @param entry - Audit entry data
 */
async function writeAuditEntry(
  prismaClient: {
    $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  },
  entry: {
    action: string;
    entity: string;
    entityId: string | null;
    detail: string;
    user: string;
    tenantId: string;
    ipAddress: string | null;
    previousHash: string | null;
    hash: string;
  },
): Promise<void> {
  // Use raw SQL with positional params (CLAUDE.md rule #11) to write directly
  // to ActivityLog without triggering recursive middleware.
  // Fields: id, action, entity, entityId, detail, user, ipAddress, tenantId, createdAt
  // We store hash chain data in the detail field as JSON.
  const detailWithHash = JSON.stringify({
    originalDetail: entry.detail,
    ley29733: true,
    hash: entry.hash,
    previousHash: entry.previousHash,
  });

  const id = `cpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  await prismaClient.$queryRawUnsafe(
    `INSERT INTO "ActivityLog" ("id", "action", "entity", "entityId", "detail", "user", "ipAddress", "tenantId", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    id,
    entry.action,
    `[L29733] ${entry.entity}`,
    entry.entityId,
    detailWithHash,
    entry.user,
    entry.ipAddress,
    entry.tenantId,
  );
}

/**
 * Shared cache for the latest hash per tenant.
 *
 * Key format : `audit:lasthash:{tenantId}`
 * TTL        : 60 s (HASH_CACHE_TTL_SEC)
 * Backend    : cacheStore from lib/cache.ts
 *   - With REDIS_URL set  → RedisStore (ioredis/Upstash) — shared across ALL
 *     Vercel instances, eliminates cross-instance chain divergence.
 *   - Without REDIS_URL   → MemoryStore (single-process, safe for local dev).
 *
 * Graceful degradation: if cacheStore.get/set throws (Redis down), we log a
 * warning and fall through to DB — the chain never breaks, just one extra DB
 * read per write cycle until Redis recovers.
 */
const HASH_CACHE_TTL_SEC = 60;

function hashCacheKey(tenantId: string): string {
  return `audit:lasthash:${tenantId}`;
}

/**
 * Update the shared cache with the freshly written hash.
 * del() first to evict any stale value, then set() the fresh one.
 * Called after every successful audit INSERT.
 */
function updateHashCache(tenantId: string, newHash: string): void {
  try {
    cacheStore.del(hashCacheKey(tenantId));
    cacheStore.set(hashCacheKey(tenantId), newHash, HASH_CACHE_TTL_SEC);
  } catch (e) {
    // Non-fatal: next read falls back to DB
    logger.warn("[audit/updateHashCache] cache update failed — next read will hit DB", {
      err: e instanceof Error ? e.message : String(e),
      tenantId,
    });
  }
}

/**
 * Get the previous hash for the chain.
 * Resolution order:
 *   1. Shared cache (Redis when REDIS_URL is set, in-memory otherwise)
 *   2. DB query (source of truth — also re-populates cache on hit)
 *   3. "GENESIS" (first entry ever for this tenant)
 */
async function getPreviousHash(
  prismaClient: {
    $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  },
  tenantId: string,
): Promise<string> {
  // 1. Cache hit — synchronous, sub-millisecond
  let cached: string | null = null;
  try {
    cached = cacheStore.get<string>(hashCacheKey(tenantId));
  } catch (e) {
    logger.warn("[audit/getPreviousHash] cacheStore.get failed — falling back to DB", {
      err: e instanceof Error ? e.message : String(e),
      tenantId,
    });
  }
  if (cached !== null) return cached;

  // 2. DB fallback
  try {
    const rows = (await prismaClient.$queryRawUnsafe(
      `SELECT "detail" FROM "ActivityLog"
       WHERE "tenantId" = $1 AND "entity" LIKE '[L29733]%'
       ORDER BY "createdAt" DESC LIMIT 1`,
      tenantId,
    )) as Array<{ detail: string }>;

    if (rows.length > 0) {
      const parsed = JSON.parse(rows[0].detail) as { hash?: string };
      if (parsed.hash) {
        // Re-populate cache so subsequent reads (any instance) are fast
        try {
          cacheStore.set(hashCacheKey(tenantId), parsed.hash, HASH_CACHE_TTL_SEC);
        } catch (e) {
          logger.warn("[audit/getPreviousHash] cacheStore.set failed — cache not populated", {
            err: e instanceof Error ? e.message : String(e),
            tenantId,
          });
        }
        return parsed.hash;
      }
    }
  } catch (e) {
    logger.error(
      "getLatestHash failed — starting new chain segment",
      { err: e instanceof Error ? e.message : String(e), op: "audit/getLatestHash", tenantId },
    );
  }

  // 3. GENESIS — no prior entries for this tenant
  return "GENESIS";
}

/**
 * Prisma Client Extension that adds Ley 29733 compliance audit logging.
 *
 * Usage:
 *   import { complianceAuditExtension } from "@/lib/audit/prisma-middleware";
 *   const auditedPrisma = prisma.$extends(complianceAuditExtension);
 */
export const complianceAuditExtension = Prisma.defineExtension({
  name: "ley29733-compliance-audit",
  query: {
    $allOperations({ model, operation, args, query }) {
      // Only intercept sensitive models
      if (!model || !SENSITIVE_MODELS.has(model)) {
        return query(args);
      }

      // Early return for read operations — zero audit overhead (WRITE_OPS set above).
      // Reads no generan entrada en ActivityLog: Ley 29733 art. 23-25 solo exige
      // registrar modificaciones, no consultas. Performance overhead ≈0 (Set.has O(1)).
      if (!WRITE_OPS.has(operation)) {
        return query(args);
      }

      const action = resolveAction(operation);
      if (!action) return query(args);

      // Execute the original query first, then log asynchronously
      const resultPromise = query(args);

      // Fire-and-forget audit logging (CLAUDE.md rule #7)
      resultPromise
        .then(async (result) => {
          try {
            const typedArgs = (args ?? {}) as Record<string, unknown>;
            // FIX 2026-05-08 (audit Round 4): ?? "unknown" producía entradas
            // auditadas sin tenant real — imposible rastrear en auditoría Ley 29733.
            // Ahora: null → saltar log + warning para que el caller lo corrija.
            // Queries con tenantId explícito (mayoría) no se ven afectadas.
            const resolvedTenantId = extractTenantId(typedArgs);
            if (!resolvedTenantId) {
              logger.warn("audit: tenantId ausente en query sensible — entry omitida", {
                op: "audit/complianceExtension",
                model,
                operation,
              });
              return;
            }
            const tenantId = resolvedTenantId;
            const entityId = extractEntityId(typedArgs);

            // Build detail string
            const detail = `${action} on ${model}${entityId ? ` (${entityId})` : ""}`;

            // Get previous hash and compute new one
            // We need to access the raw client — use globalThis
            const globalPrisma = (
              globalThis as unknown as {
                prisma?: {
                  $queryRawUnsafe: (
                    query: string,
                    ...values: unknown[]
                  ) => Promise<unknown>;
                };
              }
            ).prisma;

            if (!globalPrisma) return;

            const previousHash = await getPreviousHash(
              globalPrisma,
              tenantId,
            );

            const entryData = {
              action,
              entity: model,
              entityId,
              detail,
              // Round 9 fix M004: lee actor + IP del AsyncLocalStorage si el
              // handler usó runWithAuditContext(req, userId, fn). Fallback a
              // "system"/null para handlers no migrados (sin crash).
              user: getAuditContext()?.userId ?? "system",
              tenantId,
              createdAt: new Date(),
            };

            const hashData = buildHashData(entryData);
            const hash = calculateHash(hashData, previousHash);

            // Update shared cache (del stale + set fresh) so THIS instance and
            // all other Vercel instances see the new hash on the next write.
            updateHashCache(tenantId, hash);

            await writeAuditEntry(globalPrisma, {
              ...entryData,
              ipAddress: getAuditContext()?.ipAddress ?? null,
              previousHash,
              hash,
            });
          } catch (e) {
            // Never let audit logging crash the application
            logger.error(
              "writeAuditEntry failed — audit entry lost",
              { err: e instanceof Error ? e.message : String(e), op: "audit/writeAuditEntry" },
            );
          }

          return result;
        })
        .catch(() => {});

      return resultPromise;
    },
  },
});
