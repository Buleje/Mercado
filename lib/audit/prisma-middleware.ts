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

/** Map Prisma operation to a human-readable action */
function resolveAction(
  operation: string,
): "READ" | "CREATE" | "UPDATE" | "DELETE" | null {
  if (
    operation === "findMany" ||
    operation === "findFirst" ||
    operation === "findUnique" ||
    operation === "findFirstOrThrow" ||
    operation === "findUniqueOrThrow" ||
    operation === "count" ||
    operation === "aggregate" ||
    operation === "groupBy"
  ) {
    return "READ";
  }
  if (operation === "create" || operation === "createMany") return "CREATE";
  if (
    operation === "update" ||
    operation === "updateMany" ||
    operation === "upsert"
  ) {
    return "UPDATE";
  }
  if (operation === "delete" || operation === "deleteMany") return "DELETE";
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
 * In-memory cache for the latest hash per tenant.
 * This avoids a DB query on every single operation.
 * The cache is process-scoped (reset on cold start).
 */
const latestHashCache = new Map<string, string>();

/**
 * Get the previous hash for the chain. First checks in-memory cache,
 * then falls back to a DB query for the latest entry.
 */
async function getPreviousHash(
  prismaClient: {
    $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  },
  tenantId: string,
): Promise<string> {
  const cached = latestHashCache.get(tenantId);
  if (cached) return cached;

  try {
    const rows = (await prismaClient.$queryRawUnsafe(
      `SELECT "detail" FROM "ActivityLog"
       WHERE "tenantId" = $1 AND "entity" LIKE '[L29733]%'
       ORDER BY "createdAt" DESC LIMIT 1`,
      tenantId,
    )) as Array<{ detail: string }>;

    if (rows.length > 0) {
      const parsed = JSON.parse(rows[0].detail) as {
        hash?: string;
      };
      if (parsed.hash) {
        latestHashCache.set(tenantId, parsed.hash);
        return parsed.hash;
      }
    }
  } catch (e) {
    logger.error(
      "getLatestHash failed — starting new chain segment",
      { err: e instanceof Error ? e.message : String(e), op: "audit/getLatestHash", tenantId },
    );
  }

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

      const action = resolveAction(operation);
      if (!action) return query(args);

      // Execute the original query first, then log asynchronously
      const resultPromise = query(args);

      // Fire-and-forget audit logging (CLAUDE.md rule #7)
      resultPromise
        .then(async (result) => {
          try {
            const typedArgs = (args ?? {}) as Record<string, unknown>;
            const tenantId = extractTenantId(typedArgs) ?? "unknown";
            const entityId = extractEntityId(typedArgs);

            // Build detail string
            const detail =
              action === "READ"
                ? `Queried ${model}`
                : `${action} on ${model}${entityId ? ` (${entityId})` : ""}`;

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
              user: "system",
              tenantId,
              createdAt: new Date(),
            };

            const hashData = buildHashData(entryData);
            const hash = calculateHash(hashData, previousHash);

            // Update cache
            latestHashCache.set(tenantId, hash);

            await writeAuditEntry(globalPrisma, {
              ...entryData,
              ipAddress: null,
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
